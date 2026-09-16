import { mkdirSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "../public/audio");
mkdirSync(target, { recursive: true });
for (const file of ["rnnoiseWorklet.js", "rnnoise.wasm", "rnnoise_simd.wasm"]) {
  copyFileSync(
    require.resolve("@sapphi-red/web-noise-suppressor/" + file),
    path.join(target, file),
  );
}
copyFileSync(
  path.resolve(
    path.dirname(require.resolve("@sapphi-red/web-noise-suppressor")),
    "../LICENSE",
  ),
  path.join(target, "LICENSE.txt"),
);
copyFileSync(
  path.join(__dirname, "../licenses/RNNOISE.txt"),
  path.join(target, "RNNOISE.txt"),
);
