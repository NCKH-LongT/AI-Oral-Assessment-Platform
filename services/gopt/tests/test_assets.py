import io
import json
import tarfile
from pathlib import Path

import pytest
from prepare_assets import unpack


def test_extractor_symlink_is_materialized_without_filesystem_links(tmp_path):
    archive = tmp_path / "model.tar.gz"
    with tarfile.open(archive, "w:gz") as target:
        member = tarfile.TarInfo("exp/extractor/10.ie")
        member.size = 5
        target.addfile(member, io.BytesIO(b"model"))
        link = tarfile.TarInfo("exp/extractor/final.ie")
        link.type = tarfile.SYMTYPE
        link.linkname = "10.ie"
        target.addfile(link)
    root = tmp_path / "assets"
    unpack(archive, root, [("exp/extractor/", "extractor")])
    assert (root / "extractor/final.ie").read_bytes() == b"model"
    assert not (root / "extractor/final.ie").is_symlink()


def test_absolute_archive_suffix_is_rejected(tmp_path):
    archive = tmp_path / "model.tar.gz"
    with tarfile.open(archive, "w:gz") as target:
        member = tarfile.TarInfo("exp/extractor//outside.txt")
        member.size = 5
        target.addfile(member, io.BytesIO(b"model"))
    with pytest.raises(ValueError):
        unpack(archive, tmp_path / "assets", [("exp/extractor/", "extractor")])


def test_training_mapping_keeps_rare_phone_order():
    mapping = json.loads((Path(__file__).parents[1] / "training_phones.json").read_text())
    assert set(mapping.values()) == set(range(39))
    assert [mapping[phone] for phone in ("JH", "CH", "OY", "ZH")] == [35, 36, 37, 38]
