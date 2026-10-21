const base = require("./package.json").build;
module.exports = {
  ...base,
  directories: { ...base.directories, output: "dist-light" },
  artifactName: "OralAI-${version}-Windows-Setup-Light.${ext}",
  extraMetadata: { modelDownloadOnFirstRun: true },
  extraResources: base.extraResources.map((resource) =>
    resource.to === "stt"
      ? { ...resource, filter: ["oral-stt/**/*", "WHISPER-LICENSE.txt"] }
      : resource,
  ),
};
