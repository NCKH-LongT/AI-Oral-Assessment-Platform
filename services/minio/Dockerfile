# Build the configured upstream release without relying on withdrawn MinIO images.
FROM golang:1.24-bookworm AS build
WORKDIR /src
RUN git init . \
    && git remote add origin https://github.com/minio/minio.git \
    && git fetch --depth 1 origin 01ce918d8279a20e4706b96a64396146894adee4 \
    && git checkout --detach FETCH_HEAD
ENV CGO_ENABLED=0
RUN go build -p 2 -trimpath \
    -ldflags="$(go run buildscripts/gen-ldflags.go 2025-09-07T16:13:09Z)" \
    -o /out/minio .

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data
COPY --from=build /out/minio /usr/local/bin/minio
COPY --from=build /src/LICENSE /usr/share/doc/minio/LICENSE
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
