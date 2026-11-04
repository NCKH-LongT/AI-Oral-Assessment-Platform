"use client";
import { useEffect, useState, type RefObject } from "react";
import type { Framing } from "../lib/face-framing";
export function useFaceCheck(
  video: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  streamId?: string,
) {
  const [eyeHint, setEyeHint] = useState("Chưa hiệu chuẩn hướng mắt");
  const [state, setState] = useState<Framing>({
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
      lastResult = 0;
    const baseline: number[] = [];
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
        const eye = event.data.eye;
        if (!eye || !event.data.ready) {
          away = 0;
          setEyeHint("Không đủ tín hiệu mắt; nhìn thẳng camera để đo.");
        } else if (baseline.length < 12) {
          baseline.push(eye.horizontal);
          setEyeHint("Đang hiệu chuẩn mắt: nhìn thẳng camera khoảng 6 giây.");
        } else {
          const center = [...baseline].sort((a, b) => a - b)[6];
          away = Math.abs(eye.horizontal - center) > 0.16 ? away + 1 : 0;
          setEyeHint(
            away >= 6
              ? "Mắt lệch so với lúc hiệu chuẩn. Kiểm tra lại tư thế; đây chỉ là ước lượng."
              : "Đã có tín hiệu mắt tương đối; không dùng để kết luận gian lận.",
          );
        }

        streak = event.data.ready ? streak + 1 : 0;
        setState({
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
        document.hidden
      )
        return;
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
    }, 500);
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
    eyeHint,
  };
}
