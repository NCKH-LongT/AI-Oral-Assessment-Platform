// Keep older verbose assessments readable without changing the stored feedback.
export default function RubricNote({
  text,
  limit = 180,
}: {
  text?: string | null;
  limit?: number;
}) {
  const compact = (text || "").trim().replace(/\s+/g, " ");
  if (!compact) return null;
  if (compact.length <= limit) return <p>{text}</p>;
  const prefix = compact.slice(0, limit);
  const boundary = prefix.lastIndexOf(" ");
  const preview = boundary > 0 ? prefix.slice(0, boundary) : prefix;
  return (
    <details>
      <summary>
        {preview}… <span className="muted">Xem đầy đủ</span>
      </summary>
      <p>{text}</p>
    </details>
  );
}
