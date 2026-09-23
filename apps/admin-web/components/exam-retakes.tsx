"use client";
import { useState } from "react";
import { send, type Result } from "./api";
import { Action, Field, Form } from "./shared";

export function AttemptLimitFields({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <div className="form-grid">
      <label>
        Cho phép làm lại
        <select
          value={
            value === null ? "unlimited" : value === 1 ? "none" : "limited"
          }
          onChange={(e) =>
            onChange(
              e.target.value === "unlimited"
                ? null
                : e.target.value === "none"
                  ? 1
                  : 2,
            )
          }
        >
          <option value="none">Không cho làm lại</option>
          <option value="limited">Giới hạn số lần làm lại</option>
          <option value="unlimited">Không giới hạn</option>
        </select>
      </label>
      {value !== null && value > 1 && (
        <label>
          Số lần làm lại
          <input
            type="number"
            min={1}
            max={1000}
            required
            defaultValue={value - 1}
            onChange={(e) => {
              if (e.target.validity.valid) onChange(Number(e.target.value) + 1);
            }}
          />
        </label>
      )}
    </div>
  );
}
export function AttemptPolicy({
  examId,
  initial,
  saved,
}: {
  examId: string;
  initial: number | null;
  saved: () => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState("");
  return (
    <details>
      <summary>Cấu hình số lần làm lại</summary>
      <Form
        label="Lưu số lần làm lại"
        onSubmit={async () => {
          await send(
            `/admin/exams/${examId}/attempt-policy`,
            { max_attempts: value },
            "PUT",
          );
          await saved();
          setMessage("Đã lưu số lần làm lại.");
        }}
      >
        <AttemptLimitFields value={value} onChange={setValue} />
        <p className="muted">
          Không tính lần thi đầu tiên. Ví dụ cho làm lại 1 lần nghĩa là tổng
          cộng 2 lượt. Thay đổi không xóa kết quả hoặc dừng lần thi đang làm.
        </p>
      </Form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
export function ResultActions({
  result,
  refresh,
  deleted,
}: {
  result: Result;
  refresh: () => Promise<unknown>;
  deleted: () => Promise<unknown>;
}) {
  const [message, setMessage] = useState("");
  return (
    <details>
      <summary>Quản lý lượt thi</summary>
      <p className="muted">
        {result.max_attempts === null
          ? "Làm lại không giới hạn"
          : `Còn ${result.remaining_attempts ?? 0} lượt`}
        . Mỗi lần làm giữ kết quả riêng.
      </p>
      {result.max_attempts !== null && (
        <Form
          label="Cấp thêm lượt"
          onSubmit={async (d) => {
            const count = Number(d.get("additional_attempts"));
            await send(`/admin/results/${result.id}/retake`, {
              additional_attempts: count,
            });
            await refresh();
            setMessage(
              `Đã cấp thêm ${count} lượt. Sinh viên mở lại danh sách bài thi để làm lại.`,
            );
          }}
        >
          <Field
            label="Số lượt cấp thêm"
            name="additional_attempts"
            type="number"
            min={1}
            max={1000}
            defaultValue={1}
          />
        </Form>
      )}
      {message && <p role="status">{message}</p>}
      <Action
        className="text-button danger"
        action={async () => {
          if (
            !window.confirm(
              `Xóa lần thi ${result.attempt_number ?? 1} của ${result.student_name} trong “${result.exam_name}”? Transcript, điểm và media của lần này sẽ bị xóa, không thể khôi phục. Lần này không còn tính vào số lượt đã dùng.`,
            )
          )
            return;
          await send(`/admin/results/${result.id}`, undefined, "DELETE");
          await deleted();
        }}
      >
        Xóa lần thi này
      </Action>
    </details>
  );
}
