"use client";
import type { Criterion } from "./api";

export default function CriterionEditor({
  criteria,
  disabled,
  onChange,
}: {
  criteria: Criterion[];
  disabled: boolean;
  onChange: (value: Criterion[]) => void;
}) {
  function patch(index: number, value: Partial<Criterion>) {
    onChange(
      criteria.map((item, i) => (i === index ? { ...item, ...value } : item)),
    );
  }
  return (
    <>
      {criteria.map((criterion, index) => (
        <fieldset key={index} disabled={disabled}>
          <legend>Tiêu chí {index + 1}</legend>
          <label>
            Tên
            <input
              required
              maxLength={100}
              value={criterion.name}
              onChange={(e) => patch(index, { name: e.target.value })}
            />
          </label>
          <label>
            Mô tả mức điểm
            <textarea
              required
              maxLength={3000}
              value={criterion.description}
              onChange={(e) => patch(index, { description: e.target.value })}
            />
          </label>
          <div className="inline">
            <label>
              Điểm tối đa
              <input
                required
                type="number"
                min="0.000001"
                max="100"
                step="any"
                value={criterion.max_score}
                onChange={(e) =>
                  patch(index, { max_score: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Trọng số
              <input
                required
                type="number"
                min="0.000001"
                max="100"
                step="any"
                value={criterion.weight}
                onChange={(e) =>
                  patch(index, { weight: Number(e.target.value) })
                }
              />
            </label>
          </div>
          {!disabled && (
            <button
              type="button"
              className="button ghost"
              disabled={criteria.length <= 1}
              onClick={() => onChange(criteria.filter((_, i) => i !== index))}
            >
              Xóa tiêu chí {index + 1}
            </button>
          )}
        </fieldset>
      ))}
      {!disabled && (
        <button
          type="button"
          className="button secondary"
          disabled={criteria.length >= 20}
          onClick={() =>
            onChange([
              ...criteria,
              { name: "", description: "", max_score: 1, weight: 1 },
            ])
          }
        >
          Thêm tiêu chí
        </button>
      )}
    </>
  );
}
