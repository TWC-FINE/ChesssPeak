# Spike de voz, parte 2: Whisper local y agente HTTP

Complementa [spike/README.md](../README.md). El parser (`packages/voice-parser`) y el corpus están **congelados**: aquí solo se usan, no se tocan. Criterios: [docs/spike-criteria.md](../../docs/spike-criteria.md). Límites conocidos: [docs/spike-notes.md](../../docs/spike-notes.md).

Todos los comandos se ejecutan desde la raíz del repo.

## 1. Descargar whisper.cpp y los modelos (una vez)

```bash
pnpm --filter @chessspeak/spike-whisper-local download
```

Descarga el binario oficial precompilado para Windows (`whisper-bin-x64.zip`, versión CPU) y los modelos `ggml-base.bin` y `ggml-small.bin` (unos 150 MB y 490 MB), verifica sus SHA-256 y los deja en `whisper/` y `models/` (ignoradas por git). Escribe las rutas en `.env` (`WHISPER_SERVER_PATH`, `WHISPER_MODEL_BASE`, `WHISPER_MODEL_SMALL`) sin tocar otras claves. Puedes volver a ejecutarlo: no descarga lo que ya está verificado. Las demás opciones están en `.env.example`.

## 2. Los clips WAV

El benchmark lee los WAV que graba el arnés de Web Speech. **Tienen que estar en `spike/recordings/`** (o en la carpeta que le pases con `--wav-dir`).

- Si en el arnés elegiste la carpeta `spike/recordings/` con «Elegir carpeta para los WAV…», ya están ahí.
- **Si el navegador los dejó en otra carpeta (por ejemplo, Descargas), muévelos a `spike/recordings/`** antes de ejecutar el benchmark. No renombres los archivos: el nombre dice la frase, la condición y la repetición (`p05-01_noisy_r2.wav`; los de silencio y ruido son `trial_silence_r3.wav` y `trial_noise_r3.wav`).
- Necesitas los clips de **todos** los bloques que quieras evaluar: `test` en ambiente tranquilo y con ruido, y los 10 de silencio y los 10 de ruido (sin ellos, el conteo de falsas aceptaciones sale en 0/0).
- Los archivos de `spike/recordings/` no se suben a git.

## 3. Benchmark

```bash
pnpm --filter @chessspeak/spike-whisper-local benchmark
```

Por cada modelo (`base`, `small`) y con/sin el prompt de vocabulario de ajedrez, arranca `whisper-server`, manda cada clip, pasa la transcripción por el parser y calcula las mismas métricas del spike por split y condición. Deja un JSON por configuración en `spike/results/` (mismo formato que el arnés, así que `pnpm metrics <archivo>` también lo lee).

Opciones: `--wav-dir <carpeta>` (por defecto `spike/recordings/`), `--out-dir`, `--models base,small`, `--prompt on|off|both`, `--split test|dev|all` (por defecto `test`), `--threshold`, `--margin`, `--rank-penalty` (parámetros del parser: usa **los mismos que fijaste con `dev`**).

- **Puerta de volumen y duración:** antes de enviar un clip a Whisper se exige duración ≥ 300 ms y volumen RMS ≥ -50 dBFS. Quedaron **fijados** (`MIN_DURATION_MS`, `MIN_RMS_DBFS` en `.env`): no los cambies tras ver resultados; si no funcionan, anótalo en `docs/spike-notes.md`.
- El informe cuenta cuántos clips de silencio y ruido frenó la puerta, cuántos llegaron a Whisper y **cuántos acabaron en una jugada o comando aceptado** (debe ser 0).
- **Escribir en el documento de resultados:** añade `--write-results`. Rellena el bloque de Whisper de `docs/spike-results.md`. Se niega si algún clip o archivo es sintético (`*.fake.*`), si algún archivo trae `meta.fake`, o si el split no es `test`.
- La latencia es **optimista** (sin grabación ni transporte HTTP); ver `docs/spike-notes.md`.

## 4. Agente local (prueba de CORS)

```bash
pnpm --filter @chessspeak/spike-whisper-local serve
```

Arranca `whisper-server` (modelo según `WHISPER_MODEL`, por defecto `base`) y el agente en `http://127.0.0.1:8765`:

| Ruta | Qué hace |
|---|---|
| `GET /health` | Estado, modelo y puerta |
| `POST /transcribe` | Recibe un WAV (`Content-Type: audio/wav`) y devuelve `{ text, gated, ms, durationMs, rmsDbfs }`. Si el clip no pasa la puerta, devuelve `gated: true` sin llamar a Whisper |

Rutas, puerto, orígenes y límites salen de `.env` (`AGENT_*`, `MAX_BODY_BYTES`). Solo escucha en `127.0.0.1`, solo atiende los orígenes de `AGENT_ALLOWED_ORIGINS` (por defecto `http://127.0.0.1:5500` y `http://localhost:5500`), responde `Access-Control-Allow-Private-Network: true` cuando el navegador lo pide y rechaza cabeceras `Host` ajenas (DNS rebinding).

**Prueba en el navegador:** con el agente encendido, arranca Live Server (puerto 5500) y abre

> http://127.0.0.1:5500/spike/whisper-local/test-page/index.html

Pulsa **Probar /health** y **Enviar 1 s de silencio** (o elige un WAV). Debe salir «✔ Funciona». Con `?auto=1` en la URL las dos pruebas corren solas. Si sale «Failed to fetch», revisa que el agente esté encendido y que el origen de la página esté en `AGENT_ALLOWED_ORIGINS`.

Qué se verificó y qué no: ver `docs/spike-notes.md` (origen público no probado).

## 5. Si el precompilado falla

El zip oficial funcionó en la máquina donde se hizo el spike. Solo si no arranca (faltan DLL, CPU sin instrucciones necesarias, antivirus):

1. Instala Visual Studio Build Tools (carga de trabajo «Desarrollo para el escritorio con C++») y CMake.
2. Clona y compila, fuera de este repo:
   ```bash
   git clone https://github.com/ggml-org/whisper.cpp
   cd whisper.cpp
   cmake -B build
   cmake --build build -j --config Release
   ```
3. Pon la ruta de `whisper-server.exe` (normalmente `build\bin\Release\`) en `WHISPER_SERVER_PATH` dentro de `.env`.

Estos pasos de compilación **no se han probado** aquí, porque el precompilado funcionó.

## 6. Pruebas

```bash
pnpm --filter @chessspeak/spike-whisper-local test
```

Cubren la lectura de WAV, la puerta, los nombres de clip, la construcción de intentos, las negativas de escritura y el servidor HTTP (CORS, preflight, límites) con un backend falso. No usan Whisper ni voz real.
