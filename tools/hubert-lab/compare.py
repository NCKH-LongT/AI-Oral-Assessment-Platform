"""Compare real HuBERT features on CPU. Similarity is never an exam grade."""

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

MODEL = "facebook/hubert-base-ls960"
REVISION = "dba3bb02fda4248b6e082697eee756de8fe8aa8a"
MAX_BYTES = 24 * 1024 * 1024


def load_manifest(path):
    spec = json.loads(path.read_text(encoding="utf-8-sig"))
    if (
        not isinstance(spec, dict)
        or not isinstance(spec.get("reference"), str)
        or not spec["reference"].strip()
    ):
        raise ValueError("reference must name an audio file")
    cases = spec.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= 100:
        raise ValueError("cases must contain 1 to 100 samples")
    names = set()
    for case in cases:
        if not isinstance(case, dict) or not all(
            isinstance(case.get(k), str) and case[k].strip() for k in ("name", "audio")
        ):
            raise ValueError("Every case needs nonempty name and audio strings")
        if case["name"] in names:
            raise ValueError("Case names must be unique")
        names.add(case["name"])
    root = path.resolve().parent
    paths = [root / spec["reference"]] + [root / c["audio"] for c in cases]
    for audio in paths:
        if not audio.is_file() or not 0 < audio.stat().st_size <= MAX_BYTES:
            raise ValueError(f"Missing, empty or larger than 24 MiB audio: {audio}")
    return spec, paths


def cosine(a, b):
    import numpy as np

    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    if (
        a.ndim != 1
        or a.shape != b.shape
        or not a.size
        or not np.isfinite(a).all()
        or not np.isfinite(b).all()
    ):
        raise ValueError("Invalid feature vectors")
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if not math.isfinite(denominator) or denominator <= 0:
        raise ValueError("Zero or non-finite feature vector")
    return float(np.clip(np.dot(a, b) / denominator, -1, 1))


def ffmpeg_binary():
    executable = shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError) as exc:
        raise ValueError("Install ffmpeg or imageio-ffmpeg to decode audio") from exc


def read_audio(path, executable):
    import numpy as np

    with path.open("rb") as source:
        data = source.read(MAX_BYTES + 1)
    if not 0 < len(data) <= MAX_BYTES:
        raise ValueError("Audio must be nonempty and at most 24 MiB")
    with tempfile.TemporaryDirectory(prefix="hubert-lab-") as temporary:
        source, target = Path(temporary) / "input.audio", Path(temporary) / "audio.f32"
        source.write_bytes(data)
        try:
            subprocess.run(
                [
                    executable,
                    "-nostdin",
                    "-v",
                    "error",
                    "-i",
                    str(source),
                    "-t",
                    "31",
                    "-map",
                    "0:a:0",
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-f",
                    "f32le",
                    str(target),
                ],
                check=True,
                timeout=60,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
        except (subprocess.SubprocessError, OSError) as exc:
            raise ValueError("Audio decoding failed or timed out") from exc
        waveform = np.fromfile(target, dtype="<f4")
    seconds = len(waveform) / 16000
    if not 0.2 <= seconds <= 30 or not np.isfinite(waveform).all():
        raise ValueError(
            "Audio must contain 0.2 to 30 seconds; longer recordings are rejected"
        )
    if float(np.max(np.abs(waveform))) < 1e-5:
        raise ValueError("Silent audio cannot be compared")
    return waveform, {
        "seconds": round(seconds, 3),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


class Encoder:
    def __init__(self, model, revision, cache_dir, offline, layer):
        import torch
        from transformers import AutoFeatureExtractor, HubertModel

        options = {
            "revision": revision,
            "cache_dir": str(cache_dir),
            "local_files_only": offline,
            "trust_remote_code": False,
        }
        self.extractor = AutoFeatureExtractor.from_pretrained(model, **options)
        # Official pinned checkpoint has pytorch_model.bin, not safetensors.
        # PyTorch >=2.6 with weights_only restricts deserialization to tensor state dicts.
        self.model = (
            HubertModel.from_pretrained(model, weights_only=True, **options)
            .to("cpu")
            .eval()
        )
        if not 0 <= layer <= self.model.config.num_hidden_layers:
            raise ValueError("layer is outside the model's hidden states")
        self.torch, self.layer, self.ffmpeg = torch, layer, ffmpeg_binary()

    def encode(self, path):
        waveform, metadata = read_audio(path, self.ffmpeg)
        batch = self.extractor(waveform, sampling_rate=16000, return_tensors="pt")
        with self.torch.inference_mode():
            result = self.model(**batch, output_hidden_states=True)
        frames = result.hidden_states[self.layer][0].float().cpu().numpy()
        return frames.mean(axis=0), metadata | {"frames": len(frames)}


def write_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False
    ) as target:
        temporary = Path(target.name)
        json.dump(report, target, ensure_ascii=False, indent=2, allow_nan=False)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument(
        "--revision",
        default=REVISION,
        help="Pinned 40-character Hugging Face commit SHA",
    )
    parser.add_argument("--layer", type=int, default=6)
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / ".data/hubert-cache",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args(argv)
    if (
        len(args.revision) != 40
        or any(c not in "0123456789abcdef" for c in args.revision.lower())
        or args.layer < 0
    ):
        parser.error(
            "revision must be a 40-character commit SHA; layer must be nonnegative"
        )
    try:
        spec, paths = load_manifest(args.manifest)
        output = args.output or args.manifest.resolve().parent / "hubert-results.json"
        if output.resolve() in {p.resolve() for p in paths + [args.manifest]}:
            raise ValueError("output must not overwrite a manifest or audio file")
    except (OSError, ValueError, TypeError, KeyError) as exc:
        parser.error(str(exc))
    try:
        import numpy
        import torch
        import transformers

        print(f"Loading {args.model}@{args.revision} on CPU", flush=True)
        encoder = Encoder(
            args.model, args.revision, args.cache_dir, args.offline, args.layer
        )
        reference, metadata = encoder.encode(paths[0])
    except (ImportError, OSError, ValueError, RuntimeError) as exc:
        parser.exit(2, f"Cannot load model/reference ({type(exc).__name__}): {exc}\n")
    report = {
        "experimental": True,
        "metric": f"cosine_of_mean_layer_{args.layer}_features",
        "warning": "Similarity, NOT pronunciation scores. Speaker, content and recording conditions affect this metric.",
        "model": args.model,
        "revision": args.revision,
        "device": "cpu",
        "sample_rate": 16000,
        "versions": {
            "torch": torch.__version__,
            "transformers": transformers.__version__,
            "numpy": numpy.__version__,
        },
        "reference_audio": spec["reference"],
        "reference": metadata,
        "cases": [],
    }
    write_report(output, report)
    for case, path in zip(spec["cases"], paths[1:], strict=True):
        print(f"Processing {case['name']}", flush=True)
        begin = time.monotonic()
        try:
            vector, metadata = encoder.encode(path)
            row = {
                "name": case["name"],
                "audio": case["audio"],
                **metadata,
                "cosine_similarity": cosine(reference, vector),
            }
        except (ImportError, OSError, ValueError, RuntimeError) as exc:
            row = {
                "name": case["name"],
                "audio": case["audio"],
                "error": type(exc).__name__ + ": " + str(exc),
            }
        row["elapsed_seconds"] = round(time.monotonic() - begin, 3)
        report["cases"].append(row)
        write_report(output, report)
    print(f"Saved {output.resolve()}")
    return int(any("error" in row for row in report["cases"]))


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    raise SystemExit(main())
