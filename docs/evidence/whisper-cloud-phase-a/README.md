# Evidencia de la fase A de Whisper en la nube (local, sin nube)

Corridas del 12 de noviembre de 2026 con el [criterio v1](../../whisper-cloud-criteria.md). La imagen es [`whisper-cloud/Dockerfile`](../../../whisper-cloud/Dockerfile): whisper.cpp `d1be6fd`, `GGML_NATIVE=OFF` y 2 hilos.

Cada repetición se hizo con un contenedor recién arrancado con `docker run --cpus=2 --memory=2g`. Se midieron los 116 clips de `spike/recordings`, y se evalúan los 78 intentos válidos del split `test`. Ningún clip salió del equipo.

## Resultados frente a A1–A4

Umbrales de A1, A2 y A4 para los dos modelos: A1 p95 ≤ 7,5 s · A2 ≤ 30 s · A4 ≤ 1 536 MiB. El umbral de A3 cambia con el modelo y va en el título de cada tabla.

**`small`** (A3 ≥ 68/78)

| Corrida | p50 | **A1** p95 | **A2** arranque | **A3** top-1 | **A4** pico de memoria |
|---|---|---|---|---|---|
| r1 | 5,35 s | 5,46 s | 1,9 s | 68/78 | 1 240 MiB |
| r2 | 5,40 s | 5,76 s | 0,6 s | 68/78 | 767 MiB |
| r3 | 5,24 s | 5,93 s | 0,7 s | 68/78 | 767 MiB |

**`base`** (A3 ≥ 56/78)

| Corrida | p50 | **A1** p95 | **A2** arranque | **A3** top-1 | **A4** pico de memoria |
|---|---|---|---|---|---|
| r1 | 1,47 s | 1,64 s | 1,1 s | 58/78 | 454 MiB |
| r2 | 1,45 s | 1,48 s | 0,7 s | 58/78 | 313 MiB |
| r3 | 1,41 s | 1,47 s | 0,6 s | 58/78 | 313 MiB |

**Los dos modelos cumplen A1–A4 en las tres repeticiones.** Según la regla de decisión, la fase B sigue con `small`.

- **Aceptaciones:** en todas las corridas hubo 0 % de aceptación errónea y 0 de 38 clips de silencio o ruido aceptados.
- **`small` cumple A3 justo en el umbral** (68/78), las tres veces.
- **Margen de A1 en `small`:** 1,6 s. Si una vCPU de Cloud Run es más de 1,26 veces más lenta que este equipo, C1 no pasaría.

## De dónde sale cada cifra

- **p50, A1 y A3:** de la tabla «Resumen por configuración» de cada registro. Esas cifras las calcula `voice-parser` y no se editaron a mano.
- **A2 y A4:** de la salida del script que lanzó las corridas.
  - **A2:** tiempo entre `docker run` y la primera respuesta 200 de `/health`.
  - **A4:** `/sys/fs/cgroup/memory.peak` del contenedor al terminar.
  - Esa salida no se incluye aquí; las cifras se copiaron de ella.

## Entorno

- **Equipo:** el de desarrollo, un i5-12400F.
- **Docker Desktop:** encendido, porque la medición corre en él. Antes de cada corrida no había ningún contenedor en marcha, y durante la corrida solo estaba el de whisper. Las bases de datos estaban paradas.
- **RAM libre antes de cada corrida:**
  - `small`: 5 613, 6 481 y 6 548 MB;
  - `base`: 5 936, 6 195 y 6 657 MB.
- **Factores que pueden influir:** una VPN y un editor estaban abiertos, y una aplicación en segundo plano consumió CPU durante la medición.
- **Puerto:** el contenedor se publicó en el puerto 18080 del equipo, porque otro programa ocupaba el 8080. El contenedor escucha en el 8080 igualmente.

## Cambios respecto a los originales

- **Rutas:** las rutas del repositorio y de la carpeta de salida se cambiaron por `<repo>` y `<carpeta-de-salida>`. No se tocó nada más.
- **Barra de progreso:** sus saltos (CR) se conservan.
- **JSON de resultados:** las corridas de un mismo modelo los sobrescribieron por un fallo del benchmark, ya corregido en el commit `09f5cfa`. Por eso los registros citan «…-small con prompt.json». Los JSON no se incluyen. Las cifras de cada repetición están en su registro.

Para comprobar los archivos, desde esta carpeta: `sha256sum -c SHA256SUMS`.
