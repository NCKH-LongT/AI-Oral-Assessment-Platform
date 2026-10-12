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
  "whisper-small": { label: "Whisper-small", folder: "whisper-small" },
});

function validModel(model) {
  return typeof model === "string" && Object.hasOwn(STT_MODELS, model);
}

async function inspectSttModels(modelPath, exists, checkRuntime) {
  const path = require("node:path");
  const models = Object.entries(STT_MODELS).map(([id, model]) => ({
    id,
    label: model.label,
    available: exists(path.join(modelPath(id), "model.bin")),
  }));
  // A source checkout may have neither a model nor Python dependencies.
  // Report the missing model without trying to launch the unused runtime.
  if (models.some((model) => model.available)) await checkRuntime();
  return models;
}

function missingModelResult() {
  return {
    transcript: "",
    stt_confidence: null,
    stt_skipped_reason: "MODEL_MISSING",
  };
}

module.exports = {
  validHotwords,
  validModel,
  STT_MODELS,
  inspectSttModels,
  missingModelResult,
};
