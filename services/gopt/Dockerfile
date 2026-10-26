FROM debian:12-slim AS kaldi
ARG KALDI_REVISION=e02e35f0254bb033fab73d1df99fc34123e31d56
ARG BUILD_JOBS=1
ENV DEBIAN_FRONTEND=noninteractive OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ make git python3 zlib1g-dev ca-certificates libopenblas-dev libfst-dev && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends liblapacke-dev gfortran ccache && rm -rf /var/lib/apt/lists/*
ENV PATH=/usr/lib/ccache:$PATH
RUN git init /opt/kaldi && cd /opt/kaldi && \
    git remote add origin https://github.com/kaldi-asr/kaldi.git && \
    git fetch --depth 1 origin ${KALDI_REVISION} && git checkout --detach FETCH_HEAD
RUN mkdir -p /opt/kaldi/tools/openfst/include && \
    ln -s /usr/include/fst /opt/kaldi/tools/openfst/include/fst && \
    ln -s /usr/lib/$(gcc -print-multiarch) /opt/kaldi/tools/openfst/lib && \
    mkdir -p /opt/kaldi/tools/openblas && \
    ln -s /usr/include/$(gcc -print-multiarch)/openblas-pthread /opt/kaldi/tools/openblas/include && \
    ln -s /usr/lib/$(gcc -print-multiarch) /opt/kaldi/tools/openblas/lib
COPY patch_kaldi.py /tmp/patch_kaldi.py
RUN --mount=type=cache,target=/root/.cache/ccache \
    python3 /tmp/patch_kaldi.py && cd /opt/kaldi/src && \
    ./configure --shared --use-cuda=no --openblas-root=/opt/kaldi/tools/openblas --fst-version=1.7.9 && \
    make depend -j ${BUILD_JOBS} && make -j ${BUILD_JOBS} online2 lm
RUN --mount=type=cache,target=/root/.cache/ccache cd /opt/kaldi/src && \
    make -C featbin -j ${BUILD_JOBS} compute-mfcc-feats copy-feats compute-cmvn-stats apply-cmvn feat-to-len && \
    make -C online2bin -j ${BUILD_JOBS} ivector-extract-online2 && \
    make -C nnet3bin -j ${BUILD_JOBS} nnet3-compute && \
    make -C bin -j ${BUILD_JOBS} compile-train-graphs-without-lexicon align-compiled-mapped ali-to-phones compute-gop
RUN find /opt/kaldi/src -type f \( -name '*.o' -o -name '*.a' \) -delete && \
    find /opt/kaldi/src -type f -name '*.so' -exec strip --strip-unneeded {} + && \
    rm -rf /opt/kaldi/.git

FROM python:3.12-slim-bookworm AS assets
WORKDIR /build
COPY prepare_assets.py training_phones.json ./
RUN --mount=type=cache,id=gopt-models,target=/download-cache,sharing=locked \
    GOPT_DOWNLOAD_CACHE=/download-cache python prepare_assets.py /opt/gopt-assets

FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    KALDI_ROOT=/opt/kaldi GOPT_ASSETS=/opt/gopt-assets LC_ALL=C.UTF-8
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libgfortran5 libgomp1 libstdc++6 libopenblas0-pthread libfst-dev zlib1g perl bash && rm -rf /var/lib/apt/lists/*
COPY --from=kaldi /opt/kaldi /opt/kaldi
COPY --from=assets /opt/gopt-assets /opt/gopt-assets
WORKDIR /app
COPY requirements.txt .
RUN pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu && \
    pip install -r requirements.txt
COPY engine.py server.py extract.sh mfcc.conf ./
RUN python -c "from pathlib import Path; p=Path('extract.sh'); p.write_bytes(p.read_bytes().replace(b'\r\n', b'\n'))" && \
    useradd --create-home --uid 10002 gopt
USER gopt
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
