# ChessSpeak — contexto para ponerse al día

Una página. Estado a **14 de noviembre de 2026**. El detalle está en [PLAN.md](../PLAN.md).

## Qué es
Ajedrez en línea donde las jugadas **se dicen en voz alta** en español (“caballo efe tres”). El sistema reconoce la frase, la resuelve contra las jugadas legales de la posición, pide **confirmación explícita** y la aplica en tiempo real entre dos jugadores. Proyecto final de Arquitectura de Software. **Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).** **Con demo en vivo**, en Edge, con la web en local (`pnpm serve:web`) y el backend en la nube.

## Requisitos del profesor
Desplegado en la nube (Render, Neon, Atlas; la web en Vercel con su URL `vercel.app` es el mínimo garantizado) · **módulo local** (el agente Whisper en localhost cuenta; confirmado) · **sockets** (Socket.IO) · **micrófono** (Web Speech con la nube de Google es aceptable; confirmado) · **2 bases de datos** (Postgres + Mongo) · todo en GitHub · **microfrontends** (3 custom elements) · **balanceo de carga** sobre un proceso crítico (Whisper como servicio, balanceado por URLs, [ADR 12](adr/0012-whisper-como-servicio-con-pool-por-urls.md); cumplimiento sin confirmar, porque todo lo medido corre en un solo equipo). Lo que sigue abierto, sin confirmación del profesor, son **supuestos**, en [proximos-pasos.md](proximos-pasos.md). El dominio propio está en espera del profesor.

## Enfoque: la voz
Se genera la forma hablada de **cada jugada legal** y se elige la más parecida a lo reconocido (umbral, margen, ambigüedad). Nunca propone una jugada ilegal. Un `SpeechRecognizer` intercambiable (Strategy) permite Web Speech, Whisper local, caja de texto y uno falso para tests. El servidor **no sabe de voz**: solo valida jugadas en UCI.

## Decisiones del spike (cerrado el 2 nov; ADR [4](adr/0004-resolucion-contra-jugadas-legales.md) y [5](adr/0005-strategy-y-reconocedor-por-defecto.md))
- **Por defecto: Web Speech en Edge con un retardo de 400 ms tras soltar el botón** (requisito del producto). **Alternativa: Whisper local, modelo `small` con prompt de ajedrez.** **Confirmación explícita obligatoria.** N-best no se adopta.

| Medición (78 frases de jugada) | Acierto | Err. aceptada | Ambig. | Latencia p50 / p95 | Cumple |
|---|---|---|---|---|---|
| Web Speech, sin retardo (A) | 56,4 % | 1,3 % | 10,3 % | 0,18 / 0,25 s | no |
| Web Speech, 400 ms (B) | **87,2 %** (IC95 78–93) | 0 % | 0 % | 0,57 / 0,62 s | sí |
| Whisper `small` + prompt | 89,7 % | 0 % | 7,7 % | 2,91 / 3,06 s | no (latencia) |

Las cifras son de la versión del parser de la etiqueta `spike-parser-freeze`; el lote de mejoras del parser queda **fuera del plan**, y la validación usa frases nuevas y registra el hash del parser. **Salvedades:** una voz y una corrida B; el límite inferior del IC95 de B (78 %) queda por debajo del 85 %; no se puede atribuir la mejora solo al retardo (fallos no truncados con ruido: 20 en A, 6 en B; posible efecto de práctica); todo en **Edge 156**, **Chrome no se midió**; la latencia de Whisper es solo inferencia, en un i5-12400F (6 núcleos/12 hilos; en otros equipos será distinta); y hay sesgo de selección entre las 4 configuraciones de Whisper.

## Arquitectura en 5 líneas
1. **Shell** estático (TypeScript vanilla) abre el único socket y monta 3 microfrontends (`<mf-game>`, `<mf-voice-input>`, `<mf-history>`, Lit en light DOM), servidos en el puerto 5500 con `pnpm serve:web` o Live Server.
2. Los microfrontends se hablan con eventos `cs:*` y reciben su contexto por propiedad; los tipos y el protocolo viven en `shared/`.
3. **Servidor NestJS** (monolito modular, una instancia en Render): `auth` de invitados, `games`, `voice-metrics`, `health`; estado de partida en memoria (`GameRoom` pura).
4. **Datos:** Postgres (`games`) y Mongo (`game_moves`, `voice_attempts`; nunca audio), con escritura diferida e idempotente.
5. **`local-agent`** (Node) atiende en `http://127.0.0.1:8765` y reparte la transcripción entre varios `whisper-server`: procesos propios (ADR 10) o URLs de servicios ya en marcha, como contenedores (ADR 12). El navegador lo llama con CORS y la cabecera de red privada. `voice-parser` es TypeScript puro sin DOM.

## Estado
- **Desplegado desde el 8 de noviembre** en Render, Neon, Atlas y Vercel (<https://chessspeak.vercel.app>). Dos invitados juegan una partida en tiempo real, por escrito o por voz, en local y en la URL pública.
- **Probado a mano con voz real, con una sola voz:** Web Speech el 7 y el 8 de noviembre, y Whisper local desde el navegador el 8, en la web local y en la pública. **Pendiente:** la validación con otra voz.
- **Balanceo ([ADR 12](adr/0012-whisper-como-servicio-con-pool-por-urls.md)):** medido con 3 contenedores locales el 14 de noviembre; aislar un worker no perdió ninguna petición en 3 de 3 repeticiones. **AWS EC2: medido con una instancia el 14 de noviembre y recortado,** porque C1 no cumple: el p95 de la peor repetición fue de 13,59 s, y el umbral es 7,5 s ([evidencia](evidence/whisper-cloud-ec2/README.md)). El pool de `move-workers` (ADR 11) no se construyó y ese ADR quedó sustituido.
- **Sin probar:** Chrome, el dominio propio y el límite por IP desde otra red.

Detalle en [HANDOFF.md](HANDOFF.md).

## Estructura del repo (lo que existe hoy)
- `packages/voice-parser/` — parser y corpus v0 (`corpus/`), métricas (`scripts/`). **Congelado** para el `test` v0.
- `spike/web-speech/` — arnés de Web Speech; `spike/whisper-local/` — benchmark y agente HTTP de Whisper; `spike/results/` — JSON de las mediciones; `spike/recordings/` — WAV (fuera de git).
- `local-agent/` — pool de `whisper-server` con cola, salud, dashboard (`/lb/dashboard`) y generador de carga: por procesos ([ADR 10](adr/0010-balanceo-de-carga-en-local-agent.md)) o por URLs, con aislar y devolver ([ADR 12](adr/0012-whisper-como-servicio-con-pool-por-urls.md)).
- `whisper-cloud/` — imagen de `whisper-server` y `compose.local.yml` para los 3 contenedores locales; `aws/` con lo usado para medir en EC2 (recortado).
- `server/` — NestJS: `/health` y `/health/live`, auth de invitados, `POST /games`, gateway Socket.IO sobre `GameRoom`, guardado en Postgres y Mongo, y telemetría de voz (`voice-metrics`). Del pool de `move-workers` (sustituido) solo queda el puerto, con `MOVE_WORKERS=0`.
- `web/` — shell con sesión y socket único, y 3 microfrontends: tablero, voz con caja de texto de respaldo (Web Speech y Whisper) e historial; `pnpm build:web`, `serve:web`, `smoke:web` y `e2e:web`.
- `shared/` — contrato v1, ya en `main`.
- `spike/analysis-gate/` — prueba de viabilidad del análisis con Stockfish: **no pasó** ([analysis-gate.md](analysis-gate.md)).
- `docs/` — `spike-*.md`, `adr/`, `deploy.md`, `protocol.md`, `HANDOFF.md`, este archivo. Raíz: `PLAN.md`, `SPEC.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`.
- Ignorados por git: `.env`, `whisper/`, `models/`, `stockfish/`, `spike/recordings/`, `local-agent/results/`. Repo en GitHub: `TWC-FINE/ChesssPeak` (la carpeta local anidada se deja por ahora).

## Cómo correr el arnés del spike
Abre en VS Code la carpeta interna del repo (la que tiene `.git`), no la exterior: así se aplica `.vscode/settings.json` (Live Server en 5500 e `ignoreFiles`).
```bash
pnpm install
pnpm test && pnpm typecheck
pnpm spike:build       # genera spike/web-speech/dist/bundle.js
# Live Server sobre spike/web-speech/index.html → http://127.0.0.1:5500/spike/web-speech/index.html (Edge o Chrome, con micrófono)
pnpm metrics <json...>                                              # métricas de un conjunto de resultados
pnpm --filter @chessspeak/spike-web-speech check-results <json...>  # revisa que sean de una sola corrida
pnpm --filter @chessspeak/spike-whisper-local download              # descarga whisper.cpp y los modelos (a .env)
pnpm --filter @chessspeak/spike-whisper-local benchmark             # Whisper sobre spike/recordings
```
Los resultados de una corrida se pasan siempre por separado de los de otra, y sin `--write-results` salvo para la corrida A.

## Dónde está cada cosa
| Documento | Para qué |
|---|---|
| [PLAN.md](../PLAN.md) | Estado, orden de trabajo y riesgos |
| [SPEC.md](../SPEC.md) · [ARCHITECTURE.md](../ARCHITECTURE.md) | Qué es “terminado” · componentes y datos |
| [spike-criteria.md](spike-criteria.md) | Umbrales y reglas, fijados antes de medir (no cambian) |
| [spike-results.md](spike-results.md) · [spike-run-b.md](spike-run-b.md) | Resultados y decisión · corrida B, Whisper y reglas de lectura |
| [spike-chrome.md](spike-chrome.md) | Comprobación declarada en Chrome (pendiente de medir) |
| [protocol.md](protocol.md) · [contract-versioning.md](contract-versioning.md) | Contrato v1 (socket, REST, eventos cs:*, contextos) · cómo se versiona |
| [spike-notes.md](spike-notes.md) | Notas, equipo de referencia y **tareas pendientes por área** |
| [deploy.md](deploy.md) | Despliegue en Render, Neon, Atlas y Vercel, paso a paso |
| [load-balancing.md](load-balancing.md) · [analysis-gate.md](analysis-gate.md) | Prueba de carga de Whisper · prueba del análisis con Stockfish |
| [url-pool-criteria.md](url-pool-criteria.md) · [whisper-cloud-criteria.md](whisper-cloud-criteria.md) | Criterios y medición del pool por URLs · criterios del experimento en la nube (EC2 medido y recortado) |
| [demo-script.md](demo-script.md) | Guion de la demo de unos 10 minutos, con plan de respaldo |
| [c4.md](c4.md) | C4 niveles 1 y 2 (contexto y contenedores), en Mermaid |
| [adr/](adr/) | ADR 1 a 8, 10 y 12 aceptados; el 11, sustituido por el 12; falta el ADR 9 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) · [AGENTS.md](../AGENTS.md) | Ramas, commits, PR · reglas para asistentes de IA |

## CI (GitHub Actions)

`.github/workflows/ci.yml` corre en cada pull request y en cada push a `main`. Trabajos:

- **verify**: `pnpm install --frozen-lockfile`, `pnpm verify` (typecheck + pruebas) y `pnpm build:web`.
- **integration**: pruebas de integración contra `postgres:17` y `mongo:8` (bases `chessspeak_test`). En CI, que se omitan las pruebas es un fallo (`scripts/integration.mjs` sale con 1 si existe `CI`).
- **secrets**: gitleaks 8.30.1 (binario con checksum verificado) sobre todo el historial.
- **smoke**: `pnpm smoke:web` con el Chrome del runner. No bloqueante (`continue-on-error`).

Para reproducirlo en local: `pnpm install --frozen-lockfile && pnpm verify && pnpm build:web`; para integración, `pnpm env:init`, `docker compose up -d` y `pnpm test:integration`; para el smoke, `pnpm smoke:web` (con `CHROME_PATH` si hace falta).

## Qué sigue
Orden de trabajo y recortes en [PLAN.md](../PLAN.md), sección 9. **Tareas, supuestos, dominio y balanceo: [proximos-pasos.md](proximos-pasos.md).**
1. ✅ **Hecho:** la cadena de PR, el despliegue, la voz de punta a punta, el adaptador de Whisper local, el balanceo del ADR 12 con contenedores locales y el [C4](c4.md), niveles 1 y 2.
2. **Validación** con otra voz (sin otra voz, con la del responsable del repo, declarado) y `docs/quality.md` con las cifras medidas.
3. **Documentos:** el ADR 9.
4. **Cierre:** README probado en una máquina limpia, ensayo con el [guion](demo-script.md), video de respaldo y tag.
5. **Recortado:** el experimento con una instancia EC2, medido el 14 de noviembre (C1 no cumple).
- Tareas del spike por área (agente local, producto, CI y entrega): [spike-notes.md](spike-notes.md), sección 7.
