# AGENTS.md — instrucciones para asistentes de IA

Léelo completo antes de tocar código. Si algo contradice a [PLAN.md](PLAN.md), manda PLAN.md; el alcance lo define [SPEC.md](SPEC.md) y la estructura [ARCHITECTURE.md](ARCHITECTURE.md).

## Proyecto
**ChessSpeak**: ajedrez web donde las jugadas se dicen en voz alta en español (notación algebraica). Proyecto final de Arquitectura de Software, equipo de 2 personas, entrega supuesta el 27 de noviembre de 2026.

Nombre correcto: **ChessSpeak**. Carpeta `ChessSpeak/`, repo `chessspeak`, paquetes `@chessspeak/*`. “ChessPeak” y “ChesssPeak” son errores; no los propagues.

## Estado actual
Fase de planificación: todavía no hay código ni `package.json`. No supongas que existen scripts, carpetas o dependencias; compruébalo antes. No escribas código si no te lo piden.

## Stack
- Monorepo con **pnpm workspaces**, TypeScript estricto en todo.
- Backend: **NestJS** (monolito modular), Socket.IO, Prisma + **Postgres** (Neon), `@nestjs/mongoose` + **MongoDB** (Atlas M0), zod.
- Frontend: shell TS vanilla + 3 microfrontends como **custom elements con Lit** (light DOM, un proyecto **Vite** cada uno). Tablero: chessground en `viewOnly`.
- Ajedrez: **chessops** (reglas, jugadas legales, UCI).
- Voz: Web Speech API (por defecto), Whisper local vía `whisper-server` (whisper.cpp).
- Tests: **Jest** en `server`; **Vitest** en `shared`, `voice-parser` y `web`.

## Estructura (objetivo)
```
shared/                 contrato: eventos del socket (zod), eventos cs:*, tipos de contexto
packages/voice-parser/  TS puro, sin DOM
server/                 NestJS: auth, games, voice-metrics, health
web/shell/              index.html, router por hash, sesión, único socket
web/mf-game/            <mf-game>
web/mf-voice-input/     <mf-voice-input>
web/mf-history/         <mf-history>
web/dist/               salida de build:web (solo se commitea en la entrega)
local-agent/            Node + TS, envuelve whisper-server en 127.0.0.1:8765
docs/adr/               ADRs de media página
docs/quality.md         escenarios de calidad con cifras medidas
```

## Comandos (planificados; verifica que existan antes de usarlos)
```bash
pnpm install
pnpm build:web                 # compila web/* a web/dist
pnpm --filter server test      # Jest
pnpm --filter @chessspeak/voice-parser test   # Vitest
pnpm lint
```
Web con Live Server en el puerto **5500** (fijo). `local-agent` en `127.0.0.1:8765`.

## Convenciones
- Código, comentarios, ramas y commits en **inglés** (Conventional Commits); interfaz y `*.md` en **español**.
- Escribe código que se parezca al del entorno: misma densidad de comentarios, mismos nombres, mismos idiomas. Sin comentarios que repitan el código.
- Valida toda entrada externa con los schemas zod de `shared/`.
- CSS plano con prefijo por microfrontend; **sin Shadow DOM**.
- Detalle del flujo de trabajo en [CONTRIBUTING.md](CONTRIBUTING.md).

## Reglas de arquitectura (no las rompas)
1. **El servidor no sabe de voz.** Solo recibe jugadas en UCI y valida. La telemetría de voz se guarda aparte.
2. **Resolver contra jugadas legales:** el parser elige entre las jugadas legales de la posición (chessops); nunca acepta algo fuera de ellas. Resultado: `move | ambiguous | nomatch | command`.
3. `GameRoom` es una clase **pura** (sin Nest); su estado se actualiza **de forma síncrona antes de cualquier `await`**.
4. Persistencia por jugada idempotente: `updateOne({gameId, plyCount: ply-1}, {$push, $inc: {plyCount: 1}})`.
5. **Un único socket**, abierto por el shell. Solo `<mf-game>` lo recibe (mínimo privilegio). La telemetría de voz la reenvía el shell.
6. Los microfrontends **no se importan entre sí**; se comunican con `CustomEvent` tipados `cs:*` definidos en `shared/`. Contexto por propiedad (`el.context`).
7. `voice-parser` es TS puro: sin DOM, sin Nest, sin red.
8. La identidad de un jugador la decide **siempre el servidor**; el campo `player` de `voice_attempts` nunca viene del cliente.
9. Reconocedores detrás de la interfaz `SpeechRecognizer` (Strategy). Añadir uno nuevo no toca el parser ni el servidor.

## Lo que NO debes hacer
- No introducir Module Federation, Shadow DOM, microservicios, Redis ni sticky sessions.
- No guardar **audio** en ninguna parte.
- No commitear secretos, `.env`, binarios de whisper.cpp ni modelos. Rutas y claves van en `.env` (con `.env.example` en el repo).
- No hacer push directo a `main`, ni `git push --force`, ni reescribir historia.
- No commitear `web/dist` (solo en el commit de entrega).
- No añadir fast-check ni pipelines de percentiles en Mongo (p50/p95 se calculan en Node).
- No añadir dependencias sin motivo; si lo haces, dilo en el PR.
- No inventar cifras de rendimiento o precisión: salen de las mediciones (`docs/quality.md`).
- No modificar `shared/` sin avisar: es el contrato entre A y B y exige aprobación de los dos.
- No renombrar, borrar ni rehacer lo que no te pidieron.

## Cómo trabajar
- Antes de editar, lee los archivos relevantes. Haz el cambio mínimo que cumple lo pedido.
- Ejecuta lint y tests relevantes antes de dar algo por terminado; si algo falla o no corriste algo, dilo.
- Si una tarea contradice el plan o el alcance, pregunta en vez de decidir sola.
