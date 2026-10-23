import hashlib
import json
import os
import shutil
import sys
import tarfile
import urllib.request
from pathlib import Path

REVISION = "bed909daf8eca035095871e51642525acc5b9b55"
SOURCE = f"https://raw.githubusercontent.com/YuanGongND/gopt/{REVISION}"


def download(url, destination):
    if destination.exists():
        return
    temporary = destination.with_suffix(destination.suffix + ".part")
    print(f"Downloading {destination.name}", flush=True)
    with urllib.request.urlopen(url, timeout=120) as source, temporary.open("wb") as target:
        shutil.copyfileobj(source, target)
    temporary.replace(destination)


def unpack(archive, root, selections):
    with tarfile.open(archive, "r:gz") as source:
        for member in source:
            if not (member.isfile() or member.issym() or member.islnk()):
                continue
            for marker, destination in selections:
                if marker not in member.name:
                    continue
                suffix = member.name.split(marker, 1)[1]
                if not suffix or ".." in Path(suffix).parts:
                    continue
                target = (root / destination / suffix).resolve()
                if not target.is_relative_to(root.resolve()):
                    raise ValueError("Model archive path escapes asset directory")
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(member) as content, target.open("wb") as output:
                    shutil.copyfileobj(content, output)


def prepare(root):
    root.mkdir(parents=True, exist_ok=True)
    cache = Path(os.environ.get("GOPT_DOWNLOAD_CACHE", root / "downloads"))
    cache.mkdir(parents=True, exist_ok=True)
    for name in ("chain", "extractor"):
        archive = cache / f"{name}.tar.gz"
        download(f"https://kaldi-asr.org/models/13/0013_librispeech_v1_{name}.tar.gz", archive)
        unpack(archive, root, [
            ("exp/chain_cleaned/tdnn_1d_sp/", "acoustic"),
            ("exp/nnet3_cleaned/extractor/", "extractor"),
        ])
    language = root / "lang"
    (language / "phones").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / "acoustic/phones.txt", language / "phones.txt")
    disambiguation = [line.split()[1] for line in (language / "phones.txt").read_text().splitlines()
                     if line.split()[0].startswith("#")]
    if not disambiguation:
        raise ValueError("Acoustic model has no disambiguation symbols")
    (language / "phones/disambig.int").write_text("\n".join(disambiguation) + "\n")
    download(f"{SOURCE}/src/models/gopt.py", root / "gopt_model.py")
    download(f"{SOURCE}/pretrained_models/gopt_librispeech/best_audio_model.pth", root / "gopt.pth")
    download(f"{SOURCE}/LICENSE", root / "GOPT-LICENSE")
    download("https://www.openslr.org/resources/11/librispeech-lexicon.txt", root / "lexicon.txt")
    phones = json.loads(Path(__file__).with_name("training_phones.json").read_text())
    if len(phones) != 39 or set(phones.values()) != set(range(39)):
        raise ValueError("Unexpected GOPT training phone inventory")
    (root / "training_phones.json").write_text(json.dumps(phones), encoding="utf-8")
    for name in ("acoustic/final.mdl", "acoustic/tree", "acoustic/cmvn_opts",
                 "extractor/final.ie", "lang/phones.txt", "lang/phones/disambig.int"):
        if not (root / name).is_file():
            raise ValueError(f"Missing model asset: {name}")
    manifest = {"gopt_revision": REVISION, "files": {}}
    for path in sorted(root.rglob("*")):
        if path.is_file() and cache not in path.parents and path.name != "manifest.json":
            with path.open("rb") as source:
                manifest["files"][path.relative_to(root).as_posix()] = hashlib.file_digest(source, "sha256").hexdigest()
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("GOPT assets prepared", flush=True)


if __name__ == "__main__":
    prepare(Path(sys.argv[1]))
