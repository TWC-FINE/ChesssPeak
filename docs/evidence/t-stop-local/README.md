# Evidencia de T-stop en local: detener un worker en pleno uso

Corridas del 21 de noviembre de 2026 con las secciones [8](../../whisper-cloud-criteria.md#8-adenda-del-21-de-noviembre-t-stop-detener-un-worker-en-pleno-uso) y [9](../../whisper-cloud-criteria.md#9-adenda-del-21-de-noviembre-2-w2-ocupado-y-peticiones-enviadas-durante-la-detección) de los criterios.

- **La sección 8** se fusionó en `main` (`c083421`) antes de la fase 1.
- **La sección 9** se fusionó en `main` (`f63270e`) antes de la fase 2.
- **Los umbrales no se cambiaron después de medir.**

**Solo es local:** 2 contenedores en un mismo equipo. **La variante `ec2` de la sección 8 no se ha medido.**

## Resultado

| Fase | Código | Variantes | Resultado |
|---|---|---|---|
| 1 | `main` en `c083421`, sin el cambio del pool | `stop` y `pause` | `stop` cumple F1–F4 en 3 de 3. **`pause` no cumple F1** en r2 y r3 |
| 2 | `main` en `f63270e`, con el cambio de [#80](https://github.com/TWC-FINE/ChesssPeak/pull/80) | `stop`, `pause`, `stop-ocupado` y `pause-ocupado` | **Las 4 cumplen F1–F4** en 3 repeticiones válidas de 3 intentos |

Umbrales (sección 8):
- **F1:** 40 de 40 respuestas 200;
- **F2:** detección en ≤ 10 s;
- **F3:** latencia máxima ≤ 30 s;
- **F4:** w2 vuelve a `up` en ≤ 60 s y atiende al menos una petición nueva, sin ninguna acción en el agente.

## Fase 1: línea base, sin el cambio de código

| Corrida | F1 | F2 detección | F3 máx. | F4 `up` / primera 200 | w2 en curso en A | Resultado |
|---|---|---|---|---|---|---|
| `stop` r1 | 40/40 | 5 s | 6,0 s | 1 s / 7,2 s | 0 | Cumple |
| `stop` r2 | 40/40 | 5 s | 6,2 s | 1 s / 8,2 s | 0 | Cumple |
| `stop` r3 | 40/40 | 5 s | 7,5 s | 1 s / 7,2 s | 0 | Cumple |
| `pause` r1 | 40/40 | 6 s | 6,0 s | 2 s / 7,1 s | 0 | Cumple |
| `pause` r2 | **39/40** (un 504) | 6 s | 6,5 s | 1 s / 14,3 s | 0 | **No cumple F1** |
| `pause` r3 | **39/40** (un 504) | 7 s | 6,2 s | 1 s / 13,3 s | 0 | **No cumple F1** |

- **`pause` r2 y r3 quedan registradas como fallo de F1,** sin repetirlas.
  - La petición perdida no era una que w2 tuviera en curso al pausarlo: tenía 0.
  - Era una nueva que el agente le envió durante los ~6 s que tardó en detectarlo. Quedó colgada hasta el 504, a los 45 s.
  - Es lo que la sección 8 preveía para un worker congelado, aunque con otra petición.
- **Defecto de diseño de la prueba:** en las 6 instantáneas A, w2 tenía **0 peticiones en curso**. El umbral de 12 respuestas se alcanza justo después de una respuesta, y en ese momento w2 siempre estaba libre. Por eso **el caso «en curso» no se ejercitó en la fase 1.** La sección 9 lo añadió antes de la fase 2.

**Informativo, con concurrencia 2:** `stop` 40/40 y máximo de 11,7 s; `pause` 39/40, con un 504, y máximo de 11,9 s.

## Fase 2: con el cambio de código

| Corrida | F1 | F2 detección | F3 máx. | F4 `up` / primera 200 | w2 en curso en A | Enviada durante la detección |
|---|---|---|---|---|---|---|
| `stop` r1 | 40/40 | 4 s | 5,9 s | 2 s / 12,3 s | 0 | no |
| `stop` r2 | 40/40 | 1 s | 9,0 s | 3 s / 18,3 s | 1 | no |
| `stop` r3 | 40/40 | 5 s | 6,2 s | 1 s / 13,3 s | 0 | no |
| `pause` r1 | 40/40 | 6 s | 12,1 s | 1 s / 13,2 s | 1 | sí |
| `pause` r2 | 40/40 | 6 s | 6,6 s | 2 s / 15,3 s | 0 | sí |
| `pause` r3 | 40/40 | 6 s | 12,6 s | 1 s / 14,3 s | 1 | sí |
| `stop-ocupado` r1 | 40/40 | 1 s | 9,8 s | 2 s / 18,4 s | 1 | no |
| `stop-ocupado` r2 | 40/40 | 1 s | 9,5 s | 2 s / 18,4 s | 1 | no |
| `stop-ocupado` r3 | 40/40 | 1 s | 8,7 s | 2 s / 18,4 s | 1 | no |
| `pause-ocupado` r1 | 40/40 | 5 s | 11,8 s | 2 s / 13,3 s | 1 | sí |
| `pause-ocupado` r2 | 40/40 | 5 s | 11,3 s | 1 s / 13,3 s | 1 | sí |
| `pause-ocupado` r3 | 40/40 | 6 s | 11,6 s | 2 s / 14,3 s | 1 | sí |

- **Todas cumplen F1–F4,** con 0 respuestas 502, 503 y 504.
- **Las variantes «ocupado» son válidas en los 3 intentos:** la instantánea A muestra w2 con 1 petición en curso.
- **`pause` r2 reproduce el caso que falló en la fase 1:**
  - w2 estaba libre al pausarlo, y una petición le llegó durante la detección;
  - con el cambio, esa petición se canceló y se reintentó en w1, y no se perdió ninguna.
- **En `stop` y `pause`, w2 a veces ya estaba ocupado en A** (`stop` r2 y `pause` r1 y r3). En ellas, «enviada durante la detección» incluye la petición que ya tenía, y no distingue las dos cosas.
- **Matiz de `stop-ocupado`:**
  - `docker compose stop` tardó unos 3,5 s, frente a unos 0,5 s con w2 libre;
  - w2 pudo terminar la petición durante el apagado ordenado, antes de cerrar la conexión `[S]`;
  - así que `stop-ocupado` no demuestra por sí solo que se reintente la petición en curso. Eso lo muestra `pause-ocupado`, donde w2 no responde nada.
- **F3:** el máximo sube a unos 12 s cuando una petición se reintenta: espera la detección, de 5–6 s, y después se transcribe en w1, en unos 5,5 s `[S]`.

**Informativo, con concurrencia 2:** `stop` 40/40 y máximo de 11,9 s; `pause` 40/40 y máximo de 16,6 s.

## Cómo se midió

- **Muestreo:** [`whisper-cloud/aws/tstop-watch.ps1`](../../../whisper-cloud/aws/tstop-watch.ps1), con `-Fail DockerStop` o `-Fail DockerPause`, y `-WhenBusy` en las variantes «ocupado». Falla w2 al llegar a 12 respuestas 200 nuevas, lo devuelve a los 60 s y escribe el resumen `tstop-*.txt`.
- **Carga:** `pnpm --filter @chessspeak/local-agent load --steps 1 --requests 40 --warmup 2 --label <etiqueta> --out-dir <carpeta-de-salida>`. En las informativas, `--steps 2`.
- **De dónde sale cada criterio:**
  - F1 y F3, del JSON de `load.ts`;
  - F2 y F4, del resumen;
  - «w2 en curso en A», de `snapshot-A-*.json`.
- **Un lanzador local, fuera del repo,** arrancó en cada repetición los dos procesos anteriores.
- **El agente no se reinició entre repeticiones de una fase.** Sus contadores son acumulados, y cada resumen se calcula desde su instantánea 0.
- Las cifras de las tablas salen de estos archivos; ninguna se editó a mano.

## Entorno

- **Contenedores:** `w1` y `w2` de [`whisper-cloud/compose.local.yml`](../../../whisper-cloud/compose.local.yml), con `small`, `--cpus=2` y `--memory=2g`, en `127.0.0.1:18101` y `18102`.
- **Agente:** `local-agent` en modo URLs, con `LB_PROBE_INTERVAL_MS=2000` y `LB_TIMEOUT_MS=45000`, solo como variables de entorno. `LB_FAILURES_TO_DOWN` no se fijó, así que vale 3.
- **Docker local:** encendido de las 13:07:39 a las 14:55:32 (UTC−5). Las bases de datos estuvieron paradas desde las 13:09:22, y solo corrían los 2 contenedores de Whisper. Lo detallan `fase1/entorno-fase1.txt` y `fase2/entorno-fase2.txt`.
- **Equipo del responsable:** cerró las aplicaciones pesadas y no usó el equipo. La RAM libre se anota en los archivos de entorno.
- **Clip:** el WAV por defecto de `load.ts`, una grabación del responsable del repo. No salió del equipo.

## Cambios respecto a los originales

- **`load-*.txt`:** la ruta de la línea «Reporte» se cambió por `<carpeta-de-salida>`, en los 22 archivos.
  - Se hizo con un script de Node probado antes en una copia.
  - El diff solo mostró esa línea en cada archivo.
- **Finales de línea y BOM:** contados con un script de Node de solo lectura. Hay 0 CR y 0 BOM en los 156 archivos, así que no se convirtió nada.
- **Lo demás no se tocó:**
  - los JSON de `load.ts`, las instantáneas y las muestras (`samples-*.jsonl`) se conservan con todo su contenido, incluido el pid del agente;
  - solo aparece la IP `127.0.0.1`.
- **No se incluye:**
  - la salida de error de `pnpm` y de `docker compose`, que solo repetía las órdenes;
  - la salida estándar de `tstop-watch.ps1`, que repite su resumen.

Para comprobar los archivos, desde esta carpeta: `sha256sum -c SHA256SUMS`.
