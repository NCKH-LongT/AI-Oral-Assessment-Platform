const { existsSync } = require("node:fs");
const path = require("node:path");
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
  ]) {
    if (!existsSync(path.join(root, file)))
      throw new Error(
        "Offline STT bundle missing: " +
          file +
          ". Run python scripts/build_desktop_stt.py on the target platform before packaging.",
      );
  }
};
