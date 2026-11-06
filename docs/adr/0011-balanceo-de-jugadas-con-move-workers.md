# ADR 11 — Balanceo del guardado de jugadas con un pool de `move-workers`

- **Estado:** Aceptado (5 de noviembre de 2026), **sobre dos supuestos débiles sin confirmar** (a continuación). El puerto `MovePersistence` existe en el PR #13; el pool de `move-workers` no existe todavía.
- **Relacionado:** [ADR 1](0001-nestjs-typescript-contratos-en-shared.md) · [ADR 3](0003-postgres-y-mongodb.md) · [ADR 10](0010-balanceo-de-carga-en-local-agent.md) · [ARCHITECTURE.md](../../ARCHITECTURE.md) §2.1

## Supuestos débiles: leer primero

**Todo este diseño se apoya en dos supuestos que pueden no sostenerse.** Ya no se le puede preguntar al profesor.

1. **Procesos en la misma instancia cuentan como servicios distintos.** El profesor habló de «diferentes servicios». No dijo que procesos separados dentro de una misma instancia cuenten como tales, y su frase sobre los procesos locales apunta en contra, aunque el ADR 10 registra que antes aceptó procesos de la misma máquina.
2. **«Eso puede ser» es aprobación tentativa, no confirmación.** Además, la transcripción no indica quién habla: que esa frase sea suya es la atribución de quien mantuvo la conversación.

Si en la evaluación no acepta alguno de los dos, este pool no cumple el requisito tal como está, y no hay una alternativa construida ni probada. Hay que decirlo al presentar, sin esperar a que lo pregunte.

## Contexto

El ADR 10 balancea la transcripción con Whisper dentro del `local-agent`. En una partida real, ese balanceador recibe una petición a la vez. Para tener carga real se propuso al profesor un modo de dictado, en el que una persona dicta una partida entera en un solo equipo.

El profesor no aprobó ni rechazó ese modo. Habló de otra cosa: las peticiones deben entrar por un gateway que las distribuya y las jugadas pueden repartirse entre distintos servicios camino a la base de datos.

### Qué dijo, según la transcripción

La transcripción es automática, tiene errores y no indica quién habla. **Fecha de recepción: 5 de noviembre de 2026.** La transcripción completa no se publica.

**Procesos locales (paráfrasis):** si todo son procesos locales dentro del procesamiento, no habría balanceo real.

**Gateway (paráfrasis):** las peticiones entrarían por un gateway, como puerta de entrada, y este las repartiría.

> «esas uvas tienen que ser un poquito pesadas»

**Reparto (paráfrasis):** balancear sería enviar a cada jugador, según llega, por uno de los caminos disponibles.

> «Eso puede ser.»

Lecturas nuestras, no confirmadas: «uvas» sería «jugadas» o «peticiones». En la frase del gateway, la transcripción dice «condiciones», que leemos como «peticiones». En la de los procesos locales dice «por ida», y no sabemos qué quiso decir; podría ser «por IA».

## Otro supuesto

**Suponemos que su propio ejemplo cumple su condición de «un poquito pesadas».** Medido con esa condición, este diseño no la cumple (ver «Carga real por jugada»).

## Decisión

1. **El gateway Socket.IO de NestJS reparte el guardado de cada jugada** entre `MOVE_WORKERS` procesos, y cada uno la escribe en Mongo con `appendMove`:

   ```
   navegador ─socket→ NestJS (gateway · GameRoom) ─→ pool ─→ move-worker w1 ─┐
                                                         └─→ move-worker w2 ─┴→ Mongo (appendMove)
   ```

2. **`GameRoom` sigue siendo la única fuente de verdad y la única que valida.** El worker no revalida: solo guarda.
3. **Puerto `MovePersistence` con dos implementaciones:** directa y por pool. **`MOVE_WORKERS=0` es el valor por defecto** y escribe directo, sin procesos extra. Mientras no exista el pool, un valor mayor que 0 aborta el arranque, en lugar de aparentar un pool escribiendo directo. **Este aborto es temporal, hasta el pool de `move-workers`** (tarea 20 de `proximos-pasos.md`).
4. **Si el pool falla, la partida sigue:** el adaptador escribe directo con el mismo repositorio, y los reintentos no duplican la jugada.
5. **Orden por partida:** la jugada `n+1` se envía solo cuando la `n` quedó guardada. La cola está en `server/src/games/per-game-queue.ts`, porque también ordena las escrituras de Postgres; el pool la usa, no la reemplaza. Las jugadas alternas pueden ir a workers distintos, pero nunca se adelantan. `appendMove` ya es idempotente, así que los reintentos son seguros y un hueco se detecta en lugar de ocultarse.
6. **El cambio se queda dentro de los límites** de la sección siguiente.
7. **Primero se copia lo mínimo del pool dentro de `server/` y `local-agent` no se toca.** Solo se extrae a un paquete si después los tests de `local-agent` siguen pasando sin cambiar aserciones y ESM/CJS se resuelve sin trucos. Hasta entonces, el código duplicado es una deuda aceptada.
8. **El botón de matar workers no es público.** La variable `MOVE_WORKERS_KILL_SECRET` **no tiene valor por defecto**: si está vacía o no existe, el botón y su ruta quedan desactivados. Si tiene valor, cada llamada debe presentarlo. `.env.example` lleva solo el nombre, con el valor vacío.
9. **Sin trabajo artificial:** no se añaden esperas ni cálculo para que la petición parezca pesada.

## Límite de cambios en `server/`

**Carpetas permitidas:**

| Ruta | Contenido |
|---|---|
| `server/src/games/move-persistence/` (nueva) | Puerto, escritura directa, adaptador del pool, copia mínima del pool y monitor |
| `server/src/games/per-game-queue.ts` (ya existe) | Cola por partida. Vive aquí, y no con el puerto, porque también ordena las escrituras de Postgres |
| `server/src/move-worker/` (nueva) | Proceso worker: recibe la jugada y llama a `appendMove` |
| `server/test/move-persistence/` (nueva) | Tests unitarios |
| `server/test/integration/move-persistence.int-spec.ts` (nuevo) | Test de integración |

**Únicos puntos de conexión con el resto:** registrar el proveedor en `server/src/games/games.module.ts` y llamar al puerto desde el gateway Socket.IO, que es trabajo del núcleo.

**Quedan intactos:**

- `server/src/games/game-room.ts` y toda la validación de jugadas;
- `server/src/database/`: el repositorio y los schemas se reutilizan sin modificarlos;
- `server/prisma/`, `auth`, `health` y `voice-metrics`;
- `shared/`, `packages/voice-parser` y `local-agent/`.

Cualquier otro cambio se avisa antes de hacerlo.

## Criterio de éxito (fijado antes de construir)

**Se mata un worker a mitad de partida y no se pierde ninguna jugada**, verificado en Mongo. Para una partida de `N` medias jugadas en `GameRoom`, el documento de `game_moves` debe cumplir:

- `plyCount` es igual a `N`;
- `moves` tiene `N` elementos;
- los `ply` son exactamente 1, 2, … `N`, sin huecos ni duplicados.

**La velocidad no es criterio de éxito.** La prueba de carga se publica aunque la mejora sea pequeña o nula.

## Pruebas obligatorias

- **Caída del pool a media jugada (test explícito):** el pool falla con la jugada en curso, el adaptador reintenta directo y `plyCount` queda sin huecos. Cubre dos casos: el worker cae antes de escribir (el reintento da `applied`) y cae después de escribir sin llegar a responder (el reintento da `duplicate`).
- **Unitarias:** orden por partida, duplicados, huecos, reintento tras la caída de un worker y `MOVE_WORKERS=0`.
- **Integración con Mongo local, nunca Atlas:** dos partidas simultáneas, con `plyCount` sin huecos.
- **Regresión:** `pnpm verify` y los tests de `local-agent` en verde, sin cambiar aserciones.
- **Carga:** `MOVE_WORKERS=1` frente a `3`, con varias repeticiones, declarada como sintética. Las cifras se publican como salgan.
- **Manual:** partida con dos pestañas y `MOVE_WORKERS=3`. Se mata un worker a mitad de partida y se comprueba en Mongo que están todas las jugadas y que el worker volvió solo.

## Carga real por jugada

Sale del código actual. **Los tiempos todavía no se han medido.**

| Qué | Por jugada | ¿Pasa por el worker? |
|---|---|---|
| Mongo `game_moves` | Un `updateOne` en el caso normal, más un `findOne` si la jugada es un duplicado o hay un hueco. Añade un subdocumento con `ply`, `uci`, `san`, `fen` y `at` | **Sí** |
| Postgres `games` | Nada: la tabla no tiene campos por jugada. Se escribe al crear la partida y al cambiar su estado o terminar | No |
| Mongo `voice_attempts` | Nada por jugada: es un documento por intento de reconocimiento, y va por `voice-metrics` | No |

**Conclusión: es una petición ligera y limitada por la base de datos, no por la CPU del worker.** Esperamos poca o ninguna mejora de rendimiento. Whisper sigue siendo el proceso pesado del proyecto (ADR 10).

## Dominio: en espera del profesor

[PLAN.md](../../PLAN.md) registra que el profesor pidió el dominio. Está delegado a su hosting y queda en espera de que lo agregue allí. Si en la evaluación lo exige y no funciona, ese pedido queda sin cumplir. **Mínimo garantizado: la web publicada en Vercel con su URL `vercel.app`.**

## Alternativas

- **Réplicas de NestJS con Redis (descartada):** es lo más parecido a lo que describió el profesor, porque A y B podrían entrar por instancias distintas. Pero exige sacar `GameRoom` de la memoria o compartirla, un adaptador Redis para Socket.IO y sesiones pegajosas. Eso rompe los ADR 1 y 7 y pone en riesgo el hito del 11 de noviembre.
- **Modo de dictado (no se construye):** las peticiones son pesadas, pero todo ocurre en un solo equipo, que es justo lo que el profesor cuestionó. Además obligaría a cambiar la confirmación explícita (RF8) y costaría 2 o 3 días.
- **Whisper central por red local (no se construye):** cumple gateway y peso, pero depende de la red de la sala y cambia el módulo local. Además, los turnos alternan y el reconocedor por defecto es Web Speech.

## Consecuencias

- (+) El balanceo está en el flujo real de una partida, y un fallo se puede demostrar jugando.
- (+) Con `MOVE_WORKERS=0`, la partida no depende de este pool; es la salida si hay retraso o falla.
- (+) `workerConcurrency` mayor que 1 haría que conexiones mínimas decida de verdad, a diferencia del ADR 10. Solo aplica si se configura así.
- (−) **El pool no hace el sistema más fiable que escribir directo.** La tolerancia a fallos que se demuestra es ante la caída de sus propios workers, que la escritura directa no necesita. Mongo y NestJS siguen siendo puntos únicos de fallo. Este diseño existe para cumplir el requisito del curso, y debe presentarse así.
- (−) No cumple por sí solo «un poquito pesadas». Se presenta junto con Whisper y diciendo esto expresamente.
- (−) Si NestJS se reinicia, se pierden las escrituras pendientes, igual que con el write-behind actual.
- (−) Hay más procesos que arrancar, vigilar y documentar, y código duplicado respecto a `local-agent`. No se ha comprobado que quepan en el hosting.
- (−) Toda carga de la prueba comparativa será **sintética** (muchas partidas simuladas), porque una partida real genera muy pocas escrituras.

## Alcance y calendario

- **Antes del 11 de noviembre:** solo el puerto `MovePersistence` con escritura directa.
- **Del 12 al 15 de noviembre:** pool y worker. La congelación de funcionalidades es el lunes 16.
- **Si el hito del 11 se atrasa:** esta tarea se pausa y queda solo el balanceo de Whisper.
