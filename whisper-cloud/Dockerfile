# whisper-server for Linux, for the "Whisper nube" instances (ADR 12, phase A: local test only).
# Same whisper.cpp commit as the Windows binary of the local module (tag b5454 = v1.9.5 = d1be6fd).
#
#   docker build --build-arg MODEL=small -t chessspeak-whisper:small-d1be6fd whisper-cloud
#   docker run --rm --cpus=2 --memory=2g -p 8080:8080 chessspeak-whisper:small-d1be6fd
#
# Everything is pinned: base image by digest, whisper.cpp by commit, the model by Hugging Face revision and sha256.

# debian:bookworm-slim, digest read from Docker Hub on 2026-11-12
ARG DEBIAN=debian:bookworm-slim@sha256:c67e92c8099ba22853ab4cfda7cfb494d253d6012ca82dee98ba8976772af018

FROM ${DEBIAN} AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git cmake make g++ \
 && rm -rf /var/lib/apt/lists/*
ARG WHISPER_COMMIT=d1be6fde11ac6e0407606b4e42fe72d34add8037
RUN git init -q /src \
 && git -C /src fetch -q --depth 1 https://github.com/ggml-org/whisper.cpp "${WHISPER_COMMIT}" \
 && git -C /src checkout -q FETCH_HEAD \
 && test "$(git -C /src rev-parse HEAD)" = "${WHISPER_COMMIT}"
# GGML_NATIVE=OFF: the CPU of the cloud instance is not the CPU that builds the image
RUN cmake -S /src -B /src/build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DBUILD_SHARED_LIBS=OFF \
      -DWHISPER_BUILD_TESTS=OFF -DWHISPER_SDL2=OFF \
 && cmake --build /src/build --target whisper-server -j"$(nproc)"

FROM ${DEBIAN} AS model
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
ARG MODEL=small
# revision of huggingface.co/ggerganov/whisper.cpp read on 2026-11-12; the hashes are those of the models/ files
# the local module has used since the spike, so the cloud and the local module run the same weights
ARG HF_REVISION=5359861c739e955e79d9a303bcbc70fb988958b1
RUN case "${MODEL}" in \
      small) sha=1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b ;; \
      base)  sha=60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe ;; \
      *) echo "MODEL must be small or base" >&2; exit 1 ;; \
    esac \
 && curl -fsSL -o /ggml.bin "https://huggingface.co/ggerganov/whisper.cpp/resolve/${HF_REVISION}/ggml-${MODEL}.bin" \
 && echo "${sha}  /ggml.bin" | sha256sum -c -

FROM ${DEBIAN}
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home whisper
COPY --from=build /src/build/bin/whisper-server /usr/local/bin/whisper-server
COPY --from=model /ggml.bin /models/ggml.bin
ARG MODEL=small
ENV WHISPER_MODEL_NAME=${MODEL}
ENV WHISPER_LANGUAGE=es
# one thread per vCPU of the instance (2 in the plan)
ENV WHISPER_THREADS=2
# must stay equal to CHESS_PROMPT in local-agent/src/prompt.ts (checked by spike/whisper-local/test/docker-prompt.test.ts)
ENV WHISPER_PROMPT="Partida de ajedrez. Jugadas dichas en español: peón, caballo, alfil, torre, dama, rey, toma, enroque corto, enroque largo, corona a dama. Columnas: a, be, ce, de, e, efe, ge, hache. Filas: uno, dos, tres, cuatro, cinco, seis, siete, ocho. Por ejemplo: caballo efe tres, e cuatro, alfil toma efe siete."
USER whisper
# Cloud Run sets PORT; 8080 locally
EXPOSE 8080
CMD ["sh", "-c", "exec whisper-server -m /models/ggml.bin -l \"$WHISPER_LANGUAGE\" -t \"$WHISPER_THREADS\" --host 0.0.0.0 --port \"${PORT:-8080}\" --prompt \"$WHISPER_PROMPT\""]
