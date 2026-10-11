"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { send, type ExamSession } from "./api";
import { ScreenRecording } from "../lib/screen-recording";

export function useExamGuard(
  session: ExamSession | null,
  stopAnswer: () => void,
) {
  const capture = useRef<ScreenRecording | null>(null);
  const [recording, setRecording] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  const [segmentVersion, setSegmentVersion] = useState(0);
  const pendingReports = useRef<{ id: string; type: string }[]>([]);
  const sending = useRef<Promise<void> | null>(null);
  const flushReports = useCallback(async () => {
    if (sending.current) return sending.current;
    sending.current = (async () => {
      while (pendingReports.current.length) {
        const item = pendingReports.current[0];
        await send(`/exam-sessions/${item.id}/proctoring-events`, {
          type: item.type,
        });
        pendingReports.current.shift();
      }
    })();
    try {
      await sending.current;
    } finally {
      sending.current = null;
    }
  }, []);
  const lastEvent = useRef<Record<string, number>>({});
  const stop = useRef(stopAnswer);
  useEffect(() => {
    stop.current = stopAnswer;
  }, [stopAnswer]);
  const inExam = session?.status === "IN_PROGRESS";
  const required = !!session?.screen_required;
  const report = useCallback(
    (type: string) => {
      if (!session || session.status !== "IN_PROGRESS" || finishingRef.current)
        return;
      const now = Date.now();
      if (now - (lastEvent.current[type] || 0) < 5000) return;
      lastEvent.current[type] = now;
      if (pendingReports.current.length < 500)
        pendingReports.current.push({ id: session.id, type });
      void flushReports().catch(() => setInterrupted(true));
    },
    [session, flushReports],
  );
  const reportRef = useRef(report);
  useEffect(() => {
    reportRef.current = report;
  }, [report]);
  useEffect(() => {
    if (!inExam) return;
    if (required && !capture.current?.active)
      reportRef.current("CLIENT_RESTARTED");
    const timer = setInterval(
      () => void flushReports().catch(() => setInterrupted(true)),
      10000,
    );
    return () => clearInterval(timer);
  }, [session?.id, inExam, required, flushReports]);
  useEffect(() => {
    if (!inExam) return;
    const blockSwitch = (e: Event) => e.preventDefault();
    const clipboard = (e: Event) => {
      e.preventDefault();
      report("CLIPBOARD_BLOCKED");
    };
    window.addEventListener("oral:backend-switch", blockSwitch);
    window.addEventListener("beforeunload", blockSwitch);
    for (const name of ["copy", "cut", "paste", "drop", "contextmenu"])
      document.addEventListener(name, clipboard);
    const unsubscribe = window.oralDesktop?.onExamEvent?.((type) => {
      report(type);
      if (
        [
          "WINDOW_BLUR",
          "WINDOW_MINIMIZED",
          "FULLSCREEN_LEFT",
          "DISPLAY_CHANGED",
        ].includes(type)
      ) {
        stop.current();
        setInterrupted(true);
      }
    });
    return () => {
      unsubscribe?.();
      window.removeEventListener("oral:backend-switch", blockSwitch);
      window.removeEventListener("beforeunload", blockSwitch);
      for (const name of ["copy", "cut", "paste", "drop", "contextmenu"])
        document.removeEventListener(name, clipboard);
    };
  }, [inExam, report]);
  useEffect(
    () => () => {
      void capture.current?.stop();
      void window.oralDesktop?.endExam?.();
    },
    [],
  );
  async function prepare() {
    if (!window.oralDesktop?.beginExam)
      throw new Error(
        "Cập nhật OralAI Desktop để sử dụng chế độ thi có giám sát.",
      );
    await window.oralDesktop.beginExam();
    try {
      if (required && !capture.current?.active) {
        capture.current ||= new ScreenRecording();
        await capture.current.start(
          () => {
            setRecording(false);
            setInterrupted(true);
            stop.current();
            reportRef.current("SCREEN_STOPPED");
          },
          () => setSegmentVersion((v) => v + 1),
        );
        setRecording(true);
      }
      setInterrupted(false);
      finishingRef.current = false;
      setFinishing(false);
      if (inExam) {
        report("SCREEN_RESUMED");
        await flushReports();
      }
    } catch (e) {
      setInterrupted(true);
      await window.oralDesktop.endExam?.();
      throw e;
    }
  }
  async function stopRecording() {
    // Answering has ended. Flush incidents before freezing evidence for upload;
    // window changes during the upload-only phase are no longer exam incidents.
    finishingRef.current = true;
    await flushReports();
    setFinishing(true);
    await capture.current?.stop();
    setRecording(false);
    return capture.current?.files || [];
  }
  async function release() {
    await capture.current?.stop();
    capture.current = null;
    lastEvent.current = {};
    setRecording(false);
    setInterrupted(false);
    setFinishing(false);
    finishingRef.current = false;
    await window.oralDesktop?.endExam?.();
  }
  return {
    prepare,
    stopRecording,
    release,
    report,
    recording,
    segmentVersion,
    files: () => capture.current?.files || [],
    finishing,
    finishFailed: () => {
      finishingRef.current = false;
      setFinishing(false);
      setInterrupted(true);
    },
    blocked: inExam && !finishing && (interrupted || (required && !recording)),
  };
}
