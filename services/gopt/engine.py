import importlib.util
import json
import os
import re
import signal
import subprocess
import time
import wave
from pathlib import Path

import kaldiio
import numpy as np


def run(command, folder, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("GOPT deadline exceeded")
    with (folder / "processing.log").open("ab") as output:
        process = subprocess.Popen(command, cwd=folder, stdout=output, stderr=output, start_new_session=True)
        try:
            if process.wait(timeout=remaining):
                raise ValueError("Audio alignment failed")
        except BaseException as exc:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            if isinstance(exc, subprocess.TimeoutExpired):
                raise TimeoutError("GOPT deadline exceeded") from exc
            raise


def phone_inventory(path):
    symbols, pure, mapping = {}, {}, []
    for line in path.read_text().splitlines():
        symbol, identifier = line.split()
        if "#" in symbol:
            continue
        symbols[symbol] = int(identifier)
    for symbol, identifier in sorted(symbols.items(), key=lambda entry: entry[1]):
        base = re.sub(r"\d", "", re.sub(r"_[BIES]$", "", symbol))
        pure.setdefault(base, len(pure))
        if identifier:
            mapping.append(f"{identifier} {pure[base]}")
    if len(pure) != 42 or [pure.get(name) for name in ("<eps>", "SIL", "SPN")] != [0, 1, 2]:
        raise ValueError("Acoustic phone inventory does not match the GOPT checkpoint")
    return symbols, pure, "\n".join(mapping) + "\n"


def read_lexicon(path):
    lexicon = {}
    for line in path.read_text().splitlines():
        word, *phones = line.split()
        if phones:
            lexicon.setdefault(word, phones)
    return lexicon


def canonical_words(transcript, lexicon):
    normalized = transcript.replace("’", "'").upper()
    if any(character.isalpha() and not "A" <= character <= "Z" for character in normalized):
        raise ValueError("English transcript required")
    words = re.findall(r"[A-Z]+(?:'[A-Z]+)*|[0-9]+", normalized)
    if not words or len(words) > 600 or any(word not in lexicon for word in words):
        raise ValueError("Transcript contains unsupported words; spell numbers out in English")
    return words


def word_chunks(words, lexicon):
    chunks, current, count = [], [], 0
    for word in words:
        length = len(lexicon[word])
        if length > 50:
            raise ValueError("Word exceeds GOPT context")
        if count + length > 50:
            chunks.append(current)
            current, count = [], 0
        current.append(word)
        count += length
    if current:
        chunks.append(current)
    return chunks


def inputs(features, phone_ids):
    if not 0 < len(features) <= 50 or np.shape(features) != (len(phone_ids), 84):
        raise ValueError("Invalid GOPT feature shape")
    if not np.isfinite(features).all() or any(identifier not in range(39) for identifier in phone_ids):
        raise ValueError("Invalid GOPT features or phone IDs")
    padded = np.zeros((1, 50, 84), dtype=np.float32)
    phones = np.full((1, 50), -1, dtype=np.int64)
    padded[0, :len(features)] = (np.asarray(features) - 3.203) / 4.045
    phones[0, :len(phone_ids)] = phone_ids
    return padded, phones


class Engine:
    def __init__(self):
        import torch

        # Let PyTorch choose compute parallelism; server.gate serializes requests.
        self.torch = torch
        self.assets = Path(os.environ.get("GOPT_ASSETS", "/opt/gopt-assets"))
        self.max_seconds = int(os.environ.get("GOPT_MAX_AUDIO_SECONDS", "120"))
        self.timeout = int(os.environ.get("GOPT_JOB_TIMEOUT", "900"))
        self.symbols, self.pure, self.mapping = phone_inventory(self.assets / "lang/phones.txt")
        self.lexicon = read_lexicon(self.assets / "lexicon.txt")
        self.training_phones = json.loads((self.assets / "training_phones.json").read_text())
        if set(self.training_phones.values()) != set(range(39)):
            raise ValueError("Invalid training phone mapping")
        self.revision = json.loads((self.assets / "manifest.json").read_text())["gopt_revision"]
        spec = importlib.util.spec_from_file_location("gopt_model", self.assets / "gopt_model.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.model = module.GOPT(embed_dim=24, num_heads=1, depth=3, input_dim=84)
        state = torch.load(self.assets / "gopt.pth", map_location="cpu", weights_only=True)
        self.model.load_state_dict({key.removeprefix("module."): value for key, value in state.items()}, strict=True)
        self.model.eval()

    def assess(self, folder, transcript):
        words = canonical_words(transcript, self.lexicon)
        deadline = time.monotonic() + self.timeout
        run(["ffmpeg", "-nostdin", "-v", "error", "-threads", "1", "-filter_threads", "1",
             "-filter_complex_threads", "1", "-i", str(folder / "input.audio"),
             "-t", str(self.max_seconds + 1), "-map", "0:a:0", "-ac", "1", "-ar", "16000",
             "-c:a", "pcm_s16le", "-threads", "1", str(folder / "audio.wav")], folder, deadline)
        with wave.open(str(folder / "audio.wav"), "rb") as audio:
            duration = audio.getnframes() / audio.getframerate()
        if not 0.2 <= duration <= self.max_seconds:
            raise ValueError("Audio duration outside supported limits")
        data = folder / "data"
        data.mkdir()
        (data / "wav.scp").write_text(f"answer {folder / 'audio.wav'}\n")
        (data / "utt2spk").write_text("answer speaker\n")
        (data / "spk2utt").write_text("speaker answer\n")
        (data / "text").write_text("answer " + " ".join(words) + "\n")
        (folder / "text.int").write_text("answer " + " ".join(str(index + 1) for index in range(len(words))) + "\n")
        phone_lines, expected, canonical = [], [], []
        for index, word in enumerate(words):
            pronunciation = self.lexicon[word]
            identifiers = []
            for position, phone in enumerate(pronunciation):
                suffix = "S" if len(pronunciation) == 1 else "B" if position == 0 else "E" if position == len(pronunciation) - 1 else "I"
                identifiers.append(str(self.symbols[phone + "_" + suffix]))
                base = re.sub(r"\d", "", phone)
                expected.append(self.pure[base])
                canonical.append(self.training_phones[base])
            phone_lines.append(f"answer.{index} " + " ".join(identifiers))
        (folder / "text-phone.int").write_text("\n".join(phone_lines) + "\n")
        (folder / "phone-map.int").write_text(self.mapping)
        run(["bash", str(Path(__file__).with_name("extract.sh"))], folder, deadline)
        vectors = sorted(kaldiio.load_ark(str(folder / "features.ark")), key=lambda item: int(item[0].rsplit(".", 1)[1]))
        if len(vectors) != len(expected):
            raise ValueError("Incomplete audio alignment")
        features = []
        for (_, vector), phone in zip(vectors, expected, strict=True):
            if vector.shape != (85,) or int(vector[0]) != phone:
                raise ValueError("Audio alignment differs from canonical phone sequence")
            features.append(vector[1:])
        totals, offset, segments = np.zeros(5), 0, 0
        with self.torch.inference_mode():
            for chunk in word_chunks(words, self.lexicon):
                length = sum(len(self.lexicon[word]) for word in chunk)
                padded, phone_ids = inputs(features[offset:offset + length], canonical[offset:offset + length])
                outputs = self.model(self.torch.from_numpy(padded), self.torch.from_numpy(phone_ids))
                scores = np.array([output.item() for output in outputs[:5]])
                if not np.isfinite(scores).all():
                    raise ValueError("Non-finite GOPT score")
                totals += np.clip(scores * 5, 0, 10) * length
                offset += length
                segments += 1
        names = ("accuracy", "completeness", "fluency", "prosody", "total")
        return {"status": "COMPLETED", "model": "gopt-librispeech", "model_revision": self.revision,
                "scores": {name: round(float(score / offset), 2) for name, score in zip(names, totals, strict=True)},
                "segments": segments, "phones": offset, "reference_source": "transcript"}
