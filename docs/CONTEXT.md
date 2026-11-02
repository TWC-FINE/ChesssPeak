# ChessSpeak — contexto para ponerse al día

Una página. Estado a **2 de noviembre de 2026**. El detalle está en [PLAN.md](../PLAN.md).

## Qué es
Ajedrez en línea donde las jugadas **se dicen en voz alta** en español (“caballo efe tres”). El sistema reconoce la frase, la resuelve contra las jugadas legales de la posición, pide **confirmación explícita** y la aplica en tiempo real entre dos jugadores. Proyecto final de Arquitectura de Software (2 personas). **No hay demo en vivo:** se presenta terminado, en el equipo de cualquiera de los dos o del profesor, con Edge o Chrome; por eso la instalación en una máquina limpia (solo con el README) es un entregable.

## Requisitos del profesor
Desplegado en la nube (Render, Neon, Atlas) · **módulo local** (el agente Whisper en localhost cuenta; confirmado) · **sockets** (Socket.IO) · **micrófono** (Web Speech con la nube de Google es aceptable; confirmado) · **2 bases de datos** (Postgres + Mongo) · todo en GitHub · **microfrontends** (3 custom elements). Pendiente con el profesor: fecha real de entrega y si debe abrirse con Live Server sin compilar (entonces `web/dist` va en el repo).

## Enfoque: la voz
Se genera la forma hablada de **cada jugada legal** y se elige la más parecida a lo reconocido (umbral, margen, ambigüedad). Nunca propone una jugada ilegal. Un `SpeechRecognizer` intercambiable (Strategy) permite Web Speech, Whisper local, caja de texto y uno falso para tests. El servidor **no sabe de voz**: solo valida jugadas en UCI.

## Decisiones del spike (cerrado el 2 nov; ADR [4](adr/0004-resolucion-contra-jugadas-legales.md) y [5](adr/0005-strategy-y-reconocedor-por-defecto.md))
- **Por defecto: Web Speech en Edge con un retardo de 400 ms tras soltar el botón** (requisito del producto). **Alternativa: Whisper local, modelo `small` con prompt de ajedrez.** **Confirmación explícita obligatoria.** N-best no se adopta.

| Medición (78 frases de jugada) | Acierto | Err. aceptada | Ambig. | Latencia p50 / p95 | Cumple |
|---|---|---|---|---|---|
| Web Speech, sin retardo (A) | 56,4 % | 1,3 % | 10,3 % | 0,18 / 0,25 s | no |
| Web Speech, 400 ms (B) | **87,2 %** (IC95 78–93) | 0 % | 0 % | 0,57 / 0,62 s | sí |
| Whisper `small` + prompt | 89,7 % | 0 % | 7,7 % | 2,91 / 3,06 s | no (latencia) |

**Salvedades:** una voz y una corrida B; el límite inferior del IC95 de B (78 %) queda por debajo del 85 %; no se puede atribuir la mejora solo al retardo (fallos no truncados con ruido: 20 en A, 6 en B; posible efecto de práctica); todo en **Edge 156**, **Chrome no se midió**; la latencia de Whisper es solo inferencia, en un i5-12400F (6 núcleos/12 hilos; en otros equipos será distinta); y hay sesgo de selección entre las 4 configuraciones de Whisper.

## Arquitectura en 5 líneas
1. **Shell** estático (TypeScript vanilla) abre el único socket y monta 3 microfrontends (`<mf-game>`, `<mf-voice-input>`, `<mf-history>`, Lit en light DOM), servidos con Live Server en el puerto 5500.
2. Los microfrontends se hablan con eventos `cs:*` y reciben su contexto por propiedad; los tipos y el protocolo viven en `shared/`.
3. **Servidor NestJS** (monolito modular, una instancia en Render): `auth` de invitados, `games`, `voice-metrics`, `health`; estado de partida en memoria (`GameRoom` pura).
4. **Datos:** Postgres (`games`) y Mongo (`game_moves`, `voice_attempts`; nunca audio), con escritura diferida e idempotente.
5. **`local-agent`** (Node) envuelve `whisper-server` en `http://127.0.0.1:8765`; el navegador lo llama con CORS y la cabecera de red privada. `voice-parser` es TypeScript puro sin DOM.

## Estructura del repo (lo que existe hoy)
- `packages/voice-parser/` — parser y corpus v0 (`corpus/`), métricas (`scripts/`). **Congelado** para el `test` v0.
- `spike/web-speech/` — arnés de Web Speech; `spike/whisper-local/` — benchmark y agente HTTP de Whisper; `spike/results/` — JSON de las mediciones; `spike/recordings/` — WAV (fuera de git).
- `docs/` — `spike-*.md`, `adr/`, este archivo. Raíz: `PLAN.md`, `SPEC.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`.
- Por crear: `shared/`, `server/`, `web/`, `local-agent/`. Ignorados por git: `.env`, `whisper/`, `models/`, `spike/recordings/`.

## Cómo correr el arnés del spike
Abre en VS Code la carpeta interna del repo (la que tiene `.git`), no la exterior: así se aplica `.vscode/settings.json` (Live Server en 5500 e `ignoreFiles`).
```bash
pnpm install           # puede salir con ERR_PNPM_IGNORED_BUILDS (esbuild): es inofensivo, ver spike-notes
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
| [PLAN.md](../PLAN.md) | Estado, calendario, reparto y riesgos |
| [SPEC.md](../SPEC.md) · [ARCHITECTURE.md](../ARCHITECTURE.md) | Qué es “terminado” · componentes y datos |
| [spike-criteria.md](spike-criteria.md) | Umbrales y reglas, fijados antes de medir (no cambian) |
| [spike-results.md](spike-results.md) · [spike-run-b.md](spike-run-b.md) | Resultados y decisión · corrida B, Whisper y reglas de lectura |
| [spike-chrome.md](spike-chrome.md) | Comprobación declarada en Chrome (pendiente de medir) |
| [spike-notes.md](spike-notes.md) | Notas, equipo de referencia y **tareas pendientes por área** |
| [adr/](adr/) | ADR 4 y 5 aceptados; los demás se escriben al decidir |
| [CONTRIBUTING.md](../CONTRIBUTING.md) · [AGENTS.md](../AGENTS.md) | Ramas, commits, PR · reglas para asistentes de IA |

## Qué sigue
- **Hasta el 9 de nov (una persona):** Fase 0 (monorepo, `shared/`, Nest + `health`, shell y 3 proyectos Vite, Neon/Atlas, Render, CI) y el inicio de la Fase 1. Medir Chrome ([spike-chrome.md](spike-chrome.md)).
- **Lun 9:** puesta al día, **firma del contrato v0 de `shared/`** y reparto: A servidor, B shell y microfrontends, juntos el `local-agent` y la integración de voz; corpus v1 (40 frases cada uno).
- **Semana 3:** voz de punta a punta (Web Speech con 400 ms, Whisper, confirmación). **Semana 4:** sesión de evaluación con otra voz, frases nuevas y otro equipo, prueba en máquina limpia, entrega el **vie 27 de nov** (por confirmar).
- Tareas del spike por área (agente local, producto, CI y entrega): [spike-notes.md](spike-notes.md), sección 7.
