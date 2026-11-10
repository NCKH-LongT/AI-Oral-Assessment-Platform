"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Mic,
  MicOff,
  Square,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ArrowLeft,
  Activity,
  Sparkles,
  Gauge,
  Sliders,
  Volume2,
  Clock,
  ShieldCheck,
} from "lucide-react";

interface AudioQA {
  status: "PASSED" | "WARNING" | "POOR";
  snr_db: number;
  rms_dbfs: number;
  clipping_ratio: number;
  speech_ratio: number;
  speech_duration: number;
  duration: number;
  issues: string[];
  recommendation: string;
}

interface Scores {
  accuracy: number;
  completeness: number;
  fluency: number;
  prosody: number;
  total: number;
}

interface Metrics {
  wpm: number;
  speech_duration_seconds: number;
  speech_ratio: number;
  snr_db: number;
  word_count: number;
}

interface AssessmentResponse {
  status: string;
  model: string;
  model_revision: string;
  backend_source?: string;
  audio_quality: AudioQA;
  scores: Scores;
  metrics?: Metrics;
  review_required?: boolean;
  review_reason?: string | null;
  message?: string;
  recognized?: string;
}

const SAMPLE_SENTENCES = [
  {
    label: "Câu 1: Giới thiệu bản thân (Cơ bản)",
    text: "Hello, I am ready for the English oral assessment today.",
  },
  {
    label: "Câu 2: Phát âm học thuật & âm đuôi (Phonetic Focus)",
    text: "The scientific research provides strong evidence for environmental sustainability.",
  },
  {
    label: "Câu 3: Lập luận mở rộng (Conversational & Fluency)",
    text: "In my opinion, technology has significantly transformed the way students communicate.",
  },
];

export default function TestAudioPage() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [transcript, setTranscript] = useState<string>(SAMPLE_SENTENCES[0].text);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState<boolean>(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [currentPeak, setCurrentPeak] = useState<number>(-100);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AssessmentResponse | null>(null);
  const [error, setError] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1. Tải danh sách micro
  useEffect(() => {
    async function loadAudioDevices() {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const audioDevs = devs.filter((d) => d.kind === "audioinput");
        setDevices(audioDevs);
        if (audioDevs.length > 0 && !selectedDevice) {
          setSelectedDevice(audioDevs[0].deviceId);
        }
      } catch (err: unknown) {
        console.error("Lỗi lấy danh sách microphone:", err);
      }
    }
    loadAudioDevices();
  }, [selectedDevice]);

  // 2. Dọn dẹp luồng khi unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // 3. Khởi tạo Stream & Audio Meter
  const initStream = async (deviceId?: string) => {
    stopStream();
    setError("");
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 16000 },
        },
        video: false,
      });

      setStream(audioStream);

      // Setup Web Audio Analyser
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(audioStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      drawMeter();
      return audioStream;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError("Không thể truy cập microphone: " + msg);
      return null;
    }
  };

  // 4. Vẽ thang đo âm lượng Realtime
  const drawMeter = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    const normalized = avg / 255;
    const dbfs = -60 + normalized * 60; // Approximate dBFS
    setCurrentPeak(Math.round(dbfs));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const width = canvas.width * normalized;

    // Gradient màu: Xanh lá -> Vàng -> Đỏ (vỡ tiếng)
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, "#22c55e");
    gradient.addColorStop(0.7, "#eab308");
    gradient.addColorStop(0.95, "#ef4444");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, canvas.height);

    animationFrameRef.current = requestAnimationFrame(drawMeter);
  };

  // 5. Bắt đầu thu âm
  const startRecording = async () => {
    setError("");
    setResult(null);
    setRecordedAudioUrl(null);
    setRecordedBlob(null);

    let activeStream = stream;
    if (!activeStream) {
      activeStream = await initStream(selectedDevice);
      if (!activeStream) return;
    }

    try {
      chunksRef.current = [];
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t)
      ) || "";

      const recorder = new MediaRecorder(activeStream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        setRecordedBlob(blob);
        setRecordedAudioUrl(URL.createObjectURL(blob));
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError("Lỗi khởi động bộ ghi âm: " + msg);
    }
  };

  // 6. Dừng thu âm
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 7. Gửi audio lên server chấm điểm (Audio QA + HuBERT)
  const submitToGrade = async () => {
    if (!recordedBlob) {
      setError("Vui lòng ghi âm một câu nói trước khi chấm điểm.");
      return;
    }
    if (!transcript.trim()) {
      setError("Vui lòng nhập câu tiếng Anh cần kiểm tra.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("audio", recordedBlob, "answer.webm");
      formData.append("transcript", transcript.trim());

      const res = await fetch("/api/speech/test-pronunciation", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || errJson?.detail || `Lỗi HTTP ${res.status}`);
      }

      const data: AssessmentResponse = await res.json();
      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError("Không thể chấm điểm: " + msg);
    } finally {
      setLoading(false);
    }
  };

  const qa = result?.audio_quality;
  const scores = result?.scores;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem", fontFamily: "sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            color: "#4f46e5",
            textDecoration: "none",
            fontSize: "0.9rem",
            marginBottom: "0.75rem",
            fontWeight: 500,
          }}
        >
          <ArrowLeft size={16} /> Quay lại trang chủ
        </Link>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "#111827" }}>
          🎙️ Thử Nghiệm Thu Âm & Chấm Điểm Phát Âm AI (Audio QA & HuBERT)
        </h1>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.95rem" }}>
          Hệ thống 4 lớp: Kiểm tra chất lượng phần cứng âm thanh (SNR, Clipping, VAD) và chấm điểm 4 tiêu chí chuẩn
          Ngôn ngữ Anh bằng mô hình HuBERT.
        </p>
      </div>

      {/* Grid điều khiển */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        {/* Cột 1: Chọn mic & Real-time Visualizer */}
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sliders size={18} color="#4f46e5" /> 1. Thiết bị Micro & Tín hiệu
          </h2>

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.35rem", color: "#374151" }}>
              Chọn Microphone:
            </label>
            <select
              value={selectedDevice}
              disabled={recording}
              onChange={(e) => {
                setSelectedDevice(e.target.value);
                if (stream) initStream(e.target.value);
              }}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: "0.9rem",
                background: "#f9fafb",
              }}
            >
              {devices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Microphone ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.25rem" }}>
              <span style={{ color: "#4b5563" }}>Cường độ tín hiệu (Signal Level):</span>
              <span style={{ fontWeight: 600, color: currentPeak > -10 ? "#ef4444" : currentPeak < -40 ? "#9ca3af" : "#22c55e" }}>
                {currentPeak} dBFS
              </span>
            </div>
            <canvas
              ref={canvasRef}
              width={400}
              height={16}
              style={{
                width: "100%",
                height: 16,
                background: "#f3f4f6",
                borderRadius: 999,
                overflow: "hidden",
                display: "block",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>
              <span>Im lặng (-60dB)</span>
              <span>Lý tưởng (-24dB đến -12dB)</span>
              <span>Vỡ tiếng (0dB)</span>
            </div>
          </div>

          {!stream && (
            <button
              onClick={() => initStream(selectedDevice)}
              style={{
                width: "100%",
                padding: "0.6rem",
                background: "#f3f4f6",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              <Volume2 size={16} /> Bật kiểm tra tín hiệu Micro
            </button>
          )}
        </div>

        {/* Cột 2: Câu mẫu tiếng Anh */}
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: 0, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sparkles size={18} color="#4f46e5" /> 2. Câu Mẫu Tiếng Anh
          </h2>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            {SAMPLE_SENTENCES.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setTranscript(item.text)}
                style={{
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.75rem",
                  borderRadius: 6,
                  border: transcript === item.text ? "1px solid #4f46e5" : "1px solid #e5e7eb",
                  background: transcript === item.text ? "#eef2ff" : "#f9fafb",
                  color: transcript === item.text ? "#4f46e5" : "#374151",
                  cursor: "pointer",
                  fontWeight: transcript === item.text ? 600 : 400,
                }}
              >
                Mẫu {idx + 1}
              </button>
            ))}
          </div>

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={4}
            placeholder="Nhập câu tiếng Anh bạn sẽ đọc..."
            style={{
              width: "100%",
              padding: "0.6rem 0.75rem",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: "0.9rem",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            💡 Gợi ý: Bạn có thể gõ bất kỳ câu tiếng Anh nào để đọc thử và kiểm tra.
          </span>
        </div>
      </div>

      {/* Bảng điều khiển thu âm */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "1.5rem",
          textAlign: "center",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          {!recording ? (
            <button
              onClick={startRecording}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.75rem",
                background: "#dc2626",
                color: "#ffffff",
                border: "none",
                borderRadius: 999,
                fontSize: "1rem",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 6px -1px rgba(220, 38, 38, 0.2)",
              }}
            >
              <Mic size={20} /> Bắt đầu Thu Âm
            </button>
          ) : (
            <button
              onClick={stopRecording}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.75rem",
                background: "#1f2937",
                color: "#ffffff",
                border: "none",
                borderRadius: 999,
                fontSize: "1rem",
                fontWeight: 600,
                cursor: "pointer",
                animation: "pulse 1.5s infinite",
              }}
            >
              <Square size={20} /> Dừng Thu Âm ({recordingDuration}s)
            </button>
          )}

          {recordedAudioUrl && !recording && (
            <button
              onClick={submitToGrade}
              disabled={loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.75rem",
                background: loading ? "#9ca3af" : "#4f46e5",
                color: "#ffffff",
                border: "none",
                borderRadius: 999,
                fontSize: "1rem",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 6px -1px rgba(79, 70, 229, 0.2)",
              }}
            >
              <Sparkles size={20} /> {loading ? "Đang Chấm HuBERT..." : "Chấm Điểm Phát Âm"}
            </button>
          )}
        </div>

        {/* Audio Player nghe lại */}
        {recordedAudioUrl && (
          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#f9fafb", borderRadius: 8, display: "inline-block" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 500, marginRight: "0.75rem", color: "#374151" }}>
              Nghe lại bản thu ({recordingDuration}s):
            </span>
            <audio controls src={recordedAudioUrl} style={{ verticalAlign: "middle", height: 36 }} />
          </div>
        )}

        {error && (
          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#fef2f2", color: "#b91c1c", borderRadius: 8, fontSize: "0.9rem" }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* KẾT QUẢ CHẤM ĐIỂM (4 LỚP) */}
      {result && (
        <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
          {/* Lớp 3: Audio QA Gatekeeper Badge */}
          {qa && (
            <div
              style={{
                border: "1px solid",
                borderColor: qa.status === "PASSED" ? "#bbf7d0" : qa.status === "WARNING" ? "#fef08a" : "#fecaca",
                background: qa.status === "PASSED" ? "#f0fdf4" : qa.status === "WARNING" ? "#fefce8" : "#fef2f2",
                borderRadius: 12,
                padding: "1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {qa.status === "PASSED" && <CheckCircle2 size={22} color="#16a34a" />}
                  {qa.status === "WARNING" && <AlertTriangle size={22} color="#ca8a04" />}
                  {qa.status === "POOR" && <AlertOctagon size={22} color="#dc2626" />}
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: qa.status === "PASSED" ? "#166534" : qa.status === "WARNING" ? "#854d0e" : "#991b1b" }}>
                    Lớp 3: Audio Quality Gatekeeper — {qa.status === "PASSED" ? "ĐẠT TIÊU CHUẨN" : qa.status === "WARNING" ? "CẢNH BÁO TẠP ÂM" : "KHÔNG ĐẠT CHUẨN (POOR)"}
                  </h3>
                </div>
                <span style={{ fontSize: "0.8rem", background: "#ffffff", padding: "0.2rem 0.5rem", borderRadius: 6, border: "1px solid #e5e7eb", color: "#4b5563" }}>
                  SNR: {qa.snr_db} dB | Clipping: {(qa.clipping_ratio * 100).toFixed(1)}%
                </span>
              </div>

              <p style={{ margin: "0.25rem 0 0.75rem 0", fontSize: "0.9rem", color: "#374151" }}>
                {qa.recommendation}
              </p>

              {qa.status === "POOR" && (
                <div style={{ background: "#ffffff", padding: "0.75rem 1rem", borderRadius: 8, border: "1px dashed #dc2626", fontSize: "0.85rem", color: "#991b1b", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <ShieldCheck size={18} />
                  <span>
                    <strong>Chính sách khảo thí (Layer 4):</strong> Vì chất lượng mic không đạt chuẩn, bài thi sẽ được chuyển sang cho <strong>Giảng viên nghe và chấm thủ công</strong>, không trừ điểm liệt của sinh viên.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Lớp 4: Bảng Điểm HuBERT */}
          {scores && (
            <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", borderBottom: "1px solid #f3f4f6", paddingBottom: "1rem" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#111827" }}>
                    🎯 Kết Quả Đánh Giá Phát Âm HuBERT
                  </h3>
                  <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                    Mô hình: {result.model_revision} | Nguồn: {result.backend_source === "gopt_service" ? "GOPT Service Container" : "HuBERT Engine Preview"}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "0.8rem", color: "#6b7280", display: "block" }}>TỔNG ĐIỂM (0-10)</span>
                  <span style={{ fontSize: "2rem", fontWeight: 800, color: scores.total >= 8 ? "#16a34a" : scores.total >= 6.5 ? "#2563eb" : "#d97706" }}>
                    {scores.total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* 4 Tiêu chí chi tiết */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
                <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Accuracy (40%)</span>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: "0.25rem 0" }}>
                    {scores.accuracy.toFixed(1)} <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>/ 10</span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Độ rõ ràng âm học & âm vị</span>
                </div>

                <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Fluency (25%)</span>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: "0.25rem 0" }}>
                    {scores.fluency.toFixed(1)} <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>/ 10</span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Tốc độ & ngắt nghỉ</span>
                </div>

                <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Prosody (20%)</span>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: "0.25rem 0" }}>
                    {scores.prosody.toFixed(1)} <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>/ 10</span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Ngữ điệu & trọng âm</span>
                </div>

                <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>Completeness (15%)</span>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: "0.25rem 0" }}>
                    {scores.completeness.toFixed(1)} <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>/ 10</span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Độ bao phủ câu nói</span>
                </div>
              </div>

              {/* Đối chiếu nhận diện từ vựng */}
              {result.recognized && (
                <div style={{ marginBottom: "1rem", padding: "0.85rem 1rem", background: "#f8fafc", borderRadius: 8, border: "1px dashed #94a3b8", fontSize: "0.85rem" }}>
                  <div style={{ fontWeight: 600, color: "#334155", marginBottom: "0.35rem" }}>
                    🎙️ Đối chiếu ngữ âm & từ vựng nhận diện (Phonetic & ASR Alignment):
                  </div>
                  <div style={{ color: "#0f172a", fontStyle: "italic", background: "#ffffff", padding: "0.5rem 0.75rem", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                    "{result.recognized}"
                  </div>
                </div>
              )}

              {/* Chỉ số ngôn ngữ chi tiết */}
              {result.metrics && (
                <div style={{ background: "#f9fafb", padding: "1rem", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: "0.85rem", color: "#374151" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Activity size={16} color="#4f46e5" /> Chỉ Số Âm Học & Tốc Độ Nói (Acoustic Metrics):
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
                    <div>
                      • Tốc độ nói: <strong>{result.metrics.wpm} WPM</strong>{" "}
                      <span style={{ color: "#6b7280" }}>(chuẩn: 120-150 WPM)</span>
                    </div>
                    <div>
                      • Thời lượng phát âm: <strong>{result.metrics.speech_duration_seconds}s</strong>
                    </div>
                    <div>
                      • Tỉ lệ âm thanh có tiếng: <strong>{(result.metrics.speech_ratio * 100).toFixed(0)}%</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
