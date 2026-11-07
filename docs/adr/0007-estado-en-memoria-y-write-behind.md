# ADR 7 — Estado de la partida en memoria y guardado write-behind

- **Estado:** Aceptado (5 de noviembre de 2026).
- **Relacionado:** [ARCHITECTURE.md](../../ARCHITECTURE.md) §2.1 · [docs/protocol.md](../protocol.md) §7 · ADR 1 · ADR 3

## Contexto

Una jugada debe llegar a los dos jugadores sin esperar a la base de datos, y dos mensajes no pueden pisarse dentro de un cambio de estado. A la vez, la reconexión de un jugador no debe perder jugadas (SPEC.md, objetivo: 0 perdidas).

## Decisión

1. **`GameRoom` es la fuente de verdad, en memoria y síncrona.** El gateway autentica, llama a un método y solo entonces guarda y avisa. Hay una sala por partida, y se conserva en memoria mientras dure el proceso.
2. **Guardado write-behind, que no es un guardado sin pérdida.** La jugada se avisa a los dos jugadores sin esperar a que quede guardada. **El servidor puede perder jugadas pendientes si muere.** El objetivo de 0 jugadas perdidas de SPEC.md se cumple en la reconexión de un jugador, no en la muerte del servidor.
3. **Una cola por partida.** La jugada `n+1` se envía solo cuando la `n` quedó guardada. Si no, `appendMove` vería un hueco. Una escritura fallida se reintenta, con esperas crecientes hasta 30 s, hasta que funcione o se detenga el servidor. Las partidas no se esperan entre sí.
4. **Rehidratación:** si una partida no está en memoria, se reconstruye con Postgres (asientos y resultado) y Mongo (jugadas), repitiendo las jugadas con las mismas reglas. Unos datos dañados se rechazan en lugar de servirse.
5. **El documento de `game_moves` se crea al cargar la sala,** antes de la primera jugada.
6. **Abandono:** quien lleva más de `ABANDON_TIMEOUT_MS` (60 s por defecto) desconectado de una partida activa pierde. Al volver se cancela. Si tiene otra pestaña abierta, no cuenta como desconectado. Tras un reinicio, el plazo del ausente empieza cuando entra su rival. El plazo sigue siendo provisional (`docs/protocol.md` §7).

## Alternativas

- **Guardar antes de avisar:** daría una garantía mayor, pero cada jugada esperaría a Mongo, que en Atlas está al otro lado de la red.
- **Estado solo en la base:** cada jugada leería y escribiría la partida, y haría falta controlar la concurrencia que hoy resuelve la sala síncrona.

## Consecuencias

- (+) La respuesta no depende de la latencia de la base, y si Mongo cae un momento la partida sigue.
- (+) Un reinicio conserva lo que ya estaba guardado, y la partida continúa con los mismos asientos. Lo pendiente de guardar se pierde.
- (−) **El servidor puede perder jugadas si muere con escrituras pendientes.** Los jugadores ya las vieron y no llegaron a guardarse, porque la cola vive en memoria. Con Mongo caído, ese riesgo dura todo lo que dure la caída. Al volver, la partida sigue desde la última jugada guardada, y los clientes verán menos jugadas que antes. **No hay ninguna prueba de este caso:** las pruebas de reinicio esperan a que la cola se vacíe antes de detener el servidor.
- (−) Una sola instancia: varias instancias tendrían salas distintas para la misma partida (ADR 1).
- (−) Las salas no se liberan de memoria mientras dure el proceso. Basta para este proyecto, y es lo que habría que cambiar con muchas partidas.
- (−) Si el fallo de una escritura no se resuelve nunca, la cola de esa partida queda detenida y reintentando.
- (−) Tras un reinicio, si no vuelve ninguno de los dos jugadores, la partida queda activa, porque ningún plazo llega a empezar.
