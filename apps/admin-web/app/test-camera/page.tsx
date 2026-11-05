"use client";

import { useEffect, useRef, useState } from "react";
import { useFaceCheck } from "../../components/use-face-check";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Eye,
  Activity,
  Compass,
  Layers,
} from "lucide-react";

export default function TestCameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [showTrackingLines, setShowTrackingLines] = useState<boolean>(true);

  // Hook nhận diện khuôn mặt và hướng mắt nâng cao
  const faceCheck = useFaceCheck(
    videoRef,
    cameraActive && !!stream,
    stream?.id
  );

  // Lấy danh sách camera
  useEffect(() => {
    async function loadDevices() {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devs.filter((d) => d.kind === "videoinput");
        setDevices(videoDevs);
        if (videoDevs.length > 0 && !selectedDevice) {
          setSelectedDevice(videoDevs[0].deviceId);
        }
      } catch (err: unknown) {
        console.error("Lỗi lấy danh sách camera:", err);
      }
    }
    loadDevices();
  }, [selectedDevice]);

  // Khởi động camera
  const startCamera = async (deviceId?: string) => {
    stopCamera();
    setError("");
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError("Không thể truy cập camera: " + msg);
      setCameraActive(false);
    }
  };

  // Tắt camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const eye = faceCheck.eye;
  const eyeMesh = faceCheck.eyeMesh;
  const isDeviating = (faceCheck.awayCount || 0) >= 2;

  // Vẽ các đường tracking mắt thời gian thực lên Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !cameraActive) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Đồng bộ kích thước canvas với video
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    if (!showTrackingLines || !eyeMesh) return;

    const lineColor = isDeviating ? "#f43f5e" : "#06b6d4"; // Đỏ khi lệch, Xanh ngọc khi chuẩn
    const irisColor = isDeviating ? "#ef4444" : "#10b981"; // Đỏ rực hoặc Xanh lá neon
    const vectorColor = isDeviating ? "#dc2626" : "#22c55e";

    // 1. Vẽ đường viền mí mắt (Eyelid contours)
    const drawPolygon = (points: Array<{ x: number; y: number }>, color: string, lineWidth = 2) => {
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.moveTo(points[0].x * w, points[0].y * h);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x * w, points[i].y * h);
      }
      ctx.closePath();
      ctx.stroke();
    };

    drawPolygon(eyeMesh.rightEye, lineColor, 2);
    drawPolygon(eyeMesh.leftEye, lineColor, 2);

    // 2. Vẽ vòng tròn mống mắt (Iris circumference)
    drawPolygon(eyeMesh.rightIris, irisColor, 1.5);
    drawPolygon(eyeMesh.leftIris, irisColor, 1.5);

    // 3. Vẽ tâm mống mắt (Pupil point)
    const drawPoint = (p: { x: number; y: number } | null, color: string, radius = 4) => {
      if (!p) return;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(p.x * w, p.y * h, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    drawPoint(eyeMesh.rightIrisCenter, irisColor, 4.5);
    drawPoint(eyeMesh.leftIrisCenter, irisColor, 4.5);

    // 4. Đường nối 2 mắt
    if (eyeMesh.rightIrisCenter && eyeMesh.leftIrisCenter) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(eyeMesh.rightIrisCenter.x * w, eyeMesh.rightIrisCenter.y * h);
      ctx.lineTo(eyeMesh.leftIrisCenter.x * w, eyeMesh.leftIrisCenter.y * h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 5. VẼ CÁC TIA VECTOR THEO DÕI HƯỚNG MẮT (GAZE VECTOR LINES)
    const drawGazeVector = (center: { x: number; y: number } | null) => {
      if (!center || !eye) return;
      const originX = center.x * w;
      const originY = center.y * h;

      // Hướng nhìn mắt: (eye.horizontal - 0.5) theo trục X, (eye.vertical - 0.5) theo trục Y
      // Lưu ý: Canvas bị lật mirror scaleX(-1) nên chiều vector X được đồng bộ tự nhiên
      const deltaX = (eye.horizontal - 0.5) * 160;
      const deltaY = (eye.vertical - 0.5) * 160;

      // Độ dài tối thiểu khi nhìn thẳng để người dùng luôn thấy tia vector hướng
      const length = Math.max(25, Math.hypot(deltaX, deltaY));
      const angle = Math.atan2(deltaY, deltaX);

      const targetX = originX + Math.cos(angle) * (length + 30);
      const targetY = originY + Math.sin(angle) * (length + 30);

      // Vẽ tia laser hướng mắt
      ctx.beginPath();
      ctx.strokeStyle = vectorColor;
      ctx.lineWidth = 2.5;
      ctx.moveTo(originX, originY);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();

      // Vẽ mũi tên ở đầu tia
      const headLen = 8;
      ctx.beginPath();
      ctx.fillStyle = vectorColor;
      ctx.moveTo(targetX, targetY);
      ctx.lineTo(
        targetX - headLen * Math.cos(angle - Math.PI / 6),
        targetY - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        targetX - headLen * Math.cos(angle + Math.PI / 6),
        targetY - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
    };

    drawGazeVector(eyeMesh.rightIrisCenter);
    drawGazeVector(eyeMesh.leftIrisCenter);

    // 6. Vẽ tâm chóp mũi (Nose tracking point)
    if (eyeMesh.nose) {
      drawPoint(eyeMesh.nose, "#f59e0b", 3.5);
    }
  }, [eyeMesh, eye, cameraActive, isDeviating, showTrackingLines]);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--teal)",
            textDecoration: "none",
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          <ArrowLeft size={16} /> Quay lại trang chủ
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0" }}>
          Phòng Test Nhận Diện Camera & Giám Sát Gian Lận (MediaPipe AI)
        </h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Hiển thị trực quan các đường <strong>Eye Tracking Lines</strong>: Viền mí mắt, con ngươi và tia vector hướng nhìn thời gian thực.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 24, alignItems: "start" }}>
        {/* Khung Camera & Canvas Overlay */}
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid var(--line)",
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#fafbfc",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              <Camera size={18} color="var(--teal)" />
              <span>Camera Giám Sát & Tia Tracking Mắt</span>
            </div>
            {cameraActive && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: isDeviating ? "#dc2626" : "#059669",
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: isDeviating ? "#ef4444" : "#10b981",
                    display: "inline-block",
                  }}
                />
                {isDeviating ? "CẢNH BÁO LỆCH HƯỚNG" : "Đang tracking"}
              </span>
            )}
          </div>

          <div
            style={{
              position: "relative",
              background: "#111827",
              minHeight: 380,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {/* Thẻ Video Camera */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: "100%",
                height: "auto",
                maxHeight: 460,
                objectFit: "contain",
                transform: "scaleX(-1)", // Mirror cho tự nhiên
                display: cameraActive ? "block" : "none",
              }}
            />

            {/* Thẻ Canvas vẽ các đường Tracking Mắt (Overlay) */}
            <canvas
              ref={canvasRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                transform: "scaleX(-1)", // Đồng bộ mirror hoàn hảo với video
                pointerEvents: "none",
                display: cameraActive && showTrackingLines ? "block" : "none",
              }}
            />

            {!cameraActive && (
              <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>
                <Camera size={48} style={{ opacity: 0.4, marginBottom: 12 }} />
                <p>Camera đang tắt. Hãy chọn camera và bấm &quot;Bật Camera&quot; bên dưới.</p>
              </div>
            )}

            {/* Khung định vị mặt */}
            {cameraActive && (
              <div
                style={{
                  position: "absolute",
                  top: "15%",
                  bottom: "15%",
                  left: "22%",
                  right: "22%",
                  border: `2px dashed ${
                    faceCheck.ready && !isDeviating ? "#10b981" : isDeviating ? "#ef4444" : "#f59e0b"
                  }`,
                  borderRadius: 16,
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  padding: 8,
                  backgroundColor:
                    faceCheck.ready && !isDeviating
                      ? "rgba(16, 185, 129, 0.03)"
                      : isDeviating
                      ? "rgba(239, 68, 68, 0.05)"
                      : "rgba(245, 158, 11, 0.03)",
                  transition: "all 0.3s ease",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "#fff",
                    background:
                      faceCheck.ready && !isDeviating
                        ? "rgba(16, 185, 129, 0.85)"
                        : isDeviating
                        ? "rgba(239, 68, 68, 0.85)"
                        : "rgba(245, 158, 11, 0.85)",
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  {isDeviating ? "LỆCH VÙNG QUAN SÁT" : "Vùng khuyến nghị đặt mặt"}
                </span>
              </div>
            )}
          </div>

          {/* Điều khiển Camera & Tùy chọn Overlay */}
          <div style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <select
              value={selectedDevice}
              onChange={(e) => {
                setSelectedDevice(e.target.value);
                if (cameraActive) startCamera(e.target.value);
              }}
              style={{
                flex: 1,
                minWidth: 180,
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--line)",
                background: "#fff",
              }}
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowTrackingLines(!showTrackingLines)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid var(--line)",
                background: showTrackingLines ? "#ecfdf5" : "#fff",
                color: showTrackingLines ? "#059669" : "var(--muted)",
                fontWeight: 600,
                fontSize: 13,
              }}
              title="Bật/Tắt đường vẽ tracking mắt"
            >
              <Layers size={15} />
              {showTrackingLines ? "Đang hiện line mắt" : "Đã ẩn line mắt"}
            </button>

            {!cameraActive ? (
              <button
                onClick={() => startCamera(selectedDevice)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 6,
                  border: "none",
                  background: "var(--teal)",
                  color: "#fff",
                  fontWeight: 600,
                }}
              >
                Bật Camera
              </button>
            ) : (
              <button
                onClick={stopCamera}
                style={{
                  padding: "8px 18px",
                  borderRadius: 6,
                  border: "1px solid #ef4444",
                  background: "#fff",
                  color: "#ef4444",
                  fontWeight: 600,
                }}
              >
                Tắt Camera
              </button>
            )}
          </div>

          {error && (
            <div style={{ padding: "0 16px 16px", color: "#dc2626", fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        {/* Kết Quả Phân Tích & Bảng Chỉ Số */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Card trạng thái tổng quan */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid var(--line)",
              padding: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>
              Trạng Thái Giám Sát AI
            </h2>

            {/* Banner trạng thái */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderRadius: 8,
                background: isDeviating
                  ? "#fef2f2"
                  : faceCheck.ready
                  ? "#ecfdf5"
                  : "#fffbeb",
                border: `1px solid ${
                  isDeviating
                    ? "#fecaca"
                    : faceCheck.ready
                    ? "#a7f3d0"
                    : "#fde68a"
                }`,
                marginBottom: 16,
              }}
            >
              {isDeviating ? (
                <AlertTriangle size={24} color="#dc2626" />
              ) : faceCheck.ready ? (
                <CheckCircle2 size={24} color="#059669" />
              ) : (
                <AlertTriangle size={24} color="#d97706" />
              )}
              <div>
                <strong
                  style={{
                    display: "block",
                    color: isDeviating
                      ? "#991b1b"
                      : faceCheck.ready
                      ? "#065f46"
                      : "#92400e",
                  }}
                >
                  {isDeviating
                    ? "CẢNH BÁO LỆCH HƯỚNG NHÌN"
                    : faceCheck.ready
                    ? "ĐẠT TIÊU CHUẨN THI"
                    : "ĐANG CĂN CHỈNH"}
                </strong>
                <span
                  style={{
                    fontSize: 13,
                    color: isDeviating
                      ? "#b91c1c"
                      : faceCheck.ready
                      ? "#047857"
                      : "#b45309",
                  }}
                >
                  {faceCheck.message}
                </span>
              </div>
            </div>

            {/* Thông báo hướng mắt */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                background: isDeviating ? "#fff1f2" : "var(--bg)",
                border: isDeviating ? "1px solid #fda4af" : "1px solid var(--line)",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Eye size={16} color={isDeviating ? "#e11d48" : "var(--teal)"} />
                <strong style={{ color: isDeviating ? "#be123c" : "var(--ink)" }}>
                  Nhận diện hướng mắt & cử chỉ:
                </strong>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: isDeviating ? 600 : 500,
                  color: isDeviating ? "#9f1239" : "var(--ink)",
                  lineHeight: 1.5,
                }}
              >
                {faceCheck.eyeHint}
              </p>
            </div>

            {/* Bảng chỉ số chi tiết (Realtime Gauges) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--muted)" }}>
                <Activity size={14} />
                <span>CHỈ SỐ THỰC TẾ LANDMARK:</span>
              </div>

              {/* Tỷ lệ khuôn mặt */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "var(--bg)",
                }}
              >
                <span>Khuôn mặt trong khung hình (6% - 55%):</span>
                <strong>{faceCheck.areaPercent}%</strong>
              </div>

              {/* Tọa độ mắt ngang (Gaze X) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "var(--bg)",
                }}
              >
                <span>Liếc ngang (Mắt trái/phải):</span>
                <strong>
                  {eye ? (
                    eye.horizontal < 0.42
                      ? "Liếc phải (->)"
                      : eye.horizontal > 0.58
                      ? "Liếc trái (<-)"
                      : "Ở giữa (Thẳng)"
                  ) : (
                    "—"
                  )}{" "}
                  {eye ? `(${eye.horizontal.toFixed(3)})` : ""}
                </strong>
              </div>

              {/* Tọa độ mắt dọc (Gaze Y - Nhìn xuống) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "var(--bg)",
                }}
              >
                <span>Liếc dọc (Mắt nhìn xuống/lên):</span>
                <strong style={{ color: eye && eye.vertical > 0.65 ? "#dc2626" : "inherit" }}>
                  {eye ? (
                    eye.vertical > 0.65
                      ? "Nhìn xuống ⚠️"
                      : eye.vertical < 0.35
                      ? "Nhìn lên"
                      : "Ở giữa"
                  ) : (
                    "—"
                  )}{" "}
                  {eye ? `(${eye.vertical.toFixed(3)})` : ""}
                </strong>
              </div>

              {/* Góc quay đầu (Head Yaw) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "var(--bg)",
                }}
              >
                <span>Quay đầu (Head Yaw):</span>
                <strong style={{ color: eye && Math.abs(eye.headYaw) > 0.32 ? "#dc2626" : "inherit" }}>
                  {eye ? (
                    eye.headYaw < -0.32
                      ? "Quay sang phải ⚠️"
                      : eye.headYaw > 0.32
                      ? "Quay sang trái ⚠️"
                      : "Hướng thẳng"
                  ) : (
                    "—"
                  )}{" "}
                  {eye ? `(${eye.headYaw.toFixed(2)})` : ""}
                </strong>
              </div>

              {/* Góc cúi đầu (Head Pitch) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "var(--bg)",
                }}
              >
                <span>Cúi đầu (Head Pitch):</span>
                <strong style={{ color: eye && eye.headPitch > 0.28 ? "#dc2626" : "inherit" }}>
                  {eye ? (
                    eye.headPitch > 0.28
                      ? "Cúi đầu thấp ⚠️"
                      : eye.headPitch < -0.22
                      ? "Ngửa đầu cao"
                      : "Bình thường"
                  ) : (
                    "—"
                  )}{" "}
                  {eye ? `(${eye.headPitch.toFixed(2)})` : ""}
                </strong>
              </div>
            </div>
          </div>

          {/* Chú giải các đường Tracking Lines */}
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid var(--line)",
              padding: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <Compass size={18} color="var(--teal)" />
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                Ý Nghĩa Các Đường Tracking Trên Camera
              </h2>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--ink)", lineHeight: 1.7 }}>
              <li>
                <strong style={{ color: "#06b6d4" }}>Đường viền Cyan:</strong> Đường cong bám sát viền mí mắt trên và mí mắt dưới theo thời gian thực.
              </li>
              <li>
                <strong style={{ color: "#10b981" }}>Vòng tròn & chấm xanh/đỏ:</strong> Vị trí mống mắt (Iris) và con ngươi mắt (Pupil). Chuyển sang màu đỏ khi mắt bị lệch.
              </li>
              <li>
                <strong style={{ color: "#22c55e" }}>Tia vector mũi tên:</strong> Hướng nhìn phát ra từ con ngươi. Khi bạn liếc trái/phải hoặc nhìn xuống tài liệu, tia vector sẽ kéo dài và chỉ thẳng theo hướng mắt bạn đang nhìn!
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
