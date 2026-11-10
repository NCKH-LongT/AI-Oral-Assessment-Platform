#!/usr/bin/env python3
"""Sequential experiments against the project's real GOPT HTTP service."""

import argparse
import csv
import hashlib
import json
import math
import mimetypes
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

MAX_BYTES = 24 * 1024 * 1024
SCORES = ("accuracy", "completeness", "fluency", "prosody", "total")


def validate_response(value):
    if (
        not isinstance(value, dict)
        or value.get("status") != "COMPLETED"
        or value.get("model") != "gopt-librispeech"
    ):
        raise ValueError("Invalid GOPT status/model")
    if (
        not isinstance(value.get("model_revision"), str)
        or not 0 < len(value["model_revision"].strip()) <= 100
    ):
        raise ValueError("Missing model revision")
    scores = value.get("scores")
    if not isinstance(scores, dict) or any(
        type(scores.get(k)) not in (int, float)
        or not math.isfinite(scores[k])
        or not 0 <= scores[k] <= 10
        for k in SCORES
    ):
        raise ValueError("GOPT scores must be finite numbers between 0 and 10")
    for key, limit in [("segments", 200), ("phones", 10000)]:
        if type(value.get(key)) is not int or not 1 <= value[key] <= limit:
            raise ValueError("Invalid GOPT segment/phone count")
    if value.get("reference_source") != "transcript":
        raise ValueError("Unexpected reference source")
    return {
        "status": value["status"],
        "model": value["model"],
        "model_revision": value["model_revision"],
        "scores": {name: value["scores"][name] for name in SCORES},
        "segments": value["segments"],
        "phones": value["phones"],
        "reference_source": value["reference_source"],
    }


def assess(url, audio, transcript, timeout):
    start = time.monotonic()
    hashes = {}
    try:
        with audio.open("rb") as source:
            data = source.read(MAX_BYTES + 1)
        if not 0 < len(data) <= MAX_BYTES:
            raise ValueError("Audio must be nonempty and at most 24 MiB")
        hashes = {
            "audio_sha256": hashlib.sha256(data).hexdigest(),
            "transcript_sha256": hashlib.sha256(transcript.encode("utf-8")).hexdigest(),
        }
        boundary = "goptlab-" + uuid.uuid4().hex
        mime = mimetypes.guess_type(audio.name)[0] or "application/octet-stream"
        body = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="transcript"\r\n\r\n'.encode()
            + transcript.encode("utf-8")
            + b"\r\n"
            + f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="audio"\r\nContent-Type: {mime}\r\n\r\n'.encode()
            + data
            + f"\r\n--{boundary}--\r\n".encode()
        )
        request = urllib.request.Request(
            url.rstrip("/") + "/assess",
            data=body,
            headers={"Content-Type": "multipart/form-data; boundary=" + boundary},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read(1024 * 1024 + 1)
        if len(payload) > 1024 * 1024:
            raise ValueError("GOPT response is too large")
        result = {"response": validate_response(json.loads(payload))}
    except urllib.error.HTTPError as error:
        result = {"error": f"HTTP {error.code}", "http_status": error.code}
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
        result = {"error": type(error).__name__ + ": " + str(error)}
    return {"elapsed_seconds": round(time.monotonic() - start, 3), **hashes, **result}


def load_manifest(path):
    spec = json.loads(path.read_text(encoding="utf-8-sig"))
    cases = spec.get("cases") if isinstance(spec, dict) else None
    if not isinstance(cases, list) or not 1 <= len(cases) <= 100:
        raise ValueError("cases must contain 1 to 100 samples")
    prepared, names = [], set()
    for case in cases:
        if not isinstance(case, dict) or not all(
            isinstance(case.get(k), str) and case[k].strip()
            for k in ("name", "audio", "transcript")
        ):
            raise ValueError("Every case needs nonempty name, audio and transcript")
        if case["name"] in names or len(case["transcript"]) > 6000:
            raise ValueError(
                "Case names must be unique; transcript is limited to 6000 characters"
            )
        names.add(case["name"])
        audio = path.resolve().parent / case["audio"]
        if not audio.is_file() or not 0 < audio.stat().st_size <= MAX_BYTES:
            raise ValueError(f"Missing, empty or larger than 24 MiB audio: {audio}")
        prepared.append(({k: case[k] for k in ("name", "audio", "transcript")}, audio))
    return prepared


def save_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False
    ) as target:
        temporary = Path(target.name)
        json.dump(report, target, indent=2, ensure_ascii=False, allow_nan=False)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--url", default="http://localhost:8001")
    parser.add_argument("--timeout", type=float, default=960)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--csv", type=Path, help="Optional score table without transcript"
    )
    args = parser.parse_args(argv)
    try:
        parsed = urllib.parse.urlsplit(args.url)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "url must be an HTTP(S) base URL without credentials/query/fragment"
            )
        _ = parsed.port
        if not math.isfinite(args.timeout) or not 0 < args.timeout <= 3600:
            raise ValueError("timeout must be finite and between 0 and 3600 seconds")
        prepared = load_manifest(args.manifest)
        output = args.output or args.manifest.resolve().parent / "gopt-results.json"
        protected = {
            args.manifest.resolve(),
            *(audio.resolve() for _, audio in prepared),
        }
        if output.resolve() in protected or (
            args.csv
            and (
                args.csv.resolve() in protected
                or args.csv.resolve() == output.resolve()
            )
        ):
            raise ValueError("Reports must not overwrite input files or one another")
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.error(str(error))
    report = {
        "service": args.url,
        "cases": [],
        "warning": "Comparative experiment, not a pronunciation accuracy benchmark.",
    }
    save_report(output, report)
    for case, audio in prepared:
        print(f"Assessing {case['name']} ...", flush=True)
        row = {**case, **assess(args.url, audio, case["transcript"], args.timeout)}
        report["cases"].append(row)
        save_report(output, report)
        print(
            "  " + (row["error"] if "error" in row else str(row["response"]["scores"])),
            flush=True,
        )
    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with args.csv.open("w", newline="", encoding="utf-8-sig") as target:
            writer = csv.DictWriter(
                target, fieldnames=["name", "elapsed_seconds", *SCORES, "error"]
            )
            writer.writeheader()
            for row in report["cases"]:
                writer.writerow(
                    {
                        "name": row["name"],
                        "elapsed_seconds": row["elapsed_seconds"],
                        **{
                            key: row.get("response", {}).get("scores", {}).get(key, "")
                            for key in SCORES
                        },
                        "error": row.get("error", ""),
                    }
                )
    print(f"Saved {output.resolve()}")
    return int(any("error" in row for row in report["cases"]))


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    raise SystemExit(main())
