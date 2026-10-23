import type { ReactNode } from "react";

export type RichContent = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  content?: RichContent[];
};

// Render only known elements and embedded raster images; never render stored HTML.
function renderNode(node: RichContent, key: number): ReactNode {
  const children = node.content?.map(renderNode);
  switch (node.type) {
    case "doc":
      return <div key={key}>{children}</div>;
    case "paragraph":
      return <p key={key}>{children?.length ? children : <br />}</p>;
    case "heading":
      return node.attrs?.level === 3 ? (
        <h3 key={key}>{children}</h3>
      ) : (
        <h2 key={key}>{children}</h2>
      );
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={Number(node.attrs?.start) || 1}>
          {children}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children}</li>;
    case "hardBreak":
      return <br key={key} />;
    case "image": {
      const src = String(node.attrs?.src || "");
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src))
        return null;
      // Embedded, bounded question images need no remote optimizer.
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={src}
          alt={String(node.attrs?.alt || "Hình minh họa câu hỏi")}
        />
      );
    }
    case "text": {
      let text: ReactNode = node.text;
      for (const mark of node.marks || []) {
        if (mark.type === "bold") text = <strong>{text}</strong>;
        if (mark.type === "italic") text = <em>{text}</em>;
        if (mark.type === "underline") text = <u>{text}</u>;
      }
      return <span key={key}>{text}</span>;
    }
    default:
      return null;
  }
}
export function QuestionContent({
  text,
  content,
}: {
  text: string;
  content?: RichContent | null;
}) {
  return (
    <div className="question-content">
      {content ? (
        renderNode(content, 0)
      ) : (
        <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
      )}
    </div>
  );
}
