const { existsSync } = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
module.exports = async function (context) {
  const root = path.join(__dirname, "resources/stt");
  const binary =
    context.electronPlatformName === "win32" ? "oral-stt.exe" : "oral-stt";
  for (const file of [
    path.join("oral-stt", binary),
    "model/model.bin",
    "model/tokenizer.json",
    "model/preprocessor_config.json",
    "model/oral-model.json",
    "model/LICENSE.txt",
    "whisper-small/model.bin",
    "whisper-small/config.json",
    "whisper-small/tokenizer.json",
    "whisper-small/vocabulary.txt",
    "whisper-small/oral-model.json",
    "whisper-small/LICENSE.txt",
  ]) {
    if (!existsSync(path.join(root, file)))
      throw new Error(
        "Offline STT bundle missing: " +
          file +
          ". Run python scripts/build_desktop_stt.py on the target platform before packaging.",
      );
  }
  if (context.electronPlatformName === process.platform) {
    try {
      const result = JSON.parse(
        execFileSync(path.join(root, "oral-stt", binary), ["--capabilities"], {
          timeout: 15000,
          encoding: "utf8",
        }),
      );
      if (
        result.protocol !== 2 ||
        !result.hotwords ||
        !["phowhisper-small", "whisper-small"].every((id) =>
          result.models?.includes(id),
        )
      )
        throw new Error("Missing capabilities");
    } catch {
      throw new Error(
        "STT runtime is outdated. Run python scripts/build_desktop_stt.py before starting or packaging desktop.",
      );
    }
  }
};
