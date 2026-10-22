"use client";
import { useRef, useState } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import type { RichContent } from "./question-content";
import { errorText } from "./api";

async function embeddedImage(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10_000_000
  )
    throw new Error("Chọn ảnh PNG, JPEG hoặc WebP không quá 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không thể xử lý ảnh.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5, 0.3]) {
      const src = canvas.toDataURL("image/jpeg", quality);
      if (src.length <= 400_023) return src;
    }
    throw new Error("Ảnh quá nhiều chi tiết; hãy chọn ảnh nhỏ hơn.");
  } finally {
    bitmap.close();
  }
}

export default function QuestionEditor({
  text,
  content,
  onChange,
  onBusy,
}: {
  text: string;
  content?: RichContent | null;
  onChange: (text: string, content: RichContent) => void;
  onBusy: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        trailingNode: false,
      }),
      ImageExtension.configure({ allowBase64: true }),
    ],
    immediatelyRender: false,
    content: (content as JSONContent) || {
      type: "doc",
      content: text.split("\n").map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : [],
      })),
    },
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Nội dung câu hỏi",
        "aria-multiline": "true",
        class: "question-editor-document",
      },
      // Only the image picker embeds files. Pasted HTML cannot introduce remote images.
      transformPastedHTML: (html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        doc
          .querySelectorAll("img,script,style,iframe,object,svg")
          .forEach((node) => node.remove());
        return doc.body.innerHTML;
      },
      handleDrop: (_view, event) => {
        if (event.dataTransfer?.files.length) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) =>
      onChange(
        editor.getText({ blockSeparator: "\n" }),
        editor.getJSON() as RichContent,
      ),
  });
  async function insertImage(file: File) {
    if (!editor) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      let count = 0;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "image") count++;
      });
      if (count >= 4) throw new Error("Tối đa 4 ảnh mỗi câu hỏi.");
      const src = await embeddedImage(file);
      editor
        .chain()
        .focus()
        .setTextSelection(editor.state.selection.to)
        .setImage({ src, alt: file.name.slice(0, 300) })
        .run();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="question-editor">
      <div
        className="question-editor-toolbar"
        role="toolbar"
        aria-label="Định dạng câu hỏi"
      >
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <strong>Đậm</strong>
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <em>Nghiêng</em>
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <u>Gạch chân</u>
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          Tiêu đề
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          Danh sách
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          Đánh số
        </button>
        <button
          type="button"
          disabled={!editor || busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Đang xử lý ảnh…" : "Chèn ảnh"}
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          Hoàn tác
        </button>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        aria-label="Chọn ảnh câu hỏi"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void insertImage(file);
        }}
      />
      <EditorContent editor={editor} />
      <small>
        10–4000 ký tự; tối đa 4 ảnh. Ảnh được thu nhỏ và nén trước khi lưu.
      </small>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
