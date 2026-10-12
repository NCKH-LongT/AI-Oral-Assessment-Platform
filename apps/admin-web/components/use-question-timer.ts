"use client";
import { useEffect, useRef, useState } from "react";
import { send, errorText } from "./api";

export type QuestionClock = {
  server_time: number;
  ready_at: number | null;
  recording_deadline: number | null;
};

export function useQuestionTimer({
  id,
  enabled,
  canRecord,
  recording,
  hasAnswer,
  start,
  end,
}: {
  id?: string;
  enabled: boolean;
  canRecord: boolean;
  recording: boolean;
  hasAnswer: boolean;
  start: () => Promise<QuestionClock | undefined>;
  end: () => void;
}) {
  const [clock, setClock] = useState<{
    id: string;
    ready: number;
    deadline: number | null;
  } | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const attempted = useRef("");
  const callbacks = useRef({ canRecord, recording, hasAnswer, start, end });
  useEffect(() => {
    callbacks.current = { canRecord, recording, hasAnswer, start, end };
  });
  useEffect(() => {
    if (!enabled || !id) return;
    let active = true;
    attempted.current = "";
    void send<QuestionClock>(`/question-attempts/${id}/prepare`)
      .then((result) => {
        if (!active) return;
        const offset = Date.now() - result.server_time * 1000;
        setClock({
          id,
          ready: (result.ready_at ?? result.server_time) * 1000 + offset,
          deadline:
            result.recording_deadline == null
              ? null
              : result.recording_deadline * 1000 + offset,
        });
        setError("");
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [id, enabled, revision]);
  useEffect(() => {
    if (!enabled || !id || clock?.id !== id) return;
    let active = true;
    const tick = () => {
      const c = callbacks.current;
      const now = Date.now();
      const target = clock.deadline ?? clock.ready;
      setSeconds(Math.max(0, Math.ceil((target - now) / 1000)));
      if (c.recording && clock.deadline != null && now >= clock.deadline) {
        c.end();
        return;
      }
      if (
        c.recording ||
        c.hasAnswer ||
        !c.canRecord ||
        attempted.current === id ||
        now < clock.ready
      )
        return;
      if (clock.deadline != null && now >= clock.deadline) {
        attempted.current = id;
        setError(
          "Đã hết thời gian trả lời. Bản ghi đang có vẫn được giữ để nộp; nếu mất bản ghi, hãy báo giảng viên.",
        );
        return;
      }
      attempted.current = id;
      void c
        .start()
        .then((result) => {
          if (!active || !result) return;
          const offset = Date.now() - result.server_time * 1000;
          setClock({
            id,
            ready: clock.ready,
            deadline:
              result.recording_deadline == null
                ? null
                : result.recording_deadline * 1000 + offset,
          });
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    };
    const timer = setInterval(tick, 100);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, enabled, clock]);
  return {
    seconds,
    error,
    ready: clock?.id === id,
    retry: () => setRevision((n) => n + 1),
  };
}
