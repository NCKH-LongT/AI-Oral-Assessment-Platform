import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { assessFraming } from "./face-framing";
import { eyePosition } from "./eye-position";
let model: FaceLandmarker | null = null;
self.onmessage = async (event: MessageEvent) => {
  const { type, bitmap, timestamp } = event.data;
  try {
    if (type === "init") {
      const vision = await FilesetResolver.forVisionTasks("/vision/wasm");
      model = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/vision/face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 2,
      });
      self.postMessage({ type: "loaded" });
    } else if (type === "frame" && model) {
      const result = model.detectForVideo(bitmap, timestamp);
      self.postMessage({
        type: "result",
        ...assessFraming(result.faceLandmarks),
        eye:
          result.faceLandmarks.length === 1
            ? eyePosition(result.faceLandmarks[0])
            : null,
      });
    }
  } catch {
    self.postMessage({
      type: "error",
      message:
        "Không chạy được kiểm tra khuôn mặt. Kiểm tra model và tải lại trang.",
    });
  } finally {
    bitmap?.close();
  }
};
