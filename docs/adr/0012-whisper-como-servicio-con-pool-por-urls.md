# ADR 12 — Whisper como servicio, balanceado por URLs desde el `local-agent`

- **Estado:** Aceptado (14 de noviembre de 2026). **Sustituye al [ADR 11](0011-balanceo-de-jugadas-con-move-workers.md).**
  - **Construido y medido:** el pool por URLs con 3 contenedores locales.
  - **AWS EC2 se probó y se recortó el 14 de noviembre.** Con una instancia `c7i-flex.large`, C1 no cumple: el p95 de la peor repetición fue de 13,59 s, y el umbral es 7,5 s.
  - **Reabierto el 14 de noviembre, por decisión del responsable del repo, solo como demostración del balanceo:** 2 instancias detrás del agente. **Motivo:** mostrar el reparto entre 2 máquinas reales, que los contenedores locales no pueden mostrar. C1 sigue siendo «no cumple». El criterio de C4 se fijó antes de medir ([sección 7 de los criterios](../whisper-cloud-criteria.md#7-adenda-del-14-de-noviembre-c4-en-ec2-como-demostración-del-balanceo)).
  - **Tope:** el domingo 15 de noviembre a las 22:00 (UTC−5). Si no hay evidencia de C4 fusionada con la CI en verde, se terminan las instancias y el balanceo vuelve a los 3 contenedores locales.
- **Relacionado:**
  - [ADR 5](0005-strategy-y-reconocedor-por-defecto.md) · [ADR 10](0010-balanceo-de-carga-en-local-agent.md) · [ADR 11](0011-balanceo-de-jugadas-con-move-workers.md) (sustituido)
  - [Criterios de Whisper en la nube](../whisper-cloud-criteria.md), con la adenda de EC2 y la de C4 (sección 7) · [Criterios de la fase C](../url-pool-criteria.md)
  - Evidencia: [fase A](../evidence/whisper-cloud-phase-a/README.md) · [fase C](../evidence/url-pool-phase-c/README.md) · [EC2](../evidence/whisper-cloud-ec2/README.md)

## Contexto

- **El ADR 10** balancea Whisper entre procesos de una misma máquina. Su revisión del 5 de noviembre dejó dudas sobre si eso cuenta como balanceo real.
- **El ADR 11** proponía repartir el guardado de jugadas entre `move-workers`. Es una petición ligera, que no cumple la condición de trabajo pesado. El pool nunca se construyó.
- **Sugerencia del profesor:** según el responsable del repo, el profesor sugirió desplegar solo Whisper como servicio en la nube, para que el balanceo reparta trabajo pesado y se pueda observar. Es lo que el responsable recoge de esa conversación; no es una cita literal.
- **La nube:** Google Cloud quedó descartado porque pedía un prepago. La alternativa elegida es AWS EC2, en `us-east-2`, con una cuenta del plan gratuito con créditos.
- **El plazo** es el 19 de noviembre de 2026, con demo en vivo.

## Decisión

1. **Se balancea Whisper como un servicio HTTP independiente.** Es la imagen Linux de `whisper-server` de [`whisper-cloud/Dockerfile`](../../whisper-cloud/Dockerfile): whisper.cpp `d1be6fd`, modelo `small` con el prompt de ajedrez y `GGML_NATIVE=OFF`.
2. **El gateway es el `local-agent`, en modo URLs.** Con `WHISPER_URLS`, el agente se conecta a workers que ya están en marcha, en vez de arrancar procesos. Conserva:
   - la cola y la estrategia de conexiones mínimas;
   - las respuestas 503 y 504;
   - el reintento único en otro worker;
   - el monitor y el dashboard.

   Sin `WHISPER_URLS` sigue el pool de procesos del ADR 10, que queda como salida de emergencia.
3. **Aislar y devolver** sustituyen a «matar» en modo URLs, porque el agente no posee ningún proceso.
   - **Aislar** (`POST /lb/workers/:id/isolate`) saca al worker de la rotación y deja de sondearlo, y lo que tenía en curso termina.
   - **Devolver** (`/restore`) comprueba su `/health` una vez **y le da otra ronda completa de `LB_RECONNECT_MAX` reconexiones**.
4. **No hay reintentos sin tope.**
   - Tras `LB_RECONNECT_MAX` conexiones fallidas seguidas, el worker espera a que lo devuelvan.
   - Las URL que salen del equipo se sondean y se reconectan como mucho cada 15 s, y tienen que usar https.
   - Fuera de la propia máquina, `http` solo se acepta en loopback.
5. **Workers probados:** 3 contenedores locales, definidos en [`whisper-cloud/compose.local.yml`](../../whisper-cloud/compose.local.yml), con 2 CPU y 2 GB cada uno, en `127.0.0.1:18101-18103`. Son el plan B del balanceo y la base de la demo.
6. **EC2 se probó con una instancia y se recortó** ([adenda](../whisper-cloud-criteria.md), [evidencia](../evidence/whisper-cloud-ec2/README.md)), porque C1 no cumple. **El 14 de noviembre se reabre solo para demostrar el balanceo**, con 2 instancias y C4 como criterio (sección 7 de los criterios). No se presenta como apto para jugar por voz. El diseño:
   - Cada instancia lleva un worker. El agente las usa con `WHISPER_URLS=http://127.0.0.1:18201,http://127.0.0.1:18202`, `LB_PROBE_INTERVAL_MS=15000` y `LB_TIMEOUT_MS=45000`, solo como variables de entorno.
   - El agente llega a cada worker por un túnel SSH. El grupo de seguridad solo abre el puerto 22, solo para la IP del responsable con `/32`, y la clave privada se queda fuera del repo.
   - El puerto de Whisper no se abre a internet.
7. **El navegador, el contrato y el servidor no cambian.** No se añaden el campo `whisperHost` ni un tercer reconocedor.
8. **El pool de `move-workers` no se construye.** El puerto `MovePersistence` se queda con `MOVE_WORKERS=0`, es decir, con escritura directa.

## Qué se midió

**La velocidad no es criterio en ninguna de las dos fases.** Los criterios se fijaron por escrito antes de medir.

- **Fase A (imagen, `docker run --cpus=2 --memory=2g`):** `small` y `base` cumplen A1–A4 en las 3 repeticiones ([evidencia](../evidence/whisper-cloud-phase-a/README.md)).
- **Fase C (3 contenedores locales, criterio v1):**
  - **Aislamiento con concurrencia 2:** I1–I3 se cumplen en las 3 repeticiones. Cada una tuvo 40 de 40 respuestas 200, w2 no recibió ninguna petición nueva después de aislarlo, y w1 y w3 siguieron repartiéndose la carga ([evidencia](../evidence/url-pool-phase-c/README.md)).
  - **Salvedad:** en las tres repeticiones, w2 **no tenía ninguna petición en curso** cuando se aisló. La prueba no ejercitó el caso «lo que tenía en curso termina». Ese caso solo lo cubre el test `local-agent/test/url-pool.test.ts`.
  - **Medición informativa con concurrencia 4 y 3 workers, sin umbral:** hubo 504. Con una petición siempre en cola, el criterio ya preveía que aparecieran al superar los 15 s de `LB_TIMEOUT_MS`. **No son cifras de rendimiento** y no se usan para comparar nada.
- **EC2 (adenda del 13 de noviembre, 14 de noviembre):** una sola `c7i-flex.large` en `us-east-2`, a través del túnel SSH, desde el equipo del responsable, con la VPN y Docker local apagados ([evidencia](../evidence/whisper-cloud-ec2/README.md)).

  | | Umbral | Medido | Resultado |
  |---|---|---|---|
  | **C2** | primer clip tras `/health` 200 ≤ 30 s | 11,52 s | Cumple |
  | **C1** | p95 de la peor de 3 repeticiones ≤ 7,5 s | 13,59 s; las otras dos, 11,72 y 11,68 s | **No cumple: se recorta la nube** (más de 9,0 s) |
  | **C3** | ≥ 68/78 en cada repetición | 68, 68 y 68 | Cumple, justo en el umbral |
  | **C4** | 2 instancias | — | No medido |

  La latencia dobla la de la fase A en local. **Causa probable, no confirmada:** las vCPU de las instancias «flex». No se midieron por separado la red, el túnel ni la CPU de la instancia.

## Qué no está probado

- **Balanceo en la nube:** C4, con 2 instancias, no se midió, porque C1 ya había fallado con una. C5, el gasto, lo comprueba el responsable del repo en la consola de facturación de AWS.
- **Varias máquinas:** todo lo medido corrió en un solo equipo. La objeción del profesor sobre los procesos locales vale también para contenedores en una sola máquina. Hay que decirlo al presentar.
- **La demo depende de Docker Desktop,** que el ADR 10 había descartado precisamente por eso. El modo por procesos sigue disponible como salida.
- **En una partida real** el balanceador recibe una petición cada vez. Toda la carga medida es sintética.

## Alternativas

- **Cloud Run (descartada):** pedía un prepago.
- **Gateway en el servidor de Render (no se construye):** desde allí no se llega a los contenedores locales, y moverlo exige resolver ESM/CJS. Es trabajo aparte.
- **Pool de `move-workers` (ADR 11, sustituido):** es una petición ligera y no reparte trabajo pesado.
- **Solo el pool de procesos del ADR 10:** se conserva como salida de emergencia, no como decisión principal.

## Consecuencias

- (+) El trabajo pesado se reparte entre servicios HTTP independientes, con monitor, aislamiento demostrable y 0 peticiones perdidas en la prueba fijada.
- (+) El mismo código sirve para contenedores locales y para EC2: solo cambian las URL.
- (+) El navegador y el servidor no cambian, y el modo por procesos sigue como salida.
- (−) En local todo comparte una máquina, así que no demuestra escalado.
- (−) La demo con contenedores necesita Docker Desktop encendido. Además, 3 contenedores pueden usar hasta 6 de los 12 hilos y unos 2–3 GB de RAM.
- (−) EC2 no cumplió C1. Si C4 no se demuestra antes del tope, el balanceo no sale del equipo: se demuestra solo con contenedores en una misma máquina, y hay que decirlo al presentar.
- (−) La reapertura cuesta dinero y tiempo antes de la entrega. Depende de 2 túneles SSH y de la IP `/32` del responsable, y en EC2 cada clip tarda el doble que en local.
