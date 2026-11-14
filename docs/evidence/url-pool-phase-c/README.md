# Evidencia de la fase C del pool por URLs (contenedores locales)

Corridas del 14 de noviembre de 2026 con el [criterio v1](../../url-pool-criteria.md). Ese criterio se fusionó en `main` (`97776f3`, #43) **antes** de la primera corrida, y no se cambió después.

## Montaje

- **Workers:** 3 contenedores de [`whisper-cloud/compose.local.yml`](../../../whisper-cloud/compose.local.yml), con la imagen `chessspeak-whisper:small-d1be6fd` de la fase A, sin reconstruirla (`--no-build`). Cada uno tiene `cpus: 2` y `mem_limit: 2g`, y se publica en `127.0.0.1:18101-18103`. Se arrancaron una vez, antes de la primera corrida.
- **Agente:** `local-agent` en modo URLs, con los valores por defecto: conexiones mínimas, `LB_TIMEOUT_MS` de 15 s, cola de 12 y un sondeo por segundo. Se reinició antes de cada corrida.
- **Clip:** `spike/recordings/p05-01_quiet_r1_runB.wav` en todas las peticiones. Es la voz del responsable del repo, no salió del equipo y no está en el repo.
- **Entorno:**
  - **Docker Desktop encendido**, porque los workers son contenedores.
  - **Las bases de datos paradas.** Solo estaban en marcha los 3 contenedores de Whisper (ver los archivos `entorno-*.txt`).
  - Según el responsable, cerró las aplicaciones pesadas y apagó la VPN antes de medir.
  - La RAM libre antes de cada corrida estuvo entre 2 871 y 3 405 MB.
  - Equipo: el de desarrollo, un i5-12400F con 12 hilos y 16 GB.

## Prueba de aislamiento (criterio)

Cada corrida: `load.ts --steps 2 --requests 40 --warmup 3`. w2 se aisló al llegar a 13 respuestas 200 (las 3 del calentamiento más 10 del escalón). `/lb/stats` se guardó justo después de aislar (A) y al terminar (B).

| Corrida | **I1** respuestas 200 | **I2** w2 en A: atendidas / en curso → en B | **I3** atendidas tras aislar: w1 / w3 | Resultado |
|---|---|---|---|---|
| r1 | **40 / 40** | 2 / 0 → 2: ninguna nueva | 15 / 15 | Cumple |
| r2 | **40 / 40** | 2 / 0 → 2: ninguna nueva | 15 / 15 | Cumple |
| r3 | **40 / 40** | 2 / 0 → 2: ninguna nueva | 15 / 15 | Cumple |

**I1, I2 e I3 se cumplen en las 3 repeticiones:** 0 peticiones perdidas, y después de aislarlo, w2 no recibió ninguna petición nueva.

Lo que esta prueba **no** ejercitó:

- **Las tres corridas salieron iguales.** Con concurrencia 2, la rotación de conexiones mínimas le dio a w2 una sola petición del escalón antes de aislarlo, y en ese momento **no tenía ninguna en curso** (`active` = 0 en A). Por eso esta prueba no ejercita el caso «lo que tenía en curso termina». Ese caso lo cubre el test `local-agent/test/url-pool.test.ts`, que aísla un worker a mitad de una petición.
- El reparto del escalón según `X-Worker` fue w1:20, w2:1 y w3:19 en las tres corridas.

## Medición informativa (sin umbral)

Cada corrida: `load.ts --steps 4 --requests 40 --warmup 3`, con 3 workers y sin aislar ninguno.

| Corrida | 200 | 503 | 504 | p50 / p95 / máx. de las 200 | p50 / p95 de todas | Reparto de las 200 |
|---|---|---|---|---|---|---|
| r1 | 37 | 0 | 3 | 7,80 / 14,82 / 14,89 s | 7,81 / 15,02 s | w1:12 · w2:12 · w3:13 |
| r2 | 37 | 0 | 3 | 7,96 / 14,46 / 14,60 s | 7,97 / 15,01 s | w1:13 · w2:13 · w3:11 |
| r3 | 39 | 0 | 1 | 7,56 / 14,98 / 15,01 s | 7,56 / 14,98 s | w1:12 · w2:13 · w3:14 |

- **No tiene umbral ni decide nada.** Con 4 peticiones simultáneas y 3 workers, una espera siempre en cola. Los 504 aparecen cuando la espera más la inferencia pasa de `LB_TIMEOUT_MS` (15 s), como se esperaba en el criterio.
- La salida de `load.ts` marca r1 y r2 como «CAÍDO» y habla de «punto de quiebre». Es su umbral interno por defecto, más del 5 % de errores, y **no forma parte del criterio**.
- **Estas cifras no son rendimiento del producto,** que envía una petición cada vez. Todo corrió en un solo equipo, así que no demuestran escalado entre máquinas.
- Ningún worker se reinició en ninguna corrida (`workerRestarts`).

## Archivos

| Archivo | Qué es |
|---|---|
| `load-*-aislamiento-r<n>.json` · `load-*-informativa-c4-r<n>.json` | Informes de `load.ts`, tal como los escribió |
| `snapshot-A-r<n>.json` · `snapshot-B-r<n>.json` | `/lb/stats` justo después de aislar w2 y al terminar el escalón |
| `entorno-<corrida>.txt` | Fecha, RAM libre, estado de Docker y contenedores en marcha, registrados antes de cada corrida |

## Cambios respecto a los originales

- **Registros de entorno:** son la versión recortada que fija el criterio. La lista de procesos se quedó en local.
- **Datos de procesos:** el único dato de proceso de esta evidencia es el PID del propio agente, que `/lb/stats` incluye en `agent.pid` dentro de las instantáneas. Es un número temporal de esa ejecución. No hay listas de procesos del equipo.
- **Instantáneas y registros de entorno:** los escribió PowerShell. Se les quitó la marca BOM y se pasaron de CRLF a LF, para que coincidan con lo que guarda git. No se tocó nada más.
- **Informes de `load.ts`:** sin cambios.

Para comprobar los archivos, desde esta carpeta: `sha256sum -c SHA256SUMS`.
