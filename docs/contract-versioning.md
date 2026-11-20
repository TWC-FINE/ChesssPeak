# Versionado del contrato

El contrato es todo lo que vive en `shared/`: el socket, el REST, los eventos `cs:*` del navegador y los contextos de los microfrontends. Detalle en [protocol.md](protocol.md).

## Versión actual: `v: 1`

- `PROTOCOL_VERSION = 1` en `shared/src/protocol/common.ts`.
- La versión viaja en el **handshake del socket** (`auth: { token, v: 1 }`), en **cada evento `cs:*`** y en **cada contexto**. Los mensajes del socket y del REST no la repiten: la fija el handshake.
- El servidor **rechaza la conexión** si `v` no es una versión que soporte. No responde con una versión distinta a la pedida.

## Reglas dentro de v1: solo cambios aditivos

| Cambio | ¿Permitido en v1? |
|---|---|
| Campo nuevo **opcional** en un mensaje servidor → cliente, en un evento `cs:*` o en un contexto | Sí |
| Evento nuevo (socket o `cs:*`) | Sí |
| Campo nuevo **opcional** en un mensaje cliente → servidor | Sí, desplegando antes el servidor (que es estricto) |
| Usar un valor de enum **ya marcado como reservado** (`spectator`, `threefold_repetition`, `fifty_moves`; ya se usan los tres) | Sí |
| Valor de enum nuevo, no reservado, en un mensaje servidor → cliente | **No**: un cliente antiguo lo rechazaría |
| Quitar o renombrar un campo, un evento o un valor; volver obligatorio un campo opcional; cambiar un tipo | **No** |

Lo que no está permitido exige **v: 2**: nueva constante, handshake con `v: 2` y un periodo en el que el servidor acepte las dos, o un despliegue conjunto.

## Estricto o tolerante

- **Cliente → servidor (socket y REST): `.strict()`.** El servidor rechaza cualquier campo que no conozca. Es una regla de seguridad: campos como `color`, `userId` o `player` no existen en los mensajes del cliente, y si llegan se rechazan. **La identidad la decide siempre el servidor**, a partir del token.
- **Servidor → cliente, eventos `cs:*` y contextos: tolerantes** (`z.object`, que descarta lo que no conoce). Así un cliente antiguo **ignora los campos nuevos** en lugar de fallar.

## Proceso

1. Cualquier cambio del contrato, por pequeño que sea, va en un **PR aprobado por el responsable del repo**.
2. El mismo PR actualiza los esquemas y sus tests, [protocol.md](protocol.md) y el registro de abajo.
3. Si el cambio no es aditivo, el PR sube la versión y explica la transición.

## Registro

| Versión | Fecha | Cambio |
|---|---|---|
| v1 | 2 de noviembre de 2026 | Primera versión (socket, REST, `cs:*`, contextos). Fusionada en `main` el 6 de noviembre, con la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Aditivo, sigue en `v: 1`: `GET /ranking` (`rankingResponseSchema`, `INITIAL_RATING`), el contexto de `<mf-ranking>` y el nombre `mf-ranking` en `cs:mf-ready`. El shell y los microfrontends se publican juntos en `web/dist`, así que ningún shell antiguo recibe el nombre nuevo. Pendiente de la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Tablas por acuerdo. Aditivo: los eventos `game:draw-offer`, `game:draw-answer` y `game:draw`, y el campo opcional `drawOffer` de `game:state`. **No aditivo:** el valor `agreement` de `termination`, que no estaba reservado. Se queda en `v: 1` porque el servidor (Render) y la web (Vercel) se despliegan juntos desde `main`; solo una pestaña abierta desde antes del despliegue no conocería ese valor, y lo conoce al recargar. Pendiente de la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Aditivo, sigue en `v: 1`: `GET /ranking/:displayName` (`profileResponseSchema`, `profileGameSchema`, `profileNameSchema`, `PROFILE_GAMES`), el perfil de un jugador. Es un endpoint nuevo: ningún cliente antiguo lo llama. Pendiente de la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Revancha. Aditivo, sigue en `v: 1`: los eventos `game:rematch-offer`, `game:rematch-answer` y `game:rematch`, los campos opcionales `rematchOffer` y `nextGameId` de `game:state`, y el evento `cs:open-game`. Los mensajes del cliente son eventos nuevos, así que el servidor se despliega antes o a la vez. Pendiente de la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Reloj. Aditivo: `clockMinutes` opcional en `POST /games` (`CLOCK_MINUTES`), y `clock` opcional en `game:state` y `game:moved` (`clockSchema`). **No aditivo:** el valor `timeout` de `termination`, que no estaba reservado. Se queda en `v: 1` por lo mismo que `agreement`: el servidor y la web se despliegan juntos desde `main`. Pendiente de la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Aditivo, sigue en `v: 1`: el servidor empieza a emitir `threefold_repetition` y `fifty_moves`, que estaban reservados. `RESERVED_IN_V1.termination` queda vacío. Pendiente de la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Aditivo, sigue en `v: 1`: el servidor empieza a usar `yourColor: 'spectator'`, que estaba reservado, para quien entra a una partida sin asiento libre, y `game:state` gana `spectators?`. `RESERVED_IN_V1.playerView` queda vacío. Un cliente antiguo ya aceptaba `spectator` y descarta `spectators`. Pendiente de la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Aditivo, sigue en `v: 1`: `GET /games/open` (`openGamesResponseSchema`, `OPEN_GAMES_LIMIT`, `OPEN_GAME_MAX_AGE_MS`), la lista de partidas abiertas. Pendiente de la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Aditivo, sigue en `v: 1`: `cs:position` gana `status?`, para que el shell avise del turno en el título de la pestaña solo en una partida activa. Pendiente de la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Aditivo, sigue en `v: 1`: `GET /voice-metrics/summary` (`voiceSummaryResponseSchema`, `VOICE_SUMMARY_LIMIT`), el resumen de la telemetría de voz. Pendiente de la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Aditivo, sigue en `v: 1`: el evento del navegador `cs:review`, para repasar una partida terminada jugada a jugada. Pendiente de la aprobación del responsable del repo. |
| v1 | 20 de noviembre de 2026 | Incremento del reloj. Aditivo, sigue en `v: 1`: `CLOCK_INCREMENTS` e `incrementSeconds` (opcional, solo con `clockMinutes`) en `POST /games`, e `incrementMs` (opcional) en `clockSchema` y en `openGameSchema`. El cliente nuevo manda un campo que el servidor viejo rechaza (`.strict()`), así que el servidor se despliega antes o a la vez. Pendiente de la aprobación del responsable del repo. |
