const path = require("node:path");
const { createHash } = require("node:crypto");
const { createReadStream, createWriteStream } = require("node:fs");
const { mkdir, stat, rename, rm, copyFile, writeFile } = require("node:fs/promises");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { setTimeout: delay } = require("node:timers/promises");
const manifest = require("./model-manifest.json");

function createModelInstaller({ directory, license, onProgress = () => {}, fetchFile = fetch, spec = manifest }) {
  const target = path.join(directory, "whisper-small");
  const staging = path.join(directory, "whisper-small.download");
  const controller = new AbortController();
  let running;
  let state = { stage: "idle", downloaded: 0, total: spec.files.reduce((n, f) => n + f.size, 0), file: "" };
  function report(update) {
    state = { ...state, ...update };
    onProgress(state);
  }
  async function valid(file, expected) {
    try {
      if ((await stat(file)).size !== expected.size) return false;
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      return hash.digest("hex") === expected.sha256;
    } catch { return false; }
  }
  async function ready() {
    for (const file of spec.files)
      if (!(await valid(path.join(target, file.name), file))) return false;
    return true;
  }
  async function install() {
    if (await ready()) {
      report({ stage: "ready", downloaded: state.total });
      return target;
    }
    await mkdir(staging, { recursive: true });
    let completed = 0;
    for (const file of spec.files) {
      controller.signal.throwIfAborted();
      const destination = path.join(staging, file.name);
      if (!(await valid(destination, file))) {
        const partial = destination + ".part";
        for (let attempt = 1; attempt <= 3; attempt++) {
          report({ stage: "downloading", file: file.name, downloaded: completed, attempt });
          try {
            const response = await fetchFile(
              `https://huggingface.co/${spec.id}/resolve/${spec.revision}/${file.name}`,
              { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15 * 60 * 1000)]) },
            );
            if (!response.ok || !response.body) throw new Error(`Không tải được ${file.name} (HTTP ${response.status}).`);
            let received = 0, lastUpdate = 0;
            const hash = createHash("sha256");
            const meter = new Transform({
              transform(chunk, encoding, callback) {
                received += chunk.length;
                if (received > file.size) return callback(new Error("Dung lượng tải về không hợp lệ."));
                hash.update(chunk);
                if (Date.now() - lastUpdate > 200) {
                  report({ downloaded: completed + received });
                  lastUpdate = Date.now();
                }
                callback(null, chunk);
              },
            });
            await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(partial), { signal: controller.signal });
            if (received !== file.size || hash.digest("hex") !== file.sha256)
              throw new Error(`Kiểm tra SHA-256 của ${file.name} thất bại. Đang tải lại.`);
            await rename(partial, destination);
            break;
          } catch (error) {
            await rm(partial, { force: true });
            if (attempt === 3 || controller.signal.aborted) throw error;
            report({ stage: "retrying", error: error.message });
            await delay(1500 * attempt, undefined, { signal: controller.signal });
          }
        }
      }
      completed += file.size;
      report({ downloaded: completed });
    }
    await copyFile(license, path.join(staging, "LICENSE.txt"));
    await writeFile(path.join(staging, "oral-model.json"), JSON.stringify({ id: spec.id, revision: spec.revision }));
    // Promote only a completely verified model. A failed download never becomes available to STT.
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);
    report({ stage: "ready", downloaded: state.total });
    return target;
  }
  return {
    target,
    ready,
    status: () => state,
    cancel: () => controller.abort(),
    start() {
      if (!running) running = install().catch((error) => {
        report({ stage: "error", error: error.message });
        throw error;
      }).finally(() => { running = undefined; });
      return running;
    },
  };
}
module.exports = { createModelInstaller };
