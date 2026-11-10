import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { assessFraming } from "./face-framing";
import { eyePosition } from "./eye-position";

export type Point2D = { x: number; y: number };

export type EyeMeshData = {
  rightEye: Point2D[];
  leftEye: Point2D[];
  rightIrisCenter: Point2D | null;
  leftIrisCenter: Point2D | null;
  rightIris: Point2D[];
  leftIris: Point2D[];
  nose: Point2D | null;
} | null;

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
      const face0 = result.faceLandmarks.length === 1 ? result.faceLandmarks[0] : null;

      let eyeMesh: EyeMeshData = null;
      if (face0) {
        eyeMesh = {
          rightEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
            .map((i) => (face0[i] ? { x: face0[i].x, y: face0[i].y } : null))
            .filter((p): p is Point2D => p !== null),
          leftEye: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
            .map((i) => (face0[i] ? { x: face0[i].x, y: face0[i].y } : null))
            .filter((p): p is Point2D => p !== null),
          rightIrisCenter: face0[468] ? { x: face0[468].x, y: face0[468].y } : null,
          leftIrisCenter: face0[473] ? { x: face0[473].x, y: face0[473].y } : null,
          rightIris: [468, 469, 470, 471, 472]
            .map((i) => (face0[i] ? { x: face0[i].x, y: face0[i].y } : null))
            .filter((p): p is Point2D => p !== null),
          leftIris: [473, 474, 475, 476, 477]
            .map((i) => (face0[i] ? { x: face0[i].x, y: face0[i].y } : null))
            .filter((p): p is Point2D => p !== null),
          nose: face0[1] ? { x: face0[1].x, y: face0[1].y } : null,
        };
      }

      self.postMessage({
        type: "result",
        ...assessFraming(result.faceLandmarks),
        eye: face0 ? eyePosition(face0) : null,
        eyeMesh,
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
