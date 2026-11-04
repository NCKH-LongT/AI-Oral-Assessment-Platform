import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const base = process.env.VISION_BASE_URL || "http://localhost:3106";
const folder = path.resolve("apps/admin-web/.next/static/chunks");
const files = await fs.readdir(folder);
let workerPath;
for (const name of files.filter((f) => f.endsWith(".js"))) {
  if (
    (await fs.readFile(path.join(folder, name), "utf8")).includes(
      "/vision/wasm",
    )
  ) {
    workerPath = "/_next/static/chunks/" + name;
    break;
  }
}
if (!workerPath) throw new Error("Build web first; worker bundle missing");
const portrait = await fs.readFile(
  process.env.VISION_FIXTURE || ".data/mediapipe-portrait.jpg",
);
const browser = await chromium.launch({
  channel: process.env.TEST_BROWSER_CHANNEL || "msedge",
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.route("**/vision-test-portrait.jpg", (route) =>
    route.fulfill({ contentType: "image/jpeg", body: portrait }),
  );
  await page.goto(base);
  const result = await page.evaluate(async (workerPath) => {
    const image = new Image();
    image.src = "/vision-test-portrait.jpg";
    await image.decode();
    const worker = new Worker(workerPath);
    let waiting;
    worker.onmessage = (e) => waiting?.resolve(e.data);
    worker.onerror = (e) => waiting?.reject(new Error(e.message));
    const receive = () =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("worker timeout")),
          45000,
        );
        waiting = {
          resolve: (v) => {
            clearTimeout(timeout);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timeout);
            reject(e);
          },
        };
      });
    try {
      const loaded = receive();
      worker.postMessage({ type: "init" });
      const init = await loaded;
      if (init.type !== "loaded") throw new Error(JSON.stringify(init));
      const results = [];
      for (const mode of ["blank", "portrait", "framed", "tiny"]) {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (mode === "portrait") context.drawImage(image, 0, 0);
        if (mode === "framed")
          context.drawImage(
            image,
            image.width * 0.22,
            0,
            image.width * 0.55,
            image.height * 0.43,
            canvas.width * 0.2,
            canvas.height * 0.15,
            canvas.width * 0.6,
            canvas.height * 0.7,
          );
        if (mode === "tiny")
          context.drawImage(
            image,
            canvas.width * 0.45,
            canvas.height * 0.45,
            canvas.width * 0.1,
            canvas.height * 0.1,
          );
        const bitmap = await createImageBitmap(canvas),
          response = receive();
        worker.postMessage(
          { type: "frame", bitmap, timestamp: performance.now() },
          [bitmap],
        );
        results.push({ mode, ...(await response) });
      }
      return results;
    } finally {
      worker.terminate();
    }
  }, workerPath);
  console.log(JSON.stringify(result, null, 2));
  if (
    result[0].ready ||
    result[1].areaPercent <= 0 ||
    !result[2].ready ||
    result[3].ready ||
    result.some((r) => r.type !== "result")
  )
    throw new Error("Vision fixture expectations failed");
} finally {
  await browser.close();
}
