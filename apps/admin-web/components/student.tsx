"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Mic,
  LoaderCircle,
  Square,
  UploadCloud,
} from "lucide-react";
import {
  api,
  send,
  errorText,
  ExamSession,
  StudentExam,
  SpeechPolicy,
} from "./api";
import { Action, Badge, Empty } from "./shared";
import NoiseCheck from "./noise-check";

type STT = { transcript: string; stt_confidence: number };
declare global {
  interface Window {
    oralDesktop?: {
      openGoogle?: (url: string) => Promise<void>;
      transcribe: (audio: ArrayBuffer, policy: SpeechPolicy) => Promise<STT>;
    };
  }
}
type PendingAnswer = {
  attemptId: string;
  audio: Blob;
  video: Blob;
  transcript: string;
  confidence: number;
  originalText: string;
  key: string;
};
type UploadJob = {
  id: string;
  attemptId: string;
  kind: "AUDIO" | "VIDEO";
  blob: Blob;
  progress: number;
  status: "pending" | "uploading" | "done" | "failed";
  error?: string;
};
const hash = async (blob: Blob) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const mime = (kind: "audio" | "video") =>
  (kind === "audio"
    ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
    : ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
  ).find((t) => MediaRecorder.isTypeSupported(t));

export default function Student() {
  const [courseFilter, setCourseFilter] = useState("");
  const [exams, setExams] = useState<StudentExam[]>([]),
    [session, setSession] = useState<ExamSession | null>(null),
    [error, setError] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null),
    [noiseReady, setNoiseReady] = useState(false),
    [micLevel, setMicLevel] = useState(0),
    [recording, setRecording] = useState(false),
    [processing, setProcessing] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [speechStage, setSpeechStage] = useState("Đang tải cấu hình nhận dạng…");
  const [answer, setAnswer] = useState<PendingAnswer | null>(null),
    [jobs, setJobs] = useState<UploadJob[]>([]),
    [remaining, setRemaining] = useState(0),
    [deviceError, setDeviceError] = useState("");
  const preview = useRef<HTMLVideoElement>(null),
    recorders = useRef<MediaRecorder[]>([]),
    streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef<() => void>(() => {}),
    localDeadline = useRef<number | null>(null),
    recordingRef = useRef(false);
  const loadExams = useCallback(async () => {
    const rows = await api<StudentExam[]>("/exams/available");
    setExams(rows);
  }, []);
  const refreshSession = useCallback(async (id: string) => {
    const s = await api<ExamSession>(`/exam-sessions/${id}`);
    setSession(s);
    return s;
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- State updates follow an asynchronous API response.
    loadExams().catch((e) => setError(errorText(e)));
  }, [loadExams]);
  useEffect(() => {
    if (session?.started_at)
      localDeadline.current =
        Date.now() +
        (session.started_at + session.time_limit - session.server_time) * 1000;
  }, [session]);
  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
  }, [stream, session?.status]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (localDeadline.current) {
        const left = Math.max(
          0,
          Math.ceil((localDeadline.current - Date.now()) / 1000),
        );
        setRemaining(left);
        if (!left && recordingRef.current) stopRef.current();
      }
    }, 500);
    const before = (e: BeforeUnloadEvent) => {
      if (
        recordingRef.current ||
        answer ||
        jobs.some((j) => j.status !== "done")
      )
        e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", before);
    };
  }, [answer, jobs]);
  useEffect(
    () => () => {
      for (const r of recorders.current) if (r.state !== "inactive") r.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    if (
      !session ||
      !["SUBMITTED", "REVIEW_REQUIRED", "COMPLETED"].includes(session.status)
    )
      return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const timer = setInterval(
      () => refreshSession(session.id).catch(() => {}),
      4000,
    );
    return () => clearInterval(timer);
  }, [session?.id, session?.status, refreshSession]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!stream) return;
    const context = new AudioContext(),
      analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      setMicLevel(
        Math.min(
          100,
          Math.sqrt(
            samples.reduce((s, x) => s + (x - 128) ** 2, 0) / samples.length,
          ) * 4,
        ),
      );
    }, 120);
    return () => {
      clearInterval(timer);
      void context.close();
    };
  }, [stream]);
  async function devices() {
    setDeviceError("");
    setNoiseReady(false);
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined")
      throw new Error(
        "Cần trình duyệt hỗ trợ MediaRecorder trên HTTPS hoặc localhost.",
      );
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStream(null);
    const s = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    s.getTracks().forEach((t) => {
      t.onended = () => {
        setDeviceError(
          "Thiết bị đã ngắt kết nối. Kết nối lại trước khi tiếp tục.",
        );
        if (recordingRef.current) stopRef.current();
      };
    });
    streamRef.current = s;
    setStream(s);
  }
  async function transcribe(audio: Blob): Promise<STT> {
    setSpeechStage("Đang tải cấu hình nhận dạng…");
    const policy = await api<SpeechPolicy>("/stt/config");
    const providerLabel = {
      local: "Whisper trên máy của bạn",
      google: "Google",
      local_server: "Whisper trên server",
    }[policy.provider];
    setSpeechStage(
      `${policy.preprocessing === "denoise" ? "Đang lọc nhiễu và nhận dạng" : "Đang nhận dạng"} bằng ${providerLabel}. Vui lòng đợi…`,
    );
    if (policy.provider === "local") {
      if (!window.oralDesktop)
        throw new Error(
          "Admin chọn STT local. Vui lòng dùng ứng dụng desktop để nhận dạng.",
        );
      return window.oralDesktop.transcribe(await audio.arrayBuffer(), policy);
    }
    const form = new FormData();
    form.set("file", audio, "answer.webm");
    return api<STT>("/stt", { method: "POST", body: form });
  }
  async function start() {
    if (!session?.current_attempt || !stream || deviceError)
      throw new Error("Kiểm tra camera và microphone trước.");
    const am = mime("audio"),
      vm = mime("video");
    if (!am || !vm)
      throw new Error(
        "Trình duyệt chưa hỗ trợ định dạng ghi âm/video. Dùng Chrome hoặc Electron.",
      );
    const attemptId = session.current_attempt.id;
    const audioRecorder = new MediaRecorder(
      new MediaStream(stream.getAudioTracks()),
      { mimeType: am },
    );
    const videoRecorder = new MediaRecorder(stream, {
      mimeType: vm,
      videoBitsPerSecond: 650000,
    });
    const audioChunks: BlobPart[] = [],
      videoChunks: BlobPart[] = [];
    audioRecorder.ondataavailable = (e) => {
      if (e.data.size) audioChunks.push(e.data);
    };
    videoRecorder.ondataavailable = (e) => {
      if (e.data.size) videoChunks.push(e.data);
    };
    await send(`/question-attempts/${attemptId}/start`);
    let stops = 0;
    const stopped = async () => {
      stops++;
      if (stops < 2) return;
      recordingRef.current = false;
      setRecording(false);
      setProcessing(true);
      const a: PendingAnswer = {
        attemptId,
        audio: new Blob(audioChunks, { type: am.split(";")[0] }),
        video: new Blob(videoChunks, { type: vm.split(";")[0] }),
        transcript: "",
        originalText: "",
        confidence: 0,
        key: crypto.randomUUID(),
      };
      setAnswer(a);
      try {
        const stt = await transcribe(a.audio);
        a.transcript = stt.transcript;
        a.originalText = stt.transcript;
        a.confidence = stt.stt_confidence;
        setAnswer({ ...a });
      } catch (e) {
        setError(
          `${errorText(e)} Bạn có thể thử STT lại hoặc nhập transcript; bản nhập tay sẽ cần giảng viên xem lại.`,
        );
      } finally {
        setProcessing(false);
      }
    };
    audioRecorder.onstop = stopped;
    videoRecorder.onstop = stopped;
    const recordingError = () => {
      setDeviceError(
        "Có lỗi ghi media. Kiểm tra thiết bị và ghi lại câu trả lời.",
      );
      stopRef.current();
    };
    audioRecorder.onerror = recordingError;
    videoRecorder.onerror = recordingError;
    recorders.current = [audioRecorder, videoRecorder];
    stopRef.current = () => {
      if (!recordingRef.current) return;
      recordingRef.current = false;
      for (const r of recorders.current) if (r.state !== "inactive") r.stop();
      setRecording(false);
    };
    audioRecorder.start(1000);
    videoRecorder.start(1000);
    recordingRef.current = true;
    setRecording(true);
    setError("");
  }
  async function runUpload(job: UploadJob) {
    const update = (patch: Partial<UploadJob>) =>
      setJobs((all) =>
        all.map((j) => (j.id === job.id ? { ...j, ...patch } : j)),
      );
    update({ status: "uploading", error: undefined });
    try {
      const init = await send<{
        id: string;
        chunk_size: number;
        status: string;
      }>("/uploads/init", {
        attempt_id: job.attemptId,
        kind: job.kind,
        mime_type: job.blob.type,
        size: job.blob.size,
        sha256: await hash(job.blob),
      });
      if (init.status !== "COMPLETED") {
        const state = await api<{ received_chunks: number[] }>(
          `/uploads/${init.id}/status`,
        );
        const count = Math.ceil(job.blob.size / init.chunk_size);
        for (let i = 0; i < count; i++) {
          if (!state.received_chunks.includes(i)) {
            const part = job.blob.slice(
              i * init.chunk_size,
              (i + 1) * init.chunk_size,
            );
            const checksum = await hash(part);
            let last: unknown;
            for (let retry = 0; retry < 3; retry++) {
              try {
                await api(`/uploads/${init.id}/chunks/${i}`, {
                  method: "PUT",
                  body: part,
                  headers: { "X-Chunk-Sha256": checksum },
                });
                last = null;
                break;
              } catch (e) {
                last = e;
                await new Promise((r) => setTimeout(r, 500 * 2 ** retry));
              }
            }
            if (last) throw last;
          }
          update({ progress: Math.round(((i + 1) / count) * 95) });
        }
        await send(`/uploads/${init.id}/complete`);
      }
      update({ status: "done", progress: 100 });
    } catch (e) {
      update({ status: "failed", error: errorText(e) });
    }
  }
  async function submit() {
    if (!answer || !session || submitting || processing) return;
    if (!answer.audio.size || !answer.video.size)
      throw new Error("Media rỗng. Vui lòng ghi âm lại.");
    setSubmitting(true);
    try {
      const confidence =
        answer.transcript === answer.originalText ? answer.confidence : 0;
      await api(`/question-attempts/${answer.attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          transcript: answer.transcript,
          stt_confidence: confidence,
        }),
        headers: { "Idempotency-Key": answer.key },
      });
      const added: UploadJob[] = (["AUDIO", "VIDEO"] as const).map((kind) => ({
        id: crypto.randomUUID(),
        attemptId: answer.attemptId,
        kind,
        blob: kind === "AUDIO" ? answer.audio : answer.video,
        progress: 0,
        status: "pending",
      }));
      setJobs((all) => [...all, ...added]);
      setAnswer(null);
      setError("");
      added.forEach((j) => void runUpload(j));
      await refreshSession(session.id);
    } finally {
      setSubmitting(false);
    }
  }
  if (!session)
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">SẴN SÀNG CHIA SẺ KIẾN THỨC</span>
            <h1>Bài thi của tôi</h1>
            <p className="muted">
              Kiểm tra thiết bị, đọc câu hỏi và trình bày bằng giọng nói của
              bạn.
            </p>
          </div>
          <Action action={loadExams} className="button ghost">
            <GraduationCap size={18} /> Làm mới bài thi
          </Action>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <label className="course-filter">
          Môn học
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
          >
            <option value="">Tất cả môn học</option>
            {Array.from(
              new Map(
                exams
                  .filter((e) => e.course_id)
                  .map((e) => [e.course_id!, e.course_name || "Môn học"]),
              ),
            ).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="course-grid">
          {exams
            .filter((e) => !courseFilter || e.course_id === courseFilter)
            .map((e) => (
              <section className="panel" key={e.id}>
                <Badge status={e.status} />
                <p className="eyebrow">
                  {e.course_name}
                  {e.practice ? " · LUYỆN TẬP" : ""}
                </p>
                <h2>{e.name}</h2>
                <p className="muted">
                  {e.question_count} câu hỏi · {Math.round(e.time_limit / 60)}{" "}
                  phút
                </p>
                <Action
                  action={async () => {
                    setNoiseReady(false);
                    setSession(
                      await send<ExamSession>("/exam-sessions", {
                        exam_id: e.id,
                      }),
                    );
                  }}
                >
                  Mở bài thi →
                </Action>
              </section>
            ))}
        </div>
        {!exams.length && (
          <Empty>
            Bạn chưa được giao bài thi. Vui lòng liên hệ giảng viên.
          </Empty>
        )}
      </>
    );
  const finished = ["SUBMITTED", "REVIEW_REQUIRED", "COMPLETED"].includes(
    session.status,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PHÒNG THI VẤN ĐÁP</span>
          <h1>{session.exam_name}</h1>
          <p className="muted">
            Đã trả lời {session.answered_count}/{session.question_count} câu
          </p>
        </div>
        {session.started_at && !finished ? (
          <span className={`timer ${remaining < 60 ? "danger" : ""}`}>
            <Clock3 size={19} />
            {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, "0")}
          </span>
        ) : (
          <Badge status={session.status} />
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {finished ? (
        <section className="panel finished">
          <CheckCircle2 size={52} />
          <h2>
            {session.practice
              ? "Đã hoàn thành bài luyện tập"
              : "Đã nộp bài thi"}
          </h2>
          <p>Transcript và minh chứng đã được lưu.</p>
          {!session.practice && <Badge status={session.status} />}
          {session.practice ? (
            <p>
              Bài luyện tập không tính điểm. Bạn đã thử xong quy trình thi vấn
              đáp.
            </p>
          ) : (
            <p>
              Điểm chính thức:{" "}
              {session.status === "COMPLETED" &&
              typeof session.final_score === "number" &&
              Number.isFinite(session.final_score)
                ? `${session.final_score}/10`
                : session.grading_message ||
                  (session.status === "SUBMITTED"
                    ? "Đã nộp bài, đang chờ máy chủ chấm điểm."
                    : "Chưa có điểm chính thức; cần giảng viên xem lại.")}
            </p>
          )}
          <button
            className="button secondary"
            onClick={() => {
              setSession(null);
              setStream(null);
              setJobs([]);
              localDeadline.current = null;
              void loadExams();
            }}
          >
            Về danh sách bài thi
          </button>
        </section>
      ) : (
        <div className="exam-grid">
          <section className="panel question-panel">
            {session.status === "DEVICE_CHECK" ? (
              <>
                <span className="eyebrow">TRƯỚC KHI BẮT ĐẦU</span>
                <h2>Kiểm tra thiết bị</h2>
                <p>
                  Bài thi gồm {session.question_count} câu, thời gian{" "}
                  {Math.round(session.time_limit / 60)} phút tính từ khi bắt đầu
                  thi.
                </p>
                <ol>
                  <li>Cho phép truy cập camera và microphone.</li>
                  <li>Kiểm tra hình ảnh và thanh tín hiệu microphone.</li>
                  <li>
                    Kiểm tra độ ồn, tìm chỗ yên lặng nếu được nhắc hoặc chọn bỏ
                    qua.
                  </li>
                  <li>Camera chỉ ghi khi bạn bấm “Bắt đầu trả lời”.</li>
                </ol>
                <p className="muted">
                  Audio/video được lưu để giảng viên xem lại. Chưa hỗ trợ khôi
                  phục bản ghi khi đóng ứng dụng; giữ cửa sổ mở đến khi nộp bài
                  thành công.
                </p>
                {stream && !deviceError && (
                  <NoiseCheck
                    key={stream.id}
                    stream={stream}
                    onReady={setNoiseReady}
                  />
                )}
                <Action
                  disabled={!stream || !!deviceError || !noiseReady}
                  action={async () =>
                    setSession(
                      await send<ExamSession>(
                        `/exam-sessions/${session.id}/start`,
                      ),
                    )
                  }
                >
                  Bắt đầu thi
                </Action>
              </>
            ) : session.current_attempt ? (
              <>
                <span className="eyebrow">
                  CÂU {session.current_attempt.sequence} /{" "}
                  {session.question_count}
                </span>
                <h2 className="question-text">
                  {session.current_attempt.text}
                </h2>
                <div className="recording-status">
                  {recording ? (
                    <>
                      <span className="record-dot" />
                      Đang ghi âm và ghi hình
                    </>
                  ) : processing ? (
                    <span
                      role="status"
                      aria-live="polite"
                      className="processing-status"
                    >
                      <LoaderCircle className="spin" size={20} />
                      {speechStage}
                    </span>
                  ) : submitting ? (
                    <span
                      role="status"
                      aria-live="polite"
                      className="processing-status"
                    >
                      <LoaderCircle className="spin" size={20} />
                      Đang nộp câu trả lời, vui lòng đợi…
                    </span>
                  ) : answer ? (
                    "Kiểm tra transcript trước khi nộp"
                  ) : (
                    "Dành một chút thời gian suy nghĩ trước khi trả lời."
                  )}
                </div>
                {!answer &&
                  !processing &&
                  !submitting &&
                  (recording ? (
                    <button
                      className="button stop"
                      onClick={() => stopRef.current()}
                    >
                      <Square size={17} />
                      Kết thúc trả lời
                    </button>
                  ) : (
                    <Action
                      disabled={!stream || !!deviceError || remaining === 0}
                      action={start}
                    >
                      <Mic size={17} />
                      Bắt đầu trả lời
                    </Action>
                  ))}
                {answer && (
                  <div className="answer-form">
                    <label>
                      Transcript
                      <textarea
                        rows={7}
                        disabled={processing || submitting}
                        value={answer.transcript}
                        onChange={(e) =>
                          setAnswer({ ...answer, transcript: e.target.value })
                        }
                        placeholder="Transcript từ giọng nói sẽ xuất hiện ở đây…"
                      />
                    </label>
                    <p className="muted">
                      Chỉnh sửa hoặc nhập tay sẽ đánh dấu câu trả lời cần giảng
                      viên đối chiếu với bản ghi.
                    </p>
                    <div className="inline">
                      <Action
                        disabled={
                          processing || submitting || !answer.transcript.trim()
                        }
                        action={submit}
                      >
                        Nộp câu trả lời & tiếp tục →
                      </Action>
                      <Action
                        disabled={processing || submitting}
                        className="button secondary"
                        action={async () => {
                          setProcessing(true);
                          try {
                            const s = await transcribe(answer.audio);
                            setAnswer({
                              ...answer,
                              transcript: s.transcript,
                              originalText: s.transcript,
                              confidence: s.stt_confidence,
                            });
                            setError("");
                          } finally {
                            setProcessing(false);
                          }
                        }}
                      >
                        Thử STT lại
                      </Action>
                      <button
                        disabled={processing || submitting}
                        className="text-button"
                        onClick={() => {
                          setAnswer(null);
                          setError("");
                        }}
                      >
                        Ghi lại
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <CheckCircle2 size={44} />
                <h2>Đã trả lời đủ câu hỏi</h2>
                <p>Chờ minh chứng tải lên hoàn tất, sau đó nộp bài thi.</p>
              </>
            )}
            {session.status === "IN_PROGRESS" &&
              (!session.current_attempt || remaining === 0) &&
              !recording &&
              !answer && (
                <Action
                  disabled={jobs.some((j) => j.status !== "done")}
                  action={async () =>
                    setSession(
                      await send<ExamSession>(
                        `/exam-sessions/${session.id}/finish`,
                      ),
                    )
                  }
                >
                  Nộp bài thi
                </Action>
              )}
          </section>
          <aside>
            <section className="panel device-panel">
              <div className="section-title">
                <h3>
                  <Camera size={17} />
                  Camera của bạn
                </h3>
                <span className={recording ? "record-label" : "muted"}>
                  {recording ? "REC" : "Preview"}
                </span>
              </div>
              <div className="camera-preview">
                <video ref={preview} autoPlay playsInline muted />
                {!stream && (
                  <span>
                    <Camera size={34} />
                    Chưa kết nối camera
                  </span>
                )}
              </div>
              <div className="mic-meter">
                <Mic size={16} />
                <div>
                  <i style={{ width: `${micLevel}%` }} />
                </div>
              </div>
              <small className="muted">
                Nói thử để kiểm tra tín hiệu microphone
              </small>
              {deviceError && <p className="error">{deviceError}</p>}
              <Action
                disabled={recording || processing || submitting}
                className="button secondary"
                action={devices}
              >
                {stream ? "Kết nối lại thiết bị" : "Cho phép camera & mic"}
              </Action>
            </section>
            <section className="panel">
              <h3>
                <UploadCloud size={18} />
                Minh chứng
              </h3>
              {!jobs.length ? (
                <p className="muted">
                  Audio và video sẽ tải lên sau khi nộp mỗi câu.
                </p>
              ) : (
                jobs.map((j) => (
                  <div className="upload-job" key={j.id}>
                    <div>
                      <span>{j.kind === "AUDIO" ? "Âm thanh" : "Video"}</span>
                      <small>
                        {j.status === "done" ? "Đã lưu" : `${j.progress}%`}
                      </small>
                    </div>
                    <progress max="100" value={j.progress} />
                    {j.status === "failed" && (
                      <>
                        <p className="error">{j.error}</p>
                        <Action
                          className="text-button"
                          action={() => runUpload(j)}
                        >
                          Tải lại
                        </Action>
                      </>
                    )}
                  </div>
                ))
              )}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
