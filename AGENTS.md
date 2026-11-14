# AGENTS.md — instrucciones para asistentes de IA

Léelo completo antes de tocar código. Si algo contradice a [PLAN.md](PLAN.md), manda PLAN.md; el alcance lo define [SPEC.md](SPEC.md) y la estructura [ARCHITECTURE.md](ARCHITECTURE.md). Para ponerte al día en una página: [docs/CONTEXT.md](docs/CONTEXT.md).

## Proyecto
**ChessSpeak**: ajedrez web donde las jugadas se dicen en voz alta en español (notación algebraica). Proyecto final de Arquitectura de Software, en solitario: el responsable del repo es el único que aprueba. **Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).**

Nombre correcto: **ChessSpeak**, paquetes `@chessspeak/*`. “ChessPeak” y “ChesssPeak” son errores; no los propagues. **Única excepción:** el repositorio de GitHub se llama hoy `TWC-FINE/ChesssPeak`, y la carpeta local anidada `ChesssPeak/ChesssPeak` se deja por ahora.

**Hay demo en vivo,** en Edge, con la web en local (`pnpm serve:web`) y el backend en Render. Guion y calendario en [PLAN.md](PLAN.md), secciones 3 y 9. No añadas funcionalidades fuera del núcleo: los opcionales salieron del plan por la fecha.

## Estado actual
A 14 de noviembre de 2026, **el spike de voz está cerrado** (ADR 4 y 5) y en `main` existen:
- `packages/voice-parser/`, `spike/` y CI;
- `shared/` (contrato v1) y `server/`: `GameRoom`, invitados, `POST /games`, Socket.IO, guardado en Postgres y Mongo, y `voice_attempts`;
- `web/`: el shell y los 3 microfrontends reales, con Web Speech (400 ms), Whisper local y caja de texto;
- `local-agent/`: pool de Whisper por procesos (ADR 10) y por URLs (ADR 12);
- `whisper-cloud/`: los contenedores locales y lo preparado para AWS EC2.

**Desplegado** desde el 8 de noviembre en Render, Neon, Atlas y Vercel. **Probado a mano con voz real, con una sola voz:** Web Speech y Whisper local desde el navegador. **Hecho también:** el C4, niveles 1 y 2 ([docs/c4.md](docs/c4.md)). **Pendiente:** la validación con otra voz, `docs/quality.md`, el ADR 9 y el README probado en una máquina limpia. **AWS EC2 se midió el 14 de noviembre y se recortó:** C1 no cumple ([evidencia](docs/evidence/whisper-cloud-ec2/README.md)); no lo uses en la demo. El pool de `move-workers` (ADR 11) no existe y quedó sustituido por el ADR 12. No supongas que existen scripts, carpetas o dependencias; compruébalo antes. No escribas código si no te lo piden.

**Análisis con Stockfish:** se midió y la prueba **no pasó** ([docs/analysis-gate.md](docs/analysis-gate.md)). Sigue fuera de alcance salvo que se decida una versión nueva del criterio.

Decisiones del spike que no se reabren sin motivo (detalle en [docs/spike-results.md](docs/spike-results.md)):
- Reconocedor por defecto: **Web Speech con un retardo de 400 ms tras soltar el botón**. Whisper local (modelo `small`, siempre con el prompt de ajedrez) es la alternativa seleccionable y el módulo local, con su latencia declarada.
- **La confirmación explícita es obligatoria.** No hay autoconfirmación ni N-best.
- El parser de `packages/voice-parser/` está **congelado** en la versión de la etiqueta `spike-parser-freeze`: las cifras del spike son de esa versión. El lote de mejoras queda fuera del plan: no cambies el parser, el corpus ni `docs/spike-criteria.md`. La validación usa frases nuevas y registra el hash del parser.

## Stack
- Monorepo con **pnpm workspaces**, TypeScript estricto en todo.
- Backend: **NestJS** (monolito modular), Socket.IO, Prisma + **Postgres** (Neon), `@nestjs/mongoose` + **MongoDB** (Atlas M0), zod.
- Frontend: shell TS vanilla + 3 microfrontends como **custom elements con Lit** (light DOM, un proyecto **Vite** cada uno). Tablero: chessground en `viewOnly`.
- Ajedrez: **chessops** (reglas, jugadas legales, UCI).
- Voz: Web Speech API (por defecto), Whisper local vía `whisper-server` (whisper.cpp).
- Tests: **Jest** en `server`; **Vitest** en `shared`, `voice-parser` y `web`.

## Estructura
```
shared/                 contrato: eventos del socket (zod), eventos cs:*, tipos de contexto
packages/voice-parser/  TS puro, sin DOM
server/                 NestJS: auth, games, voice-metrics, health
web/shell/              index.html, router por hash, sesión, único socket
web/mf-game/            <mf-game>
web/mf-voice-input/     <mf-voice-input>
web/mf-history/         <mf-history>
web/dist/               salida de build:web (solo se commitea en la entrega)
local-agent/            Node + TS, pool de whisper-server en 127.0.0.1:8765
spike/                  código de medición: Web Speech, Whisper y viabilidad del análisis
docs/adr/               ADRs de media página
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
- No tocar `packages/voice-parser/`, su corpus, `docs/spike-criteria.md` ni los resultados del spike (`spike/results/`, `docs/spike-results.md`, `docs/spike-run-b.md`).
- No hacer push directo a `main`, ni `git push --force`, ni reescribir historia.
- No commitear `web/dist` (solo en el commit de entrega).
- No añadir fast-check ni pipelines de percentiles en Mongo (p50/p95 se calculan en Node).
- No añadir dependencias sin motivo; si lo haces, dilo en el PR.
- No inventar cifras de rendimiento o precisión: salen de las mediciones (`docs/spike-results.md`, `docs/quality.md`). Las del spike son de la versión `spike-parser-freeze`.
- No introducir autoconfirmación ni N-best, ni quitar la confirmación explícita ni el retardo de 400 ms de Web Speech.
- No modificar `shared/` sin avisar: es el contrato entre el servidor y la web. Cualquier cambio va en un PR, lo aprueba el responsable del repo y sube la versión.
- No renombrar, borrar ni rehacer lo que no te pidieron.

## Cómo trabajar
- Antes de editar, lee los archivos relevantes. Haz el cambio mínimo que cumple lo pedido.
- Ejecuta lint y tests relevantes antes de dar algo por terminado; si algo falla o no corriste algo, dilo.
- Si una tarea contradice el plan o el alcance, pregunta en vez de decidir sola.
