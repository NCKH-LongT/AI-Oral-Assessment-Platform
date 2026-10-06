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

module.exports = { validHotwords };
