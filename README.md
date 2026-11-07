# ChessSpeak

[![CI](https://github.com/TWC-FINE/ChesssPeak/actions/workflows/ci.yml/badge.svg)](https://github.com/TWC-FINE/ChesssPeak/actions/workflows/ci.yml)

Ajedrez en línea donde las jugadas **se dicen en voz alta** en notación algebraica (en español), en lugar de moverlas con el mouse. El sistema reconoce la frase, la resuelve contra las jugadas legales de la posición, pide confirmación y la aplica en la partida en tiempo real.

Proyecto final de Arquitectura de Software.

> **Estado (7 de noviembre de 2026):** En local, dos invitados juegan una partida en tiempo real, por escrito o por voz. Con Web Speech en Edge se jugó a mano una partida completa por voz, sin fallos, **con una sola voz**, así que eso no sustituye la validación con otra persona. **Falta probar el Whisper real y desplegar** (ver [Qué está probado y qué no](#qué-está-probado-y-qué-no)). Para ponerte al día, empieza por [docs/CONTEXT.md](docs/CONTEXT.md).

**Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).** Está previsto presentarlo en una **demo en vivo**, en Edge, con la web en local (`pnpm serve:web`) y el backend en la nube.

## Cómo funciona

1. Mantienes pulsado el botón y dices, por ejemplo, “caballo efe tres”.
2. El reconocedor devuelve un texto: **Web Speech API por defecto, con un retardo de 400 ms tras soltar el botón**, o **Whisper local** (alternativa y módulo local).
3. `voice-parser` lo compara con las jugadas legales y propone una (o marca ambigüedad).
4. **Confirmas siempre** (flecha en el tablero, “sí”/“no”/“cancelar”) y la jugada se envía al servidor por Socket.IO. La confirmación es obligatoria.
5. El servidor valida la jugada y la retransmite al rival. **El servidor no sabe nada de voz.**

## Piezas del sistema

| Pieza | Qué es |
|---|---|
| `web/` | Shell estático + 3 microfrontends (`<mf-game>`, `<mf-voice-input>`, `<mf-history>`); en local con `pnpm serve:web` o Live Server, y prevista en Vercel |
| `server/` | NestJS (monolito modular): auth, partidas, métricas de voz, health |
| `packages/voice-parser/` | Parser de frases habladas a jugadas, TypeScript puro |
| `local-agent/` | Módulo local en `127.0.0.1:8765`: pool de `whisper-server` (whisper.cpp) con cola, salud, dashboard y prueba de carga ([ADR 10](docs/adr/0010-balanceo-de-carga-en-local-agent.md)) |
| `spike/` | Código de medición: Web Speech, Whisper y la prueba de viabilidad del análisis |
| `shared/` | Contrato compartido: eventos del socket, eventos `cs:*`, schemas zod |

Detalle en [ARCHITECTURE.md](ARCHITECTURE.md).

## Requisitos

- Node.js 24 y pnpm 12
- Edge o Chrome (Web Speech API; el reconocedor por defecto se midió en Edge, Chrome está pendiente de comprobar)
- Para servir la web en local: `pnpm serve:web` (no necesita VS Code) o VS Code con la extensión Live Server (puerto fijo `5500`)
- Cuentas gratuitas para la nube: Neon (Postgres), MongoDB Atlas (M0), Render y Vercel ([docs/deploy.md](docs/deploy.md))
- Para Whisper local (alternativa al reconocedor por defecto): binario de whisper.cpp para Windows y el modelo `small` con el prompt de ajedrez, **fuera del repo** (rutas en `.env`). Desde una web pública el navegador puede bloquear la llamada al agente local (acceso a red local).

## Puesta en marcha

**En local, con dos pestañas de Edge.** Comprobado en el equipo de desarrollo; **aún sin probar en una máquina limpia.**

```bash
pnpm install
pnpm env:init                # crea .env con contraseñas aleatorias (no sobrescribe uno existente)
docker compose up -d         # postgres:17 y mongo:8
pnpm --filter @chessspeak/server prisma:migrate
pnpm --filter @chessspeak/server build
pnpm --filter @chessspeak/server start      # API en http://127.0.0.1:3000; déjalo en marcha
```

En otra terminal, copia `web/shell/.env.example` a `web/shell/.env`, pon en ella `PUBLIC_API_URL=http://127.0.0.1:3000`, y después:

```bash
pnpm build:web               # compila la web a web/dist
pnpm serve:web               # la sirve en http://127.0.0.1:5500
```

Abre esa dirección, entra con un nombre y crea una partida. El otro jugador entra con el enlace de invitación, en otra pestaña.

**Whisper local (opcional):**

```bash
pnpm --filter @chessspeak/spike-whisper-local download   # binario y modelos, fuera del repo
pnpm --filter @chessspeak/local-agent start              # agente en http://127.0.0.1:8765
```

Después elígelo en el selector de reconocedor de la web. **Este camino aún no se ha probado con el Whisper real ni con voz real.**

**Pruebas:** `pnpm verify` no necesita Docker. `pnpm smoke:web` comprueba que los microfrontends cargan. `pnpm e2e:web` juega partidas completas en Edge o Chrome, con un reconocedor y un agente falsos: demuestra el flujo, no el reconocimiento.

Cada microfrontend tiene además su página standalone con contexto simulado, para trabajar en uno sin levantar los demás.

**Despliegue:** los pasos están en [docs/deploy.md](docs/deploy.md). **Aún no se ha desplegado.**

### Bases de datos locales (Docker)

PostgreSQL y MongoDB para desarrollo, con Docker Desktop en marcha:

```bash
pnpm env:init                # crea .env desde .env.example con contraseñas aleatorias (no sobrescribe un .env existente)
docker compose up -d         # postgres:17 y mongo:8, con volúmenes con nombre
pnpm --filter @chessspeak/server prisma:migrate   # aplica las migraciones a la base de desarrollo
pnpm test:integration        # pruebas contra las bases locales (se omiten con un aviso si no están)
```

- **Postgres usa el puerto 55432** del equipo (no el 5432), para no chocar con un Postgres ya instalado como servicio de Windows, que no hace falta parar. Se cambia con `PG_PORT` en `.env`; MongoDB usa el 27017 (`MONGO_PORT`).
- Los puertos se publican solo en `127.0.0.1`. Las credenciales salen de `.env`, que está en `.gitignore`: nunca se suben.
- En el `.env` local del equipo de desarrollo, Postgres usa el puerto **15432**, porque Windows reservó un rango de puertos que incluye el 55432 y Docker no pudo publicarlo (7 de noviembre).
- `pnpm test:integration` solo se ejecuta contra `localhost` o `127.0.0.1` y contra bases cuyo nombre termina en `_test` (`DATABASE_URL_TEST` y `MONGO_URI_TEST`); en cualquier otro caso se niega. `pnpm verify` no necesita Docker.
- `GET /health` responde siempre 200: `status` vale `degraded` si una base está caída. Cada base tiene un límite de `HEALTH_PROBE_TIMEOUT_MS` (1 s por defecto).
- `GET /health/live` responde sin consultar las bases: es la ruta para el sondeo de la plataforma.
- La telemetría de voz (`voice:attempt`) se guarda en `voice_attempts`, sin audio, con los límites `VOICE_ATTEMPT_MAX_BYTES` y `VOICE_ATTEMPT_LIMIT_PER_MINUTE` por conexión. Nunca interrumpe la partida ([docs/protocol.md](docs/protocol.md)).

## Qué está probado y qué no

| Parte | Estado |
|---|---|
| Partida entre dos invitados, reconexión y fin de partida | Probado en local, con pruebas de integración y `pnpm e2e:web` |
| Flujo de voz, confirmación, telemetría e historial | Probado con un reconocedor falso |
| Web Speech con voz real en el producto | **Prueba manual el 7 de noviembre,** en Edge: una partida completa, sin fallos, con una sola voz (la del responsable del repo). No sustituye la validación con otra persona. Las cifras del spike son de un arnés de medición y de una sola voz: no son cifras del producto |
| Whisper real desde el navegador | **Sin probar;** solo con un agente falso |
| Render, Neon, Atlas y Vercel | **Sin desplegar** |
| README en una máquina limpia | **Sin probar** |
| Chrome | **Sin medir** |

## Privacidad

- **Nunca se guarda audio.** En `voice_attempts` se guarda el texto reconocido, con los datos del intento.
- **Web Speech envía el audio a la nube del navegador.**
- **Whisper local no saca el audio de tu equipo.**

## Documentación

| Archivo | Para qué |
|---|---|
| [docs/CONTEXT.md](docs/CONTEXT.md) | Una página para ponerse al día |
| [SPEC.md](SPEC.md) | Qué construimos y cuándo algo está “terminado” |
| [PLAN.md](PLAN.md) | Estado, orden de trabajo y riesgos |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Componentes, datos, comunicación y decisiones |
| [docs/deploy.md](docs/deploy.md) | Despliegue en Render, Neon, Atlas y Vercel, paso a paso |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Ramas, commits y pull requests |
| [AGENTS.md](AGENTS.md) | Reglas para asistentes de IA |
| `docs/adr/` | Decisiones de arquitectura, de media página cada una |
| `docs/spike-*.md` | Criterios, resultados, decisión y notas del spike de voz |
| `docs/quality.md` | Escenarios de calidad con cifras medidas. **Aún no existe:** sale de la validación |

## Licencia

GPL-3.0 (por la dependencia de chessground).
