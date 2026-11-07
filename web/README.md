# Web: guía para seguir trabajando

Estado actual: dos invitados juegan una partida, por escrito o por voz, y `<mf-history>` muestra las jugadas. **La voz solo se ha probado con un reconocedor y un agente falsos:** falta probarla con voz real y con el Whisper real.

## Cómo ejecutarla

```powershell
docker compose up -d
pnpm --filter @chessspeak/server build
pnpm --filter @chessspeak/server start      # en otra terminal: API en http://127.0.0.1:3000
```

Copia `web/shell/.env.example` a `web/shell/.env` y pon en ella `PUBLIC_API_URL=http://127.0.0.1:3000`. No dejes solo esa línea: sin `PUBLIC_AGENT_URL` no aparece el selector de reconocedor. Después:

```powershell
pnpm build:web
pnpm serve:web                               # http://127.0.0.1:5500
```

Para ser dos jugadores, abre dos pestañas: cada una tiene su propia sesión.

## Cómo probarla

| Comando | Qué comprueba |
|---|---|
| `pnpm verify` | Tipos y tests unitarios |
| `pnpm smoke:web` | Los microfrontends cargan, sin servidor |
| `pnpm e2e:web` | Partidas completas de dos invitados en Edge o Chrome, con capturas: por escrito, por voz con un `SpeechRecognition` falso, y con Whisper mediante un agente y un micrófono falsos. Demuestra el flujo, no el reconocimiento. Necesita las bases de Docker y usa solo las de `_test`. Define `E2E_OUT` para elegir dónde dejar las capturas. Deja `web/dist` apuntando a un puerto temporal: ejecuta `pnpm build:web` después |

## Dónde está cada cosa

| Archivo | Responsabilidad |
|---|---|
| `shell/src/main.ts` | Une todo: sesión, socket único y contexto de cada microfrontend |
| `shell/src/session.ts` · `api.ts` | Sesión de la pestaña · `POST /auth/guest` y `POST /games` |
| `shell/src/connection.ts` | El único socket de la página y sus reconexiones |
| `shell/src/session-bar.ts` | Formulario de entrada, crear partida y enlace para invitar |
| `mf-game/src/mf-game.ts` | Tablero. Es el único microfrontend con socket, y solo muestra lo que dice el servidor |
| `mf-game/src/replay.ts` | FEN de cada jugada: `game:state` no los trae y `cs:move-applied` los necesita |
| `mf-voice-input/src/mf-voice-input.ts` | Voz o caja de texto → parser → candidata → confirmación, y selector de reconocedor |
| `mf-voice-input/src/recognizers/` | `SpeechRecognizer` (ADR 5) y sus adaptadores: Web Speech, Whisper y falso |
| `mf-voice-input/src/attempt.ts` | La telemetría de cada frase, sin audio |
| `mf-history/src/mf-history.ts` | Jugadas numeradas en SAN, sin repetir por `ply` |
| `shell/src/telemetry.ts` | Reenvía `cs:voice-attempt` como `voice:attempt`, y lo descarta sin conexión |

## Reglas que conviene no romper

- **Confirmación obligatoria con texto y con voz (RF8):** una jugada se propone con `cs:move-candidate` y solo se envía tras `cs:move-confirmed`.
  - **Texto:** escribir, ver la flecha, confirmar.
  - **Voz:** hablar, ver la flecha, confirmar.
- **Mínimo privilegio:** solo `<mf-game>` recibe el socket. Los demás hablan con eventos `cs:*`.
- **Importa `shared/` en el shell solo como tipos.** Un valor en tiempo de ejecución arrastra todo `zod`: `shell.js` pasó de 48 KB a 502 KB.
- **El socket llega en el contexto solo cuando está conectado.** Cada objeto de contexto nuevo hace que `<mf-game>` pida el estado, y así se recupera una reconexión.
- **Los textos de error salen de `code`,** no de `game:error.message`. Los códigos provisionales de `docs/protocol.md` §7 aún hay que revisarlos.

## Qué falta

- Probar la voz con un micrófono real, en Web Speech y en Whisper.
- Permitir a quien está en `#/game/demo` volver a inicio con un aviso más claro: con sesión, esa partida de ejemplo responde «No se encontró la partida».
