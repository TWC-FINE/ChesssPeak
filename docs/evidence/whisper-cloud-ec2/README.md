# Evidencia de Whisper en AWS EC2 (C1, C2 y C3)

Corridas del 14 de noviembre de 2026 con la [adenda de EC2](../../whisper-cloud-criteria.md#6-adenda-del-13-de-noviembre-ec2-en-lugar-de-cloud-run) (sección 6 del criterio v1), siguiendo [`whisper-cloud/aws/README.md`](../../../whisper-cloud/aws/README.md). Los umbrales se fijaron antes de medir y no se cambiaron después.

## Resultados frente a los criterios

| | Umbral | Medido | Resultado |
|---|---|---|---|
| **C2** | Primer clip tras `/health` 200, en una instancia recién arrancada: ≤ 30 s | 11,52 s, HTTP 200. De Start a `/health` 200: 19 s, sin umbral y con sondeo cada 15 s | **Cumple** |
| **C1** | p95 en caliente de la peor de 3 repeticiones: ≤ 7,5 s (de 7,5 a 9,0 s, no concluyente) | 13,59 s (r1) | **No cumple: se recorta la nube** (más de 9,0 s) |
| **C3** | Aciertos top-1 sobre 78, en cada repetición: ≥ 68 | 68, 68 y 68 | **Cumple**, justo en el umbral |
| **C4** | 2 instancias y aislamiento de un worker | — | **No medido:** este experimento tenía una sola instancia |
| **C5** | Gasto ≤ 2,5 USD en créditos y 0 USD a la tarjeta | — | Se comprueba en la consola de facturación; no forma parte de estos registros |

| Repetición | p50 | **C1** p95 | **C3** top-1 | Aceptación errónea | Silencio y ruido aceptados | RAM libre en el equipo |
|---|---|---|---|---|---|---|
| r1 | 11,55 s | 13,59 s | 68/78 | 0/78 | 0/38 | 6 915 MB |
| r2 | 11,21 s | 11,72 s | 68/78 | 0/78 | 0/38 | 7 445 MB |
| r3 | 11,29 s | 11,68 s | 68/78 | 0/78 | 0/38 | 7 626 MB |

**Decisión:** C1 no cumple, así que, según la tabla de decisión de la adenda, **AWS se recorta**. El responsable del repo lo decidió el 14 de noviembre y no se mide nada más en la nube. El balanceo se demuestra con los 3 contenedores locales (plan B).

**Comparación con la fase A:** el mismo `small`, con los mismos límites, dio un p50 de unos 5,3 s y un p95 de 5,5–5,9 s en local ([fase A](../whisper-cloud-phase-a/README.md)). En EC2 la latencia es aproximadamente el doble.

- **Causa probable, no confirmada:** las vCPU de las instancias «flex». La adenda ya anotaba que no siempre dan su rendimiento completo.
- No se midieron por separado la red, el túnel ni la CPU de la instancia.

## De dónde sale cada cifra

- **C1 y C3:** de la tabla «Resumen por configuración» de cada `benchmark-*.txt`. Las calcula `voice-parser` con sus parámetros por defecto y no se editaron a mano. `whisper-cloud/aws/summarize-c1-c3.mjs` dio el mismo resultado sobre los registros originales.
- **Qué mide la latencia:** el benchmark cronometra la petición HTTP completa a `/inference` (`spike/whisper-local/src/whisper-process.ts`), así que incluye la ida y vuelta por el túnel SSH hasta la instancia. La frase «La latencia de Whisper es optimista… sin transporte HTTP» de los registros es texto fijo del informe del spike y aquí no se aplica.
- **C2:** del registro `c2-20261114-120241.txt`, escrito por `whisper-cloud/aws/measure-c2.ps1`.

## Entorno

- **Instancia:**
  - una sola `c7i-flex.large` en `us-east-2`, con 2 vCPU y 4 GiB según la página de precios de AWS, y Ubuntu Server 24.04 LTS;
  - preparada con `whisper-cloud/aws/user-data.sh`, que construyó la imagen `small` desde el `Dockerfile` fijado, comprobado con SHA-256;
  - un solo contenedor con `--cpus=2 --memory=2g`, publicado solo en `127.0.0.1` de la instancia.
- **Comprobado antes de medir, por SSH y en solo lectura:**
  - el puerto 8080 escuchaba solo en `127.0.0.1`;
  - `/health` respondía 200;
  - la CPU tenía AVX2;
  - el disco tenía 9,4 GB libres.
- **Acceso:** por un túnel SSH a `127.0.0.1:18201` del equipo del responsable. El grupo de seguridad solo admite el puerto 22 desde su IP `/32`.
- **Equipo del responsable:**
  - VPN apagada y aplicaciones pesadas cerradas; no se usó el equipo durante la medición;
  - Docker local apagado, comprobado antes de medir: no había proceso de Docker Desktop y `docker info` falló. Por tanto, las bases de datos locales estaban paradas.
- **Orden:**
  1. C2 a las 12:02 (UTC−5), tras parar y arrancar la instancia;
  2. r1 de 12:05 a 12:26, r2 de 12:26 a 12:46 y r3 de 12:46 a 13:07. Ninguna repetición terminó con error.
- **Clips:** los 116 de `spike/recordings` (runB), con los 78 intentos válidos del split `test`. Son grabaciones del responsable del repo, que dio su OK explícito para enviarlas a su instancia en esta prueba.

## Cambios respecto a los originales

- Se quitó el BOM y los saltos de línea se normalizaron a LF.
- La ruta del repositorio se cambió por `<repo>` y la carpeta de salida, por `<carpeta-de-salida>`. No se tocó nada más.
- No aparece la IP pública de la instancia: los registros solo nombran `127.0.0.1`, que es el extremo local del túnel.
- **No se incluyen:**
  - los JSON de resultados, igual que en la fase A;
  - ninguna lista de procesos.

Para comprobar los archivos, desde esta carpeta: `sha256sum -c SHA256SUMS`.
