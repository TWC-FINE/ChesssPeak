# Protocolo (contrato v1)

Fuente de verdad: los esquemas zod de `shared/src/` (`protocol/`, `browser-events.ts`, `contexts.ts`). Este documento los explica; si discrepan, mandan los esquemas. Reglas de cambio: [contract-versioning.md](contract-versioning.md).

**Estado:** contrato v1, ya en `main`; lo aprueba el responsable del repo.

## 1. Conexión e identidad

- **La identidad la decide siempre el servidor**, a partir del token. Ningún mensaje del cliente lleva `color`, `userId`, `player` ni nada parecido: los esquemas del cliente son estrictos y los rechazan.
- **Handshake del socket:** `io(url, { auth: { token, v: 1 } })`. El servidor rechaza la conexión (error de conexión de Socket.IO) si el token no es válido o si `v` no es una versión soportada.
- El servidor añade a la telemetría `player` y `createdAt`; el cliente no los envía.

## 2. REST

| Método y ruta | Auth | Petición (estricta) | Respuesta | Errores |
|---|---|---|---|---|
| `POST /auth/guest` | — | `{ displayName }` (1–24 caracteres, se recorta) | `{ token, identity }`; `identity = { kind: 'guest', guestId, displayName }`. El nombre solo va dentro de `identity` | 400 cuerpo inválido · 429 límite (`@nestjs/throttler`) |
| `POST /games` | `Authorization: Bearer <token>` | `{ color? }`, con `color` = `white` \| `black` \| `random` (si falta, `random`) | `{ gameId }` | 400 cuerpo inválido · 401 sin token o token inválido |

### Asientos y color

1. `POST /games` fija el **color de quien crea la partida** (`random` lo sortea el servidor en ese momento) y **le reserva ese asiento**. La partida nace en `waiting`.
2. `game:join` asigna el asiento así, en este orden:
   1. si la identidad ya tiene asiento en esa partida, recupera el mismo (reconexión);
   2. si es quien creó la partida, ocupa su asiento reservado;
   3. si no, **ocupa el primer asiento libre** (blancas y luego negras), sin contar el asiento reservado para quien creó la partida;
   4. si no queda asiento, `game:error { code: 'unauthorized' }`. Los espectadores (`yourColor: 'spectator'`) están **reservados** y no existen en v1.
3. Con los dos asientos ocupados, la partida pasa a `active`.

## 3. Socket.IO

### Cliente → servidor (esquemas estrictos)

| Evento | Payload | Emite | Escucha | Errores posibles (`game:error`) |
|---|---|---|---|---|
| `game:join` | `{ gameId }` | `<mf-game>` | servidor | `not_found`, `unauthorized` |
| `game:move` | `{ gameId, uci, ply }`; `uci` cumple `^[a-h][1-8][a-h][1-8][qrbn]?$`; `ply` entero ≥ 1: la media jugada que se hace, que debe ser `plyCount + 1` | `<mf-game>`, tras `cs:move-confirmed` | servidor | `not_found`, `unauthorized`, `not_your_turn`, `stale_ply`, `illegal` |
| `game:resign` | `{ gameId }` | `<mf-game>` | servidor | `not_found`, `unauthorized` |
| `voice:attempt` | `VoiceAttempt` sin `player` ni `createdAt`: `gameId, ply, fen, lang, recognizer, alternatives[], transcript, normalized, candidates[≤3], resolvedUci, expectedUci?, outcome, accepted, tryIndex, latency, session` | shell (reenvía `cs:voice-attempt`) | servidor (`voice_attempts`) | se descarta si no valida; no responde |

### Servidor → cliente (esquemas tolerantes)

| Evento | Payload | Emite | Escucha | Cuándo |
|---|---|---|---|---|
| `game:state` | `{ gameId, fen, moves[{ ply, uci, san }], plyCount, status, turn, seats{ white, black }, yourColor }`; cada asiento es `{ displayName, connected }` o `null` | servidor | `<mf-game>` | tras `game:join` y al reconectar; `yourColor` es distinto para cada receptor |
| `game:moved` | `{ gameId, ply, uci, san, fen }` | servidor | `<mf-game>` (los dos jugadores) | tras una jugada válida |
| `game:end` | `{ gameId, result, termination }` | servidor | `<mf-game>` | fin de la partida |
| `game:error` | `{ code, message }` | servidor | `<mf-game>` | la petición se rechaza; el estado no cambia |

**Valores:**
- `status`: `waiting` \| `active` \| `finished` \| `aborted` (los mismos que `games` en Postgres).
- `result`: `1-0` \| `0-1` \| `1/2-1/2` \| `*` (`*` solo en `aborted`).
- `termination`: `checkmate`, `stalemate`, `insufficient_material`, `resignation`, `abandonment`, `aborted`; **reservados en v1**: `threefold_repetition`, `fifty_moves`.
- `game:error.code`:
  - `not_your_turn`: no te toca;
  - `illegal`: la jugada no es legal en la posición;
  - `stale_ply`: el `ply` no es el siguiente (posición desactualizada o envío repetido);
  - `unauthorized`: la identidad no tiene asiento o no puede hacer eso;
  - `not_found`: la partida no existe.

### `plyCount` y `ply`

- **`plyCount`** (en `game:state` y `cs:position`): cuántas media jugadas se han jugado ya. Vale **0** en la posición inicial.
- **`ply`** (en `game:move`, `game:moved`, `moves[]`, `cs:move-*`): el número de **una** media jugada concreta. La primera de las blancas es `ply: 1`.
- Una jugada nueva debe llevar `ply = plyCount + 1`; si no, el servidor responde `stale_ply`.

**Ejemplo.** Tras `1. e4 e5` hay `plyCount: 2` y le toca a las blancas. Para jugar `2. Nf3`:

```json
{ "gameId": "g1", "uci": "g1f3", "ply": 3 }
```

Tras aceptarla, `game:moved` trae `ply: 3` y el siguiente `game:state` o `cs:position` trae `plyCount: 3`.

## 4. Eventos del navegador (`cs:*`, todos con `v: 1`)

Se emiten desde el elemento con `CS_EVENT_INIT` (`bubbles` y `composed`) y se escuchan en `document`. **Mínimo privilegio:** solo `<mf-game>` tiene el socket; `<mf-voice-input>` y `<mf-history>` solo hablan por estos eventos.

| Evento | Payload | Emite | Escucha |
|---|---|---|---|
| `cs:mf-ready` | `{ v, name }` | cada microfrontend al registrarse | shell |
| `cs:position` | `{ v, gameId, fen, plyCount, turn, yourColor }`; `plyCount` = media jugadas jugadas hasta ahora (0 al inicio). **Solo el FEN**: sin listas de jugadas legales | `<mf-game>`, tras cada cambio | `<mf-voice-input>` |
| `cs:move-candidate` | `{ v, gameId, ply, uci, san, source }`; `source` = `voice` \| `text` | `<mf-voice-input>` | `<mf-game>` (dibuja la flecha) |
| `cs:move-confirmed` | `{ v, gameId, ply, uci, source }` | `<mf-voice-input>` (voz «sí» o botón) | `<mf-game>` (envía `game:move`) |
| `cs:move-cancelled` | `{ v, gameId, ply, reason }`; `reason` = `user` \| `position-changed` \| `game-ended` | `<mf-voice-input>` | `<mf-game>` (borra la flecha) |
| `cs:move-applied` | `{ v, gameId, ply, uci, san, fen }`. También una por cada jugada de `game:state` al (re)unirse: **quien escucha debe ser idempotente por `ply`** | `<mf-game>` | `<mf-history>`, `<mf-voice-input>` |
| `cs:voice-status` | `{ v, state, message? }`; `state` = `idle` \| `listening` \| `processing` \| `awaiting-confirmation` \| `unavailable` \| `error` | `<mf-voice-input>` | shell |
| `cs:voice-attempt` | `{ v, attempt }`, con `attempt` igual que `voice:attempt` | `<mf-voice-input>` | shell (lo reenvía como `voice:attempt`) |
| `cs:game-ended` | `{ v, gameId, result, termination }` | `<mf-game>` | `<mf-voice-input>`, `<mf-history>` |

## 5. Contextos (`el.context`, todos con `v: 1`)

| Microfrontend | Contexto |
|---|---|
| `<mf-game>` | `{ v, gameId, orientation, socket }`. `socket` cumple `GameSocket` (el `Socket` de socket.io-client) o es `null` |
| `<mf-voice-input>` | `{ v, gameId, lang, recognizer, releaseDelayMs?, agentUrl }`. Sin `releaseDelayMs` usa `DEFAULT_RELEASE_DELAY_MS = 400` de `shared` ([ADR 5](adr/0005-strategy-y-reconocedor-por-defecto.md)) |
| `<mf-history>` | `{ v, gameId }`. Las jugadas llegan por `cs:move-applied` |

## 6. Una jugada por voz, de punta a punta

```mermaid
sequenceDiagram
    autonumber
    actor J as Jugador
    participant MV as mf-voice-input
    participant R as Reconocedor (Web Speech / Whisper)
    participant P as voice-parser
    participant MG as mf-game
    participant MH as mf-history
    participant SH as shell
    participant S as Servidor
    participant RV as Rival (su mf-game)

    MG-->>MV: cs:position { fen, plyCount: 4, turn, yourColor }
    J->>MV: mantiene pulsado y dice «caballo efe tres»
    MV-->>SH: cs:voice-status { listening }
    J->>MV: suelta el botón
    Note over MV: espera 400 ms (DEFAULT_RELEASE_DELAY_MS) antes de stop()
    MV->>R: stop()
    R-->>MV: alternativas (texto)
    MV->>P: resolve(fen, alternativas)
    P-->>MV: move g1f3 (Nf3)
    MV-->>MG: cs:move-candidate { ply: 5, uci: g1f3, san: Nf3, source: voice }
    Note over MG: dibuja la flecha (confirmación obligatoria)
    MV-->>SH: cs:voice-status { awaiting-confirmation }
    J->>MV: «sí»
    MV-->>MG: cs:move-confirmed { ply: 5, uci: g1f3 }
    MG->>S: game:move { gameId, uci: g1f3, ply: 5 }
    Note over S: identidad por token · estado · ply · turno · legalidad
    alt jugada válida
        S-->>MG: game:moved { ply: 5, uci, san, fen }
        S-->>RV: game:moved { ply: 5, uci, san, fen }
        MG-->>MH: cs:move-applied { ply: 5, uci, san, fen }
        MG-->>MV: cs:position { fen, plyCount: 5, turn }
    else rechazada
        S-->>MG: game:error { code: not_your_turn | illegal | stale_ply | unauthorized | not_found }
        Note over MG: borra la flecha y muestra el error; la posición no cambia
    end
    MV-->>SH: cs:voice-attempt { attempt (accepted: true) }
    SH->>S: voice:attempt (sin player ni createdAt)
    Note over S: añade player y createdAt y lo guarda en voice_attempts
```

Si el jugador dice «no» o «cancelar», `<mf-voice-input>` emite `cs:move-cancelled { reason: user }` en lugar de `cs:move-confirmed`, y la telemetría sale con `accepted: false`.

## 7. Decisiones provisionales (pendientes de validar por el responsable del repo)

Respuestas provisionales a las dudas de revisión del contrato v1. Quedan **marcadas como provisionales** hasta que las valide el responsable del repo; si alguna cambia, es un cambio de contrato (ver [contract-versioning.md](contract-versioning.md)).

| Tema | Decisión provisional en v1 |
|---|---|
| Tablas, `game:leave`, acks | **No hay** en v1: ni ofrecer o aceptar tablas, ni salida explícita, ni acks de Socket.IO. Las respuestas van por `game:moved`, `game:state` y `game:error`. Se pueden añadir después como eventos nuevos (cambio aditivo) |
| `voice:attempt` | `fen` y `normalized` **se quedan** en el mensaje |
| `cs:position` | `turn` y `yourColor` **se quedan** |
| Asientos | La regla de la sección 2 (color reservado para quien crea la partida; el resto, primer asiento libre) es **correcta** |
| `game:error.message` | **Solo para depurar**. La interfaz decide el texto a partir de `code` y no muestra `message` |
| `abandonment` | **Propuesta:** un jugador que lleva **más de 60 s desconectado** pierde la partida por `abandonment`; el plazo es **configurable** en el servidor (`ABANDON_TIMEOUT_MS`). **Pendiente de que la valide el responsable del repo** |
| Payload inválido en el socket | `game:error { code: 'unauthorized' }`, también con un campo de más o una UCI mal formada. No se añade un código nuevo porque exigiría `v: 2`. **A revisar por el responsable del repo antes de que `mf-game` dependa de ellos.** |
| La partida no se puede cargar (una base caída) | `game:error { code: 'not_found' }`, con el detalle en `message` y en el log del servidor. El siguiente `game:join` lo vuelve a intentar. **A revisar por el responsable del repo antes de que `mf-game` dependa de ellos.** |
| Volver a una partida terminada | `game:state` no lleva el resultado, así que tras él llega `game:end` a quien entra |
| Orden de validación de `game:move` | Identidad, estado, **`ply` y después turno**, legalidad. Se comprueba `ply` antes del turno porque un envío repetido debe dar `stale_ply`: tras tu propia jugada ya no es tu turno, y al revés daría `not_your_turn`. **A revisar por el responsable del repo antes de que `mf-game` dependa de ellos.** |
| Jugar o rendirse fuera de una partida activa | `game:error { code: 'unauthorized' }`, en `waiting`, `finished` y `aborted`. No se añade un código nuevo porque un valor de enum no reservado exigiría `v: 2`. **A revisar por el responsable del repo antes de que `mf-game` dependa de ellos.** |
| Enroque en UCI | Solo el estándar (`e1g1`, `e1c1`). `e1h1`, la forma interna de chessops, responde `illegal`. **A revisar por el responsable del repo antes de que `mf-game` dependa de ellos.** |
