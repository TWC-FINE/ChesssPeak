# ADR 12 — Whisper como servicio, balanceado por URLs desde el `local-agent`

- **Estado:** Aceptado (14 de noviembre de 2026). **Sustituye al [ADR 11](0011-balanceo-de-jugadas-con-move-workers.md).**
  - **Construido y medido:** el pool por URLs con 3 contenedores locales.
  - **AWS EC2 sigue sin probarse:** no se ha lanzado ninguna instancia.
- **Relacionado:**
  - [ADR 5](0005-strategy-y-reconocedor-por-defecto.md) · [ADR 10](0010-balanceo-de-carga-en-local-agent.md) · [ADR 11](0011-balanceo-de-jugadas-con-move-workers.md) (sustituido)
  - [Criterios de Whisper en la nube](../whisper-cloud-criteria.md), con la adenda de EC2 · [Criterios de la fase C](../url-pool-criteria.md)
  - Evidencia: [fase A](../evidence/whisper-cloud-phase-a/README.md) · [fase C](../evidence/url-pool-phase-c/README.md)

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
6. **EC2 está diseñado, pero no probado** ([adenda](../whisper-cloud-criteria.md)).
   - Cada instancia lleva un worker.
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

## Qué no está probado

- **AWS EC2:** no se ha lanzado nada, y C1–C5 de la adenda están sin medir. Los precios oficiales se añaden, con su fecha y su enlace, antes de la primera instancia.
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
- (−) Si EC2 no se prueba antes de la entrega, este ADR queda tal cual: diseño sin evidencia en la nube.
