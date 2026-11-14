# Evidencia de C4 en AWS EC2: balanceo entre 2 instancias

Corridas del 14 de noviembre de 2026 con la [sección 7 de los criterios](../../whisper-cloud-criteria.md#7-adenda-del-14-de-noviembre-c4-en-ec2-como-demostración-del-balanceo). Esa sección se fusionó en `main` (`0fd3757`) antes de medir, y los umbrales no se cambiaron después.

**Es una demostración del balanceo, no de velocidad.** C1 sigue siendo «no cumple» ([evidencia de C1–C3](../whisper-cloud-ec2/README.md)).

## Resultados frente a I1–I3

| Repetición | **I1** respuestas 200 (perdidas) | **I2** peticiones nuevas de w2 tras aislarlo (en curso en A) | **I3** hasta A: w1 / w2 | **I3** de A a B: w1 | Reparto del escalón (`X-Worker`) | Resultado |
|---|---|---|---|---|---|---|
| r1 | 40/40 (0) | 1 (1) | 6 / 6 | 29 | w1:34, w2:6 | Cumple |
| r2 | 40/40 (0) | 1 (1) | 6 / 6 | 29 | w1:34, w2:6 | Cumple |
| r3 | 40/40 (0) | 1 (1) | 6 / 6 | 29 | w1:34, w2:6 | Cumple |

Umbrales: I1 = 40 de 40; I2: `B.w2.served − A.w2.served ≤ A.w2.active`; I3: al menos 4 cada uno hasta A, y w1 al menos 20 de A a B.

**I1, I2 e I3 se cumplen en las 3 repeticiones:** 0 peticiones perdidas, con 0 respuestas 502, 503 y 504 y 0 errores de red, según el cliente y según el agente.

- **El reparto se ve en `X-Worker`:** antes de aislar, w1 y w2 se repartieron las peticiones a partes iguales.
- **Aislamiento con una petición en curso:** a diferencia de la [fase C](../url-pool-phase-c/README.md), w2 **tenía una petición en curso** al aislarlo (`active` = 1 en A). La terminó, y no recibió ninguna nueva. Esta vez la prueba sí ejercitó el caso «lo que tenía en curso termina».
- **Sin fallos ni reinicios:** ningún worker registró fallos ni reinicios, y w1 siguió `up` durante toda la prueba.

**Latencia, informativa y sin umbral:**

| Repetición | p50 | p95 |
|---|---|---|
| r1 | 22,5 s | 22,8 s |
| r2 | 22,4 s | 22,7 s |
| r3 | 22,4 s | 22,7 s |

- **Por qué es tan alta:** después de aislar w2, w1 atiende en serie las 2 peticiones simultáneas, así que cada una espera a la otra. Con `LB_TIMEOUT_MS` de 45 s, ninguna llegó al límite.
- **No es cifra de rendimiento** y no cambia C1.

## Cómo se midió

- **Comando de cada repetición:** `pnpm --filter @chessspeak/local-agent load --steps 2 --requests 40 --warmup 2 --label ec2-aislamiento-r<n> --out-dir <carpeta-de-salida>`.
- **El agente no se reinició entre repeticiones,** a diferencia de la fase C, y sus contadores son acumulados. Por eso cada repetición siguió este orden:
  1. **Devolver w2:**
     - en r1 la respuesta fue 409, porque w2 no estaba aislado;
     - en r2 y r3 fue 202;
     - en las tres se comprobó que w1 y w2 estaban `up` antes de seguir.
  2. **Instantánea 0:** guardar `/lb/stats` (`snapshot-0-r<n>.json`) justo antes de la carga.
  3. **Umbral de 12 respuestas:** se cuenta respecto a la instantánea 0, sumando solo las respuestas 200 nuevas de esa repetición (las 2 del calentamiento más 10 del escalón). Al llegar a 12 se aísla w2 y se guarda la **instantánea A**.
  4. **Instantánea B:** al terminar la carga.
- **Cálculo de I3:**
  - «hasta A» es `A.served − 0.served` de cada worker, e incluye el calentamiento;
  - «de A a B» es `B.w1.served − A.w1.served`.
- **I1 e I2** salen del JSON de `load.ts` y de las instantáneas A y B, como en la fase C.
- **Momentos en que se aisló w2** (UTC−5):
  - r1 empezó a las 14:15:27 y w2 se aisló a las 14:16:48;
  - r2 empezó a las 14:22:06 y w2 se aisló a las 14:23:28;
  - r3 empezó a las 14:28:44 y w2 se aisló a las 14:30:04;
  - la carga terminó a las 14:35:21.
- Las cifras de las tablas salen de estos archivos; ninguna se editó a mano.

## Entorno

- **Instancias:**
  - 2 `c7i-flex.large` en `us-east-2`, preparadas con [`whisper-cloud/aws/user-data.sh`](../../../whisper-cloud/aws/user-data.sh) sin cambios;
  - un contenedor `small` en cada una, con `--cpus=2 --memory=2g`.
- **Comprobado antes de medir, por SSH y solo con lectura:**
  - las dos marcaban «listo» en su registro;
  - el puerto 8080 escuchaba solo en `127.0.0.1`;
  - `/health` respondía 200;
  - la CPU tenía AVX2.
- **Acceso:**
  - un túnel SSH por instancia: `127.0.0.1:18201` para w1 y `127.0.0.1:18202` para w2;
  - el grupo de seguridad solo admite el puerto 22 desde la IP `/32` del responsable;
  - la clave privada está fuera del repo.
- **Agente:** `local-agent` en modo URLs, con conexiones mínimas, `LB_TIMEOUT_MS=45000` y `LB_PROBE_INTERVAL_MS=15000`, solo como variables de entorno. La cola es de 8.
- **Clip:** el WAV por defecto de `load.ts`. Es una grabación del responsable del repo, que dio su OK explícito para enviarla a sus instancias en esta prueba.
- **Equipo del responsable:**
  - VPN apagada; no se usó el equipo durante la medición;
  - Docker local apagado, comprobado antes de medir y en cada repetición.

## Cambios respecto a los originales

- **En todos los archivos:** se quitó el BOM y los saltos de línea se normalizaron a LF.
- **`entorno-*.txt`:** la línea «Destino» salió con doble codificación («a travÃ©s de tÃºneles»). La causa fue que Windows PowerShell 5.1 leyó sin BOM el script que la escribía. **Se decodificó de vuelta solo esa línea**, que ahora dice «a través de túneles». No se tocó ninguna otra línea.
- **`load-*.txt`:** la ruta relativa a la carpeta de salida de la línea «Reporte» se cambió por `<carpeta-de-salida>`.
- **Lo demás no se tocó:**
  - los JSON de `load.ts` y las instantáneas se conservan con todo su contenido, incluido el pid del agente, igual que en la fase C;
  - no aparecen las IP públicas de las instancias: solo `127.0.0.1`, que es el extremo local de los túneles;
  - no hay listas de procesos.
- **No se incluye:** la salida de error de `pnpm`, que solo repetía el comando con la ruta de salida.

Para comprobar los archivos, desde esta carpeta: `sha256sum -c SHA256SUMS`.
