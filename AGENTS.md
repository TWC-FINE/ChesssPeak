# AGENTS.md — instrucciones para asistentes de IA

Léelo completo antes de tocar código. Si algo contradice a [PLAN.md](PLAN.md), manda PLAN.md; el alcance lo define [SPEC.md](SPEC.md) y la estructura [ARCHITECTURE.md](ARCHITECTURE.md). Para ponerte al día en una página: [docs/CONTEXT.md](docs/CONTEXT.md).

## Proyecto
**ChessSpeak**: ajedrez web donde las jugadas se dicen en voz alta en español (notación algebraica). Proyecto final de Arquitectura de Software, equipo de 2 personas, entrega supuesta el 27 de noviembre de 2026.

Nombre correcto: **ChessSpeak**. Repo `chessspeak` en GitHub (`TWC-FINE/chessspeak`), paquetes `@chessspeak/*`. La carpeta local anidada `ChesssPeak/ChesssPeak` se deja por ahora. “ChessPeak” y “ChesssPeak” son errores; no los propagues.

**No hay demo en vivo:** el proyecto se presenta terminado, en el equipo de cualquiera de los dos o del profesor, con Edge o Chrome. Que se pueda instalar y abrir en una máquina limpia siguiendo solo el README es un entregable.

## Estado actual
El **spike de voz está cerrado** (2 de noviembre de 2026; ADR 4 y 5 aceptados en `docs/adr/`). Ya hay código: `packages/voice-parser/` y `spike/` (arnés de Web Speech y benchmark/agente de Whisper), con su `package.json` y `pnpm-workspace.yaml`. Todo lo demás (`shared/`, `server/`, `web/`, `local-agent/`) está **por hacer**: no supongas que existen scripts, carpetas o dependencias; compruébalo antes. No escribas código si no te lo piden.

Decisiones del spike que no se reabren sin motivo (detalle en [docs/spike-results.md](docs/spike-results.md)):
- Reconocedor por defecto: **Web Speech con un retardo de 400 ms tras soltar el botón**. Whisper local (modelo `small`, siempre con el prompt de ajedrez) es la alternativa seleccionable y el módulo local, con su latencia declarada.
- **La confirmación explícita es obligatoria.** No hay autoconfirmación ni N-best.
- El parser de `packages/voice-parser/` está **congelado** en la versión de la etiqueta `spike-parser-freeze`: las cifras del spike son de esa versión. Solo se modifica en un lote antes de la validación de la semana 4, registrando la versión (hash), y re-midiendo con frases nuevas. No cambies el parser, el corpus ni `docs/spike-criteria.md` fuera de ese lote.

## Stack
- Monorepo con **pnpm workspaces**, TypeScript estricto en todo.
- Backend: **NestJS** (monolito modular), Socket.IO, Prisma + **Postgres** (Neon), `@nestjs/mongoose` + **MongoDB** (Atlas M0), zod.
- Frontend: shell TS vanilla + 3 microfrontends como **custom elements con Lit** (light DOM, un proyecto **Vite** cada uno). Tablero: chessground en `viewOnly`.
- Ajedrez: **chessops** (reglas, jugadas legales, UCI).
- Voz: Web Speech API (por defecto), Whisper local vía `whisper-server` (whisper.cpp).
- Tests: **Jest** en `server`; **Vitest** en `shared`, `voice-parser` y `web`.

## Estructura (objetivo; existe `packages/voice-parser/`, `spike/` y `docs/`)
```
shared/                 contrato: eventos del socket (zod), eventos cs:*, tipos de contexto
packages/voice-parser/  TS puro, sin DOM (existe)
server/                 NestJS: auth, games, voice-metrics, health
web/shell/              index.html, router por hash, sesión, único socket
web/mf-game/            <mf-game>
web/mf-voice-input/     <mf-voice-input>
web/mf-history/         <mf-history>
web/dist/               salida de build:web (solo se commitea en la entrega)
local-agent/            Node + TS, envuelve whisper-server en 127.0.0.1:8765
spike/                  arnés de Web Speech y benchmark de Whisper (existe)
docs/adr/               ADRs de media página (el 4 y el 5 existen)
docs/quality.md         escenarios de calidad con cifras medidas
```

## Comandos
Existen hoy:
```bash
pnpm install                   # puede salir con ERR_PNPM_IGNORED_BUILDS (esbuild); ver docs/spike-notes.md
pnpm test                      # Vitest en voice-parser y spike
pnpm typecheck
pnpm spike:build               # arnés del spike
pnpm metrics <resultados.json...>
```
Planificados (verifica que existan antes de usarlos):
```bash
pnpm build:web                 # compila web/* a web/dist
pnpm serve:web                 # servidor estático de Node, sin dependencias, en 127.0.0.1:5500
pnpm --filter server test      # Jest
pnpm lint
```
Web en el puerto **5500** (fijo; Live Server o `pnpm serve:web`). `local-agent` en `127.0.0.1:8765`.

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
- No commitear secretos, `.env`, binarios de whisper.cpp ni modelos. Rutas y claves van en `.env` (con `.env.example` en el repo). Tampoco los WAV de `spike/recordings/`.
- No tocar `packages/voice-parser/`, su corpus, `docs/spike-criteria.md` ni los resultados del spike (`spike/results/`, `docs/spike-results.md`, `docs/spike-run-b.md`) salvo en el lote declarado de la semana 4.
- No hacer push directo a `main`, ni `git push --force`, ni reescribir historia.
- No commitear `web/dist` (solo en el commit de entrega).
- No añadir fast-check ni pipelines de percentiles en Mongo (p50/p95 se calculan en Node).
- No añadir dependencias sin motivo; si lo haces, dilo en el PR.
- No inventar cifras de rendimiento o precisión: salen de las mediciones (`docs/spike-results.md`, `docs/quality.md`). Las del spike son de la versión `spike-parser-freeze`.
- No introducir autoconfirmación ni N-best, ni quitar la confirmación explícita ni el retardo de 400 ms de Web Speech.
- No modificar `shared/` sin avisar: es el contrato entre A y B y exige aprobación de los dos.
- No renombrar, borrar ni rehacer lo que no te pidieron.

## Cómo trabajar
- Antes de editar, lee los archivos relevantes. Haz el cambio mínimo que cumple lo pedido.
- Ejecuta lint y tests relevantes antes de dar algo por terminado; si algo falla o no corriste algo, dilo.
- Si una tarea contradice el plan o el alcance, pregunta en vez de decidir sola.
