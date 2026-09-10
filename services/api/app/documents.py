import io
import re
import zipfile

from docx import Document as Docx
from pptx import Presentation
from pypdf import PdfReader

from . import ai, storage
from .models import BookSection, Chunk, Topic

HEADING = re.compile(r"^(?:(?:chương|chapter|phần|part)\s+[\divxlc]+\b|\d+(?:\.\d+){1,4}\s+)", re.I)


def suggest_sections(data, pages):
    reader = PdfReader(io.BytesIO(data))
    entries = []

    def visit(outline, level=1):
        for item in outline:
            if isinstance(item, list):
                visit(item, min(level + 1, 6))
            else:
                page = reader.get_destination_page_number(item)
                if page is not None and 0 <= page < len(pages):
                    entries.append((page + 1, str(item.title)[:300], level, "BOOKMARK"))

    visit(reader.outline)
    if not entries:
        for page, content in pages:
            for line in content.splitlines():
                line = line.strip()
                if len(line) <= 200 and HEADING.match(line) and not re.search(r"\.{3,}\s*\d+$", line):
                    entries.append((page, line, 2 if re.match(r"\d+\.", line) else 1, "HEADING"))
    if not entries:
        entries = [(1, "Toàn bộ giáo trình — hãy chia chương theo mục lục", 1, "FALLBACK")]
    entries = sorted(set(entries), key=lambda row: (row[0], row[2]))[:500]
    sections = []
    for i, (page, title, level, source) in enumerate(entries):
        next_page = next((e[0] for e in entries[i + 1 :] if e[2] <= level and e[0] > page), len(pages) + 1)
        sections.append(
            dict(title=title, level=level, start_page=page, end_page=next_page - 1, source=source)
        )
    return sections


def extract(data: bytes, filename: str):
    extension = filename.rsplit(".", 1)[-1].lower()
    if extension in {"docx", "pptx"}:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if sum(i.file_size for i in archive.infolist()) > 100 * 1024 * 1024:
                raise ValueError("Tài liệu giải nén quá lớn")
    stream = io.BytesIO(data)
    if extension == "pdf":
        if not data.startswith(b"%PDF-"):
            raise ValueError("PDF không hợp lệ")
        return [(i + 1, page.extract_text() or "") for i, page in enumerate(PdfReader(stream).pages)]
    if extension == "pptx":
        return [
            (i + 1, "\n\n".join(shape.text for shape in slide.shapes if shape.has_text_frame))
            for i, slide in enumerate(Presentation(stream).slides)
        ]
    if extension == "docx":
        doc = Docx(stream)
        return [
            (
                1,
                "\n\n".join(
                    [p.text for p in doc.paragraphs]
                    + [" | ".join(c.text for c in row.cells) for t in doc.tables for row in t.rows]
                ),
            )
        ]
    if extension == "txt":
        return [(1, data.decode("utf-8"))]
    raise ValueError("Chỉ hỗ trợ PDF, PPTX, DOCX và TXT UTF-8")


def chunk_text(text, limit=2400):
    buffer = ""
    for paragraph in text.split("\n\n"):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if len(buffer) + len(paragraph) > limit and buffer:
            yield buffer
            buffer = ""
        while len(paragraph) > limit:
            cut = paragraph.rfind(" ", 0, limit)
            cut = cut if cut > 0 else limit
            yield paragraph[:cut]
            paragraph = paragraph[cut:].strip()
        buffer += ("\n\n" if buffer else "") + paragraph
    if buffer:
        yield buffer


def process_document(db, document):
    document.embedding_model = ai.embedding_name()
    topic = db.get(Topic, document.topic_id) if document.topic_id else None
    raw = storage.get(document.storage_key)
    pages = extract(raw, document.filename)
    document.page_count = len(pages)
    sections = []
    if document.kind == "TEXTBOOK":
        sections = suggest_sections(raw, pages)
        db.add_all(BookSection(course_id=document.course_id, document_id=document.id, **s) for s in sections)
    chunks = []
    for page, text in pages:
        default_heading = " / ".join(s["title"] for s in sections if s["start_page"] <= page <= s["end_page"])
        for heading, content in heading_chunks(text, default_heading):
            chunks.append(
                Chunk(
                    document_id=document.id,
                    course_id=document.course_id,
                    topic_id=document.topic_id,
                    learning_outcome_id=topic.learning_outcome_id if topic else None,
                    heading=heading or None,
                    page=page,
                    content=content,
                    embedding=ai.embed(content),
                )
            )
            if len(chunks) > 2000:
                raise ValueError("MVP giới hạn 2000 chunks mỗi tài liệu")
    if not chunks:
        raise ValueError("Không tìm thấy văn bản; PDF scan cần OCR trước khi upload")
    db.add_all(chunks)
    document.status = "READY"


def heading_chunks(text, default_heading=""):
    """Keep recognizable numbered headings as boundaries, even within the same page."""
    heading, lines = default_heading, []
    for line in text.splitlines():
        if len(line.strip()) <= 200 and HEADING.match(line.strip()):
            for content in chunk_text("\n".join(lines)):
                yield heading, content
            heading, lines = line.strip(), []
        lines.append(line)
    for content in chunk_text("\n".join(lines)):
        yield heading, content
