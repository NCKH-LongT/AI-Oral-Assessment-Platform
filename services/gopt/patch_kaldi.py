from pathlib import Path

header = Path("/opt/kaldi/src/matrix/cblas-wrappers.h")
content = header.read_text()
for precision in ("s", "d"):
    for operation in ("tptri", "gesvd", "sptri", "sptrf"):
        name = precision + operation
        original = name + "_("
        if content.count(original) != 1:
            raise ValueError(f"Unexpected Kaldi LAPACK wrapper: {name}")
        content = content.replace(original, "LAPACK_" + name + "(")
header.write_text(content)

compatibility = Path("/opt/kaldi/src/fstext/openfst_compat.h")
content = compatibility.read_text()
if content.count("printer.Print(&os, s);") != 1:
    raise ValueError("Unexpected Kaldi OpenFst printer wrapper")
compatibility.write_text(content.replace("printer.Print(&os, s);", "printer.Print(os, s);"))
