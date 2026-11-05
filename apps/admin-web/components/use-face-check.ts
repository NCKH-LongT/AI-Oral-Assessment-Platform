"use client";
import { useEffect, useState, type RefObject } from "react";
import type { Framing } from "../lib/face-framing";
import type { EyePosition } from "../lib/eye-position";
import type { EyeMeshData } from "../lib/face-worker";

export type FaceCheckState = Framing & {
  streamId?: string;
  eye?: EyePosition;
  eyeMesh?: EyeMeshData;
  calibrated?: boolean;
  awayCount?: number;
};

export function useFaceCheck(
  video: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  streamId?: string,
) {
  const [eyeHint, setEyeHint] = useState("Chưa hiệu chuẩn hướng mắt");
  const [currentEye, setCurrentEye] = useState<EyePosition | undefined>(undefined);
  const [currentEyeMesh, setCurrentEyeMesh] = useState<EyeMeshData>(null);
  const [calibrated, setCalibrated] = useState(false);
  const [awayCount, setAwayCount] = useState(0);
  const [state, setState] = useState<Framing & { streamId?: string }>({
    ready: false,
    areaPercent: 0,
    message: "Đang chuẩn bị kiểm tra khuôn mặt…",
  });

  useEffect(() => {
    if (!enabled) return;
    const worker = new Worker(
      new URL("../lib/face-worker.ts", import.meta.url),
    );
    let disposed = false,
      loaded = false,
      busy = false,
      streak = 0,
      lastResult = 0,
      lastVideoTime = -1;

    const baseline: Array<{ h: number; v: number; yaw: number; pitch: number }> = [];
    let away = 0;

    const timeout = setTimeout(() => {
      if (!loaded)
        setState({
          ready: false,
          areaPercent: 0,
          message: "Tải model quá lâu. Kiểm tra kết nối và tải lại trang.",
        });
    }, 30000);

    worker.onmessage = (event) => {
      if (disposed) return;
      busy = false;

      if (event.data.type === "loaded") {
        loaded = true;
        clearTimeout(timeout);
      }

      if (event.data.type === "error") {
        loaded = false;
        setState({ ready: false, areaPercent: 0, message: event.data.message });
      }

      if (event.data.type === "result") {
        lastResult = Date.now();
        const eye: EyePosition | undefined = event.data.eye;
        const eyeMesh: EyeMeshData = event.data.eyeMesh || null;
        setCurrentEye(eye);
        setCurrentEyeMesh(eyeMesh);

        if (!eye || !event.data.ready) {
          if (!event.data.ready) {
            setEyeHint("Cần căn chỉnh khuôn mặt vào giữa khung hình trước.");
          } else {
            setEyeHint("Không phát hiện được mắt (nhắm mắt hoặc góc quay quá khuất).");
          }
        } else if (baseline.length < 8) {
          baseline.push({
            h: eye.horizontal,
            v: eye.vertical,
            yaw: eye.headYaw,
            pitch: eye.headPitch,
          });
          setEyeHint(
            `Đang hiệu chuẩn mắt & hướng nhìn (${baseline.length}/8): hãy nhìn thẳng camera…`,
          );
          setCalibrated(false);
        } else {
          setCalibrated(true);
          // Compute baseline centers
          const sortedH = [...baseline.map((b) => b.h)].sort((a, b) => a - b);
          const centerH = sortedH[Math.floor(sortedH.length / 2)];
          const sortedV = [...baseline.map((b) => b.v)].sort((a, b) => a - b);
          const centerV = sortedV[Math.floor(sortedV.length / 2)];
          const sortedYaw = [...baseline.map((b) => b.yaw)].sort((a, b) => a - b);
          const centerYaw = sortedYaw[Math.floor(sortedYaw.length / 2)];
          const sortedPitch = [...baseline.map((b) => b.pitch)].sort((a, b) => a - b);
          const centerPitch = sortedPitch[Math.floor(sortedPitch.length / 2)];

          const deltaH = eye.horizontal - centerH;
          const deltaV = eye.vertical - centerV;
          const deltaYaw = eye.headYaw - centerYaw;
          const deltaPitch = eye.headPitch - centerPitch;

          let deviationReason: string | null = null;
          if (Math.abs(deltaYaw) > 0.28) {
            deviationReason =
              deltaYaw > 0 ? "Đang quay đầu sang trái" : "Đang quay đầu sang phải";
          } else if (deltaPitch > 0.20 || deltaV > 0.12) {
            deviationReason = "Đang cúi đầu/nhìn xuống dưới (nghi vấn xem phao/điện thoại)";
          } else if (deltaPitch < -0.22 || deltaV < -0.15) {
            deviationReason = "Đang ngửa đầu/nhìn lên trên";
          } else if (Math.abs(deltaH) > 0.075) {
            deviationReason =
              deltaH > 0 ? "Đang liếc mắt sang trái" : "Đang liếc mắt sang phải";
          }

          if (deviationReason) {
            away = Math.min(away + 1, 15);
            setAwayCount(away);
            if (away >= 3) {
              setEyeHint(`⚠️ CẢNH BÁO: ${deviationReason}. Hãy nhìn thẳng vào màn hình!`);
            } else {
              setEyeHint(`Cảnh báo nhẹ: ${deviationReason}.`);
            }
          } else {
            away = Math.max(0, away - 1);
            setAwayCount(away);
            setEyeHint("Hướng nhìn tập trung vào màn hình (Hợp lệ).");
          }
        }

        streak = event.data.ready ? streak + 1 : 0;
        setState({
          streamId,
          ready: streak >= 6,
          areaPercent: event.data.areaPercent,
          message:
            event.data.ready && streak < 6
              ? "Giữ mặt trong khung hình khoảng 3 giây…"
              : event.data.message,
        });
      }
    };

    worker.onerror = () => {
      loaded = false;
      setState({
        ready: false,
        areaPercent: 0,
        message:
          "Không tải được bộ kiểm tra camera. Tải lại trang hoặc liên hệ khảo thí.",
      });
    };

    worker.postMessage({ type: "init" });

    const timer = setInterval(async () => {
      if (lastResult && Date.now() - lastResult > 3000) {
        streak = 0;
        setState({
          ready: false,
          areaPercent: 0,
          message: "Đang chờ hình camera mới…",
        });
      }
      const element = video.current;
      if (
        !loaded ||
        busy ||
        !element ||
        element.readyState < 2 ||
        document.hidden ||
        element.currentTime === lastVideoTime
      )
        return;
      lastVideoTime = element.currentTime;
      busy = true;
      try {
        const bitmap = await createImageBitmap(element);
        if (disposed) {
          bitmap.close();
          return;
        }
        worker.postMessage(
          { type: "frame", bitmap, timestamp: performance.now() },
          [bitmap],
        );
      } catch {
        busy = false;
        streak = 0;
        setState({
          ready: false,
          areaPercent: 0,
          message: "Không đọc được hình camera.",
        });
      }
    }, 400);

    return () => {
      disposed = true;
      clearInterval(timer);
      clearTimeout(timeout);
      worker.terminate();
    };
  }, [enabled, video, streamId]);

  return {
    ...(enabled
      ? state
      : {
          ready: true,
          areaPercent: 0,
          message: "Không yêu cầu kiểm tra camera.",
        }),
    ready: !enabled || (state.ready && state.streamId === streamId),
    eyeHint,
    eye: currentEye,
    eyeMesh: currentEyeMesh,
    calibrated,
    awayCount,
  };
}
