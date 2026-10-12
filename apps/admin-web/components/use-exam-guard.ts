"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ExamSession } from "./api";
import { ScreenRecording } from "../lib/screen-recording";

function waitFor<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void work.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

export function useExamGuard(
  session: ExamSession | null,
  stopAnswer: () => void,
) {
  const capture = useRef<ScreenRecording | null>(null);
  const [recording, setRecording] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareStage, setPrepareStage] = useState("");
  const preparation = useRef<{
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const interruptionVersion = useRef(0);
  const interruptedRef = useRef(false);
  const updateInterrupted = useCallback((value: boolean) => {
    interruptedRef.current = value;
    if (value) interruptionVersion.current++;
    setInterrupted(value);
  }, []);
  const finishingRef = useRef(false);
  const [segmentVersion, setSegmentVersion] = useState(0);
  const pendingReports = useRef<{ id: string; type: string }[]>([]);
  const sending = useRef<Promise<void> | null>(null);
  const flushReports = useCallback(async () => {
    if (sending.current) return sending.current;
    sending.current = (async () => {
      while (pendingReports.current.length) {
        const item = pendingReports.current[0];
        const controller = new AbortController();
        const timeout = setTimeout(
          () =>
            controller.abort(
              new Error(
                "Chưa gửi được sự kiện giám sát. Kiểm tra kết nối rồi thử lại.",
              ),
            ),
          10000,
        );
        try {
          await waitFor(
            api(`/exam-sessions/${item.id}/proctoring-events`, {
              method: "POST",
              body: JSON.stringify({ type: item.type }),
              signal: controller.signal,
            }),
            controller.signal,
          );
        } finally {
          clearTimeout(timeout);
        }
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
      void flushReports().catch(() => updateInterrupted(true));
    },
    [session, flushReports, updateInterrupted],
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
      () => void flushReports().catch(() => updateInterrupted(true)),
      10000,
    );
    return () => clearInterval(timer);
  }, [session?.id, inExam, required, flushReports, updateInterrupted]);
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
        updateInterrupted(true);
        if (type === "DISPLAY_CHANGED") {
          // A retained track may still be live but refer to a disabled output.
          // Preserve its segment, then require a fresh capture on resume.
          setRecording(false);
          void capture.current?.stop();
        }
      }
    });
    return () => {
      unsubscribe?.();
      window.removeEventListener("oral:backend-switch", blockSwitch);
      window.removeEventListener("beforeunload", blockSwitch);
      for (const name of ["copy", "cut", "paste", "drop", "contextmenu"])
        document.removeEventListener(name, clipboard);
    };
  }, [inExam, report, updateInterrupted]);
  useEffect(
    () => () => {
      preparation.current?.controller.abort(new Error("Đã rời trang thi."));
      preparation.current = null;
      void capture.current?.stop();
      void window.oralDesktop?.endExam?.();
    },
    [],
  );
  function prepare() {
    // Action buttons can remount while recovering. Keep the operation single
    // flight independently of a button's local busy state.
    if (preparation.current) return preparation.current.promise;
    const attempt = {
      controller: new AbortController(),
      promise: Promise.resolve(),
    };
    preparation.current = attempt;
    setPreparing(true);
    updateInterrupted(true);
    let version = interruptionVersion.current;
    const timeout = setTimeout(
      () =>
        attempt.controller.abort(
          new Error(
            "Khôi phục chế độ thi quá lâu. Đóng hộp chia sẻ màn hình nếu còn mở rồi thử lại.",
          ),
        ),
      30000,
    );
    attempt.promise = (async () => {
      try {
        if (!window.oralDesktop?.beginExam)
          throw new Error(
            "Cập nhật OralAI Desktop để sử dụng chế độ thi có giám sát.",
          );
        setPrepareStage("Đang bật chế độ thi…");
        await waitFor(
          window.oralDesktop.beginExam(),
          attempt.controller.signal,
        );
        if (required && !capture.current?.active) {
          setPrepareStage("Đang chờ quyền chia sẻ toàn màn hình…");
          capture.current ||= new ScreenRecording();
          await waitFor(
            capture.current.start(
              () => {
                setRecording(false);
                updateInterrupted(true);
                stop.current();
                reportRef.current("SCREEN_STOPPED");
              },
              () => setSegmentVersion((value) => value + 1),
              attempt.controller.signal,
            ),
            attempt.controller.signal,
          );
          setRecording(true);
          // The OS chooser can legitimately blur the app. Keep its incident,
          // then verify the display/lock again and restore focus before resume.
          // Display changes and ended tracks still stop this capture outright.
          version = interruptionVersion.current;
          setPrepareStage("Đang xác nhận chế độ thi…");
          await waitFor(
            window.oralDesktop.beginExam(),
            attempt.controller.signal,
          );
        }
        if (inExam) {
          setPrepareStage("Đang đồng bộ sự kiện giám sát…");
          report("SCREEN_RESUMED");
          await waitFor(flushReports(), attempt.controller.signal);
        }
        if (
          attempt.controller.signal.aborted ||
          preparation.current !== attempt ||
          version !== interruptionVersion.current ||
          (required && !capture.current?.active)
        )
          throw new Error(
            "Chế độ thi lại bị gián đoạn. Kiểm tra màn hình rồi khôi phục lại.",
          );
        finishingRef.current = false;
        setFinishing(false);
        // Only release the answer controls after every required step succeeds.
        updateInterrupted(false);
      } catch (error) {
        if (preparation.current === attempt) {
          updateInterrupted(true);
          setRecording(false);
          // Preserve every recorded segment and the single-display preparation.
          // Cleanup can finish later; it must not hold the retry button hostage.
          void capture.current?.stop().catch(() => {});
          void window.oralDesktop
            ?.endExam?.({ restoreDisplays: false })
            .catch(() => {});
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        if (preparation.current === attempt) {
          preparation.current = null;
          setPreparing(false);
          setPrepareStage("");
        }
      }
    })();
    return attempt.promise;
  }
  function cancelPrepare() {
    interruptionVersion.current++;
    preparation.current?.controller.abort(
      new Error(
        "Đã hủy khôi phục. Bài thi vẫn tạm dừng trả lời; có thể thử lại.",
      ),
    );
  }
  async function stopRecording() {
    // Answering has ended. Flush incidents before freezing evidence for upload;
    // window changes during the upload-only phase are no longer exam incidents.
    finishingRef.current = true;
    interruptionVersion.current++;
    await flushReports();
    setFinishing(true);
    await capture.current?.stop();
    setRecording(false);
    return capture.current?.files || [];
  }
  async function release() {
    interruptionVersion.current++;
    preparation.current?.controller.abort(new Error("Đã kết thúc chế độ thi."));
    preparation.current = null;
    setPreparing(false);
    setPrepareStage("");
    await capture.current?.stop();
    capture.current = null;
    lastEvent.current = {};
    setRecording(false);
    updateInterrupted(false);
    setFinishing(false);
    finishingRef.current = false;
    await window.oralDesktop?.endExam?.();
  }
  return {
    prepare,
    getRevision: () => interruptionVersion.current,
    assertReady: (revision: number) => {
      if (
        revision !== interruptionVersion.current ||
        preparation.current ||
        interruptedRef.current ||
        finishingRef.current ||
        (required && !capture.current?.active)
      )
        throw new Error(
          "Khôi phục chế độ thi và ghi màn hình trước khi trả lời.",
        );
    },
    preparing,
    prepareStage,
    cancelPrepare,
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
      updateInterrupted(true);
    },
    blocked:
      inExam &&
      !finishing &&
      (preparing || interrupted || (required && !recording)),
  };
}
