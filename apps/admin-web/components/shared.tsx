"use client";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { errorText } from "./api";
const labels: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  ARCHIVED: "Đã lưu trữ",
  DRAFT: "Bản nháp",
  PUBLISHED: "Đã công bố",
  READY: "Sẵn sàng",
  PENDING: "Đang xử lý",
  FAILED: "Có lỗi",
  ASSIGNED: "Được giao",
  DEVICE_CHECK: "Kiểm tra thiết bị",
  IN_PROGRESS: "Đang thi",
  SUBMITTED: "Đang chấm",
  COMPLETED: "Hoàn thành",
  REVIEW_REQUIRED: "Cần xem lại",
  GRADED: "Đã xử lý",
};
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      {labels[status] || status}
    </span>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Action({
  children,
  action,
  className = "button",
  disabled = false,
}: {
  children: React.ReactNode;
  action: () => Promise<unknown>;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span className="action-wrap">
      <button
        type="button"
        className={className}
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await action();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <LoaderCircle size={15} className="spin" />}
        {children}
      </button>
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
    </span>
  );
}
export function Form({
  onSubmit,
  children,
  label = "Lưu",
  className = "form",
}: {
  onSubmit: (data: FormData) => Promise<unknown>;
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setError("");
        try {
          await onSubmit(new FormData(form));
          form.reset();
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={busy} className="button" type="submit">
        {busy ? (
          <>
            <LoaderCircle className="spin" size={16} />
            Đang xử lý…
          </>
        ) : (
          label
        )}
      </button>
    </form>
  );
}
export function Field({
  label,
  name,
  type = "text",
  required = true,
  defaultValue,
  placeholder,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        max={max}
      />
    </label>
  );
}
