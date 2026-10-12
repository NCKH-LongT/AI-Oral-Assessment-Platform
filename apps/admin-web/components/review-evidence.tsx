"use client";

import { useState } from "react";
import type { Review } from "./api";

type Evidence = Review["attempts"][number]["evidence"][number];

export default function ReviewEvidence({
  evidence,
  kind,
}: {
  evidence: Evidence[];
  kind: "AUDIO" | "VIDEO" | "SCREEN";
}) {
  const [selectedId, setSelectedId] = useState("");
  const files = evidence.filter((file) => file.kind === kind);
  const selected = files.find((file) => file.id === selectedId) || files[0];
  if (!selected) return null;
  const label =
    kind === "SCREEN"
      ? "Bản ghi màn hình toàn bài"
      : kind === "VIDEO"
        ? "Camera câu trả lời"
        : "Âm thanh câu trả lời";

  return (
    <div className="media-grid">
      {files.length > 1 ? (
        <label>
          {label} · {files.length} {kind === "SCREEN" ? "đoạn" : "bản ghi"}
          <select
            value={selected.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {files.map((file, index) => (
              <option key={file.id} value={file.id}>
                {kind === "SCREEN" ? "Đoạn" : "Bản ghi"} {index + 1}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted">{label}</p>
      )}
      {kind === "AUDIO" ? (
        <audio
          key={selected.id}
          aria-label={label}
          controls
          preload="none"
          src={`/api/evidence/${selected.id}/content`}
        />
      ) : (
        <video
          key={selected.id}
          aria-label={label}
          controls
          playsInline
          preload="none"
          src={`/api/evidence/${selected.id}/content`}
        />
      )}
    </div>
  );
}
