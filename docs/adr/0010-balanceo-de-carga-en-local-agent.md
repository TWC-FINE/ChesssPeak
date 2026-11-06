# ADR 10 — Balanceo de carga de la transcripción con Whisper en el `local-agent`

- **Estado:** Aceptado (4 de noviembre de 2026). **Revisado el 5 de noviembre: no está confirmado que cumpla por sí solo el requisito; ver [la revisión](#revisión-del-5-de-noviembre).**
- **Relacionado:** [ARCHITECTURE.md](../../ARCHITECTURE.md) §2.1 y §4 · ADR 1 · ADR 5 · [ADR 11](0011-balanceo-de-jugadas-con-move-workers.md) · [docs/load-balancing.md](../load-balancing.md)

## Contexto

El profesor añadió un requisito al proyecto: **un balanceador de carga sobre un proceso crítico**, con el algoritmo justificado, un **monitoreo real** que muestre cómo se reparten las peticiones y cómo se aísla una instancia caída, y una **prueba de carga** que compare la versión monolítica con la balanceada en el equipo de menores prestaciones del grupo. Aclaró que las instancias pueden ser procesos de la misma máquina y que la transcripción con Whisper vale como proceso crítico. **Una conversación posterior pone esto en duda; ver [la revisión](#revisión-del-5-de-noviembre).**

ChessSpeak tiene dos candidatos:

- **El servidor NestJS.** Cada jugada es una operación barata, pero la partida vive en memoria (`GameRoom`, ADR 7) y cada cliente mantiene un socket de Socket.IO. Render gratuito da una sola instancia.
- **La transcripción con Whisper** del `local-agent`. Cada petición tarda segundos de CPU (p50 de 2,91 s solo de inferencia con `small` en un i5-12400F, ADR 5) y no guarda estado: cualquier instancia puede atender cualquier clip.

## Decisión

1. **Se balancea la transcripción con Whisper dentro del `local-agent`.** El agente sigue en `127.0.0.1:8765` con el mismo contrato (`POST /transcribe`, `GET /health`). Detrás hay un pool de `LB_WORKERS` procesos `whisper-server` en puertos consecutivos desde el 8801. Por defecto, los hilos de la CPU se reparten entre ellos (`LB_THREADS_PER_WORKER`). El navegador y el adaptador Whisper no cambian.
2. **Algoritmo: conexiones mínimas (*least connections*).** Cada petición va al worker con menos peticiones en curso. Los empates rotan para que los workers libres se repartan el trabajo. Turno rotativo (*round robin*) queda implementado como segunda estrategia (`LB_STRATEGY=round-robin`) para las comparativas. **Precisión (5 de noviembre):** el pool solo ofrece a la estrategia workers libres, y cada worker atiende una petición a la vez. Por eso todos los candidatos tienen 0 peticiones en curso y, con este código, las dos estrategias se comportan como "una cola común y el siguiente worker libre". Solo cambia el orden en que se reparten los libres. La diferencia entre algoritmos aparecería con una concurrencia por worker mayor que 1.
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
- **Turno rotativo como algoritmo principal:** en un balanceador clásico reparte por orden sin mirar la carga y puede mandar trabajo a un worker ocupado. En este pool ese caso no ocurre, porque solo elige entre workers libres (ver la decisión 2). Se conserva para comparar.
- **IP hash:** todas las peticiones llegan desde `127.0.0.1`, así que todas irían al mismo worker.
- **Variantes ponderadas y menor tiempo de respuesta:** tienen sentido con instancias desiguales. Aquí todos los workers son iguales (mismo binario, modelo e hilos).
- **Contenedores Docker por worker:** más aislamiento, pero obliga a quien evalúa a tener Docker, y el binario de `whisper.cpp` que usa el proyecto es de Windows. El profesor aceptó procesos de la misma máquina.

## Consecuencias

- (+) El contrato con el navegador no cambia, y el resto de la arquitectura (servidor, sockets, bases) tampoco.
- (+) Un worker que falla queda aislado: las peticiones siguen en los demás y él vuelve solo. El dashboard lo muestra en vivo.
- (+) La saturación tiene respuestas definidas (503 inmediato, 504 a los 15 s) en lugar de una espera sin fin.
- (−) Cada worker carga su copia del modelo `small`: en el equipo de desarrollo, unos 580–700 MB de RSS cada uno. La RAM limita cuántos caben.
- (−) Todos los workers comparten la misma CPU. Con los mismos hilos totales, balancear no crea capacidad de cómputo: lo que aporta es el aislamiento de fallos, no una mejora de rendimiento demostrada, y las cifras de [load-balancing.md](../load-balancing.md) deben leerse así.
- (−) El reconocedor por defecto es Web Speech (ADR 5). El proceso balanceado es el de la alternativa Whisper, que exige instalar el agente.
- (−) **En una partida real, este balanceador ve una petición a la vez:** los turnos alternan y cada jugador tiene su propio agente. Con una sola petición, el balanceado es más lento, así que **`LB_WORKERS` vale 1 por defecto**. Varios workers aíslan fallos y no aceleran el uso normal. Se evaluó un análisis post-partida con Stockfish como caso con carga natural, y su prueba de viabilidad no pasó ([analysis-gate.md](../analysis-gate.md)).
- (−) El binario de Whisper del proyecto es de Windows x64. En otro sistema hay que descargar otro.

## Revisión del 5 de noviembre

**Qué cambió.** Este ADR da por hecho que el profesor aceptó dos cosas: procesos de la misma máquina y Whisper como proceso crítico. No cita sus palabras. Más tarde, al preguntarle por un modo de dictado local, la transcripción automática de la conversación recoge la idea de que, si todo son procesos locales dentro del procesamiento, no habría balanceo real. También recoge que las peticiones entren por un gateway que las distribuya y que sean «un poquito pesadas». La transcripción tiene errores y no se publica completa. El detalle, en paráfrasis salvo citas breves, está en el [ADR 11](0011-balanceo-de-jugadas-con-move-workers.md#qué-dijo-según-la-transcripción).

**Cómo queda este ADR frente a eso:**

| Lo que pidió | Este balanceador | Estado |
|---|---|---|
| Peticiones que entran por un gateway que las distribuye | Sí: el agente en `127.0.0.1:8765` reparte entre los workers | Cumple en lo técnico |
| Peticiones «un poquito pesadas» | Sí: cada transcripción tarda segundos de CPU | Cumple |
| Que no sea un proceso local sin balanceo real | Todo ocurre en un solo equipo, para una sola persona, con una petición a la vez en una partida | **En duda** |

**Lo que hay que dejar de afirmar:** que este balanceador cumple por sí solo el requisito, o que el profesor ya resolvió la cuestión de los procesos locales. Tampoco sabemos si aquella frase se refería a este pool, porque en la transcripción no queda claro. Ya no podemos preguntárselo, así que la duda queda abierta y hay que decirlo en la evaluación.

**Lo que sigue siendo válido:** la implementación y el rechazo de las réplicas de NestJS. Whisper sigue siendo el único proceso realmente pesado del proyecto, y este pool se conserva.

**Qué se hace al respecto:** el [ADR 11](0011-balanceo-de-jugadas-con-move-workers.md) añade un balanceo en el flujo real de la partida. Tampoco está confirmado que el profesor lo acepte.

**Resultados del 5 de noviembre.** Dos repeticiones nuevas en el mismo equipo corrigen la conclusión anterior de [load-balancing.md](../load-balancing.md), sección 6.5:

- **No se demostró mejora de rendimiento:** con 4 simultáneas fue de un 4–5 %, no del ≈ 24 % del 4 de noviembre, y la diferencia entre esos dos días es mayor que ese efecto. La causa no se investigó.
- **Con 4 simultáneas,** la mediana mejora un 27–28 %, pero el p95 empeora un 40–42 %.
- **Con 1 petición, que es el caso real de una partida,** el balanceado es un 57–60 % más lento. Eso refuerza que `LB_WORKERS` valga 1 por defecto.
- **Con 2 simultáneas** ya no mejora la mediana, y ambas configuraciones fallan con 8 por tiempo de espera (504).
- **Tolerancia a fallos:** en el ensayo con `LB_WORKERS=3`, las 15 peticiones respondieron bien pese a matar un worker, que volvió solo.

Este balanceo se presenta como un requisito del curso; su beneficio medido es la tolerancia a fallos. Falta repetir la prueba en el equipo más débil, si no es este.

**Un error del guion, no de este ADR:** con el valor por defecto `LB_WORKERS=1`, el dashboard de la demo muestra un solo worker y no se ve balanceo. La demo debe arrancar con `LB_WORKERS=3`.
