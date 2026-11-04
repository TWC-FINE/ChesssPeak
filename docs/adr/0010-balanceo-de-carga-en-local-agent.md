# ADR 10 — Balanceo de carga de la transcripción con Whisper en el `local-agent`

- **Estado:** Aceptado (4 de noviembre de 2026).
- **Relacionado:** [ARCHITECTURE.md](../../ARCHITECTURE.md) §2.1 y §4 · ADR 1 · ADR 5 · [docs/load-balancing.md](../load-balancing.md)

## Contexto

El profesor añadió un requisito al proyecto: **un balanceador de carga sobre un proceso crítico**, con el algoritmo justificado, un **monitoreo real** que muestre cómo se reparten las peticiones y cómo se aísla una instancia caída, y una **prueba de carga** que compare la versión monolítica con la balanceada en el equipo de menores prestaciones del grupo. Aclaró que las instancias pueden ser procesos de la misma máquina y que la transcripción con Whisper vale como proceso crítico.

ChessSpeak tiene dos candidatos:

- **El servidor NestJS.** Cada jugada es una operación barata, pero la partida vive en memoria (`GameRoom`, ADR 7) y cada cliente mantiene un socket de Socket.IO. Render gratuito da una sola instancia.
- **La transcripción con Whisper** del `local-agent`. Cada petición tarda segundos de CPU (p50 de 2,91 s solo de inferencia con `small` en un i5-12400F, ADR 5) y no guarda estado: cualquier instancia puede atender cualquier clip.

## Decisión

1. **Se balancea la transcripción con Whisper dentro del `local-agent`.** El agente sigue en `127.0.0.1:8765` con el mismo contrato (`POST /transcribe`, `GET /health`). Detrás hay un pool de `LB_WORKERS` procesos `whisper-server` en puertos consecutivos desde el 8801. Por defecto, los hilos de la CPU se reparten entre ellos (`LB_THREADS_PER_WORKER`). El navegador y el adaptador Whisper no cambian.
2. **Algoritmo: conexiones mínimas (*least connections*).** Cada petición va al worker con menos peticiones en curso. Los empates rotan para que los workers libres se repartan el trabajo. Turno rotativo (*round robin*) queda implementado como segunda estrategia (`LB_STRATEGY=round-robin`) para las comparativas.
3. **Capacidad explícita.**
   - Cada worker atiende una petición a la vez, porque `whisper-server` procesa una inferencia a la vez. Esto se asume y falta medirlo.
   - Las demás peticiones esperan en una cola de `LB_QUEUE_MAX`. Con la cola llena, el agente responde **503** con `Retry-After`. Una petición sin respuesta a los 15 s (`LB_TIMEOUT_MS`) recibe **504**.
   - El worker sigue contado como ocupado hasta que Whisper termina de verdad.
4. **Salud y recuperación.**
   - El pool sondea `GET /health` de cada worker cada segundo. Lo saca de la rotación tras tres fallos seguidos, o en cuanto su proceso termina.
   - Lo relanza con espera creciente (1 s, 2 s, 4 s… hasta 30 s).
   - Si un worker deja de responder con una petición en curso, esa petición se reintenta una vez en otro worker.
5. **Sin procesos huérfanos.** Cada `whisper-server` corre bajo un guardián Node unido al agente por un canal IPC. Si el agente muere, incluso a la fuerza, el sistema operativo cierra el canal y el guardián mata su `whisper-server`. Además, el agente cierra los workers ante `SIGINT`, `SIGTERM`, `SIGHUP`, `SIGBREAK` y `exit`, y no adopta un puerto que ya responde.
6. **Monitoreo.**
   - Cabecera `X-Worker` en cada respuesta.
   - `GET /lb/stats` con el estado y contadores por worker y la memoria RSS que reporta el SO.
   - `GET /lb/events`, con Server-Sent Events cada segundo.
   - `GET /lb/dashboard`, una página con un botón para matar un worker, que llama a `POST /lb/workers/:id/kill`.
7. **Medición.** `pnpm --filter @chessspeak/local-agent load` lanza escalones de concurrencia y para en el primero con más de un 5 % de respuestas distintas de 200. El criterio se fijó antes de medir.

## Alternativas

- **Réplicas de NestJS detrás de nginx:** exigiría sesiones pegajosas (IP hash) para Socket.IO y un adaptador Redis, o sacar `GameRoom` de la memoria. Eso rompe los ADR 1 y 7 y no cabe en Render gratuito. Además, la partida no se satura por CPU: se tumbaría por diseño, no por carga.
- **Turno rotativo como algoritmo principal:** reparte por orden sin mirar la carga. Con peticiones de segundos que varían con la duración del clip, puede mandar trabajo a un worker ocupado mientras otro está libre. Se conserva para comparar.
- **IP hash:** todas las peticiones llegan desde `127.0.0.1`, así que todas irían al mismo worker.
- **Variantes ponderadas y menor tiempo de respuesta:** tienen sentido con instancias desiguales. Aquí todos los workers son iguales (mismo binario, modelo e hilos).
- **Contenedores Docker por worker:** más aislamiento, pero obliga a quien evalúa a tener Docker, y el binario de `whisper.cpp` que usa el proyecto es de Windows. El profesor aceptó procesos de la misma máquina.

## Consecuencias

- (+) El contrato con el navegador no cambia, y el resto de la arquitectura (servidor, sockets, bases) tampoco.
- (+) Un worker que falla queda aislado: las peticiones siguen en los demás y él vuelve solo. El dashboard lo muestra en vivo.
- (+) La saturación tiene respuestas definidas (503 inmediato, 504 a los 15 s) en lugar de una espera sin fin.
- (−) Cada worker carga su copia del modelo `small`: en el equipo de desarrollo, unos 580–700 MB de RSS cada uno. La RAM limita cuántos caben.
- (−) Todos los workers comparten la misma CPU. Con los mismos hilos totales, balancear no crea capacidad de cómputo: lo que aporta está en el aislamiento de fallos y en el reparto bajo concurrencia, y las cifras de [load-balancing.md](../load-balancing.md) deben leerse así.
- (−) El reconocedor por defecto es Web Speech (ADR 5). El proceso balanceado es el de la alternativa Whisper, que exige instalar el agente.
- (−) El binario de Whisper del proyecto es de Windows x64. En otro sistema hay que descargar otro.
