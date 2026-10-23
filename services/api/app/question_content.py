"""Bounded rich question documents. Never accept HTML or fetch external images."""

import base64
import binascii
import json

MAX_IMAGE_BYTES = 300_000
MAX_DOCUMENT_BYTES = 1_700_000


def validate_content(value):
    if value is None:
        return None
    if not isinstance(value, dict) or len(json.dumps(value).encode()) > MAX_DOCUMENT_BYTES:
        raise ValueError("Nội dung câu hỏi quá lớn")
    count, images = 0, 0
    children = {
        "doc": {"paragraph", "heading", "bulletList", "orderedList", "image"},
        "paragraph": {"text", "hardBreak"},
        "heading": {"text", "hardBreak"},
        "bulletList": {"listItem"},
        "orderedList": {"listItem"},
        "listItem": {"paragraph", "bulletList", "orderedList"},
        "text": set(),
        "hardBreak": set(),
        "image": set(),
    }

    def walk(node, depth=0):
        nonlocal count, images
        count += 1
        if depth > 12 or count > 2000 or not isinstance(node, dict):
            raise ValueError("Cấu trúc câu hỏi không hợp lệ")
        kind = node.get("type")
        if (
            not isinstance(kind, str)
            or kind not in children
            or set(node) - {"type", "content", "attrs", "text", "marks"}
        ):
            raise ValueError("Định dạng câu hỏi không hỗ trợ")
        attrs = node.get("attrs") or {}
        if not isinstance(attrs, dict):
            raise ValueError("Thuộc tính không hợp lệ")
        allowed_attrs = {
            "heading": {"level"},
            "orderedList": {"start", "type"},
            "image": {"src", "alt", "title", "width", "height"},
        }.get(kind, set())
        if set(attrs) - allowed_attrs:
            raise ValueError("Thuộc tính không hỗ trợ")
        if kind == "heading" and attrs.get("level") not in (2, 3):
            raise ValueError("Chỉ hỗ trợ tiêu đề cấp 2/3")
        if kind == "orderedList" and (
            type(attrs.get("start", 1)) is not int
            or not 1 <= attrs.get("start", 1) <= 1000
            or attrs.get("type") not in (None, "1")
        ):
            raise ValueError("Danh sách không hợp lệ")
        if kind == "image":
            images += 1
            src = attrs.get("src", "")
            if images > 4 or not isinstance(src, str):
                raise ValueError("Tối đa 4 ảnh mỗi câu")
            prefix, _, encoded = src.partition(",")
            if prefix not in {"data:image/png;base64", "data:image/jpeg;base64", "data:image/webp;base64"}:
                raise ValueError("Ảnh phải là PNG, JPEG hoặc WebP được nhúng")
            try:
                raw = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error):
                raise ValueError("Ảnh không hợp lệ") from None
            signatures = {
                "data:image/png;base64": raw.startswith(b"\x89PNG\r\n\x1a\n"),
                "data:image/jpeg;base64": raw.startswith(b"\xff\xd8\xff"),
                "data:image/webp;base64": raw.startswith(b"RIFF") and raw[8:12] == b"WEBP",
            }
            if not raw or len(raw) > MAX_IMAGE_BYTES or not signatures[prefix]:
                raise ValueError("Ảnh không hợp lệ hoặc vượt 300 KB")
            for key in ("alt", "title"):
                if attrs.get(key) is not None and (not isinstance(attrs[key], str) or len(attrs[key]) > 300):
                    raise ValueError("Mô tả ảnh tối đa 300 ký tự")
            for key in ("width", "height"):
                if attrs.get(key) is not None and (
                    type(attrs[key]) is not int or not 1 <= attrs[key] <= 1600
                ):
                    raise ValueError("Kích thước ảnh không hợp lệ")
        if kind == "text":
            if not isinstance(node.get("text"), str) or not node["text"] or len(node["text"]) > 4000:
                raise ValueError("Văn bản không hợp lệ")
        elif "text" in node:
            raise ValueError("Văn bản phải thuộc node text")
        marks = node.get("marks", [])
        if not isinstance(marks, list) or len(marks) > 3 or (marks and kind != "text"):
            raise ValueError("Định dạng chữ không hợp lệ")
        if any(
            not isinstance(m, dict)
            or set(m) != {"type"}
            or not isinstance(m["type"], str)
            or m["type"] not in {"bold", "italic", "underline"}
            for m in marks
        ):
            raise ValueError("Chỉ hỗ trợ đậm, nghiêng và gạch chân")
        nested = node.get("content", [])
        if not isinstance(nested, list):
            raise ValueError("Nội dung không hợp lệ")
        for child in nested:
            if (
                not isinstance(child, dict)
                or not isinstance(child.get("type"), str)
                or child["type"] not in children[kind]
            ):
                raise ValueError("Cấu trúc đoạn/danh sách không hợp lệ")
            walk(child, depth + 1)

    if value.get("type") != "doc":
        raise ValueError("Cần tài liệu câu hỏi")
    walk(value)
    text = content_text(value)
    if not 10 <= len(text) <= 4000:
        raise ValueError("Nội dung chữ câu hỏi cần từ 10 đến 4000 ký tự")
    return value


def content_text(node):
    kind = node.get("type")
    if kind == "text":
        return node["text"]
    if kind == "hardBreak":
        return "\n"
    if kind == "image":
        return ""
    separator = "" if kind in {"paragraph", "heading"} else "\n"
    text = separator.join(content_text(child) for child in node.get("content", []))
    return text.strip() if separator else text
