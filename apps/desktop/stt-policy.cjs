// Keep in sync with the course hotword schema and web editor.
function validHotwords(words) {
  return (
    words === undefined ||
    (Array.isArray(words) &&
      words.length <= 500 &&
      words.every(
        (word) => typeof word === "string" && [...word].length <= 100,
      ) &&
      [...words.join("")].length <= 10000)
  );
}

const STT_MODELS = Object.freeze({
  "phowhisper-small": { label: "PhoWhisper-small", folder: "model" },
  "whisper-small": { label: "Whisper-small", folder: "whisper-small" },
});

function validModel(model) {
  return typeof model === "string" && Object.hasOwn(STT_MODELS, model);
}

module.exports = { validHotwords, validModel, STT_MODELS };
