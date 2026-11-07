# ChessSpeak

[![CI](https://github.com/TWC-FINE/ChesssPeak/actions/workflows/ci.yml/badge.svg)](https://github.com/TWC-FINE/ChesssPeak/actions/workflows/ci.yml)

Ajedrez en línea donde las jugadas **se dicen en voz alta** en notación algebraica (en español), en lugar de moverlas con el mouse. El sistema reconoce la frase, la resuelve contra las jugadas legales de la posición, pide confirmación y la aplica en la partida en tiempo real.

Proyecto final de Arquitectura de Software.

> **Estado (5 de noviembre de 2026):** Todavía **no se puede jugar**. Existen el parser de voz, el agente local con su pool de Whisper, el esqueleto del servidor (`/health` y las dos bases), el shell con 3 microfrontends de marcador de posición y el CI. Faltan la partida en tiempo real, la voz en la interfaz y el despliegue (ver [PLAN.md](PLAN.md)). Para ponerte al día, empieza por [docs/CONTEXT.md](docs/CONTEXT.md).

**Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).** El proyecto se presenta en una **demo en vivo**, en Edge, con la web en local (`pnpm serve:web`) y el backend en la nube.

## Cómo funciona

1. Mantienes pulsado el botón y dices, por ejemplo, “caballo efe tres”.
2. El reconocedor devuelve un texto: **Web Speech API por defecto, con un retardo de 400 ms tras soltar el botón**, o **Whisper local** (alternativa y módulo local).
3. `voice-parser` lo compara con las jugadas legales y propone una (o marca ambigüedad).
4. **Confirmas siempre** (flecha en el tablero, “sí”/“no”/“cancelar”) y la jugada se envía al servidor por Socket.IO. La confirmación es obligatoria.
5. El servidor valida la jugada y la retransmite al rival. **El servidor no sabe nada de voz.**

## Piezas del sistema

| Pieza | Qué es |
|---|---|
| `web/` | Shell estático + 3 microfrontends (`<mf-game>`, `<mf-voice-input>`, `<mf-history>`); URL pública en Vercel, o en local con `pnpm serve:web` o Live Server. Hoy son marcadores de posición |
| `server/` | NestJS (monolito modular): auth, partidas, métricas de voz, health. Hoy funcionan `/health` y las dos bases |
| `packages/voice-parser/` | Parser de frases habladas a jugadas, TypeScript puro |
| `local-agent/` | Módulo local en `127.0.0.1:8765`: pool de `whisper-server` (whisper.cpp) con cola, salud, dashboard y prueba de carga ([ADR 10](docs/adr/0010-balanceo-de-carga-en-local-agent.md)) |
| `spike/` | Código de medición: Web Speech, Whisper y la prueba de viabilidad del análisis |
| `shared/` | Contrato compartido: eventos del socket, eventos `cs:*`, schemas zod. El contrato v1 está en revisión (PR #3) |

Detalle en [ARCHITECTURE.md](ARCHITECTURE.md).

## Requisitos

- Node.js 24 y pnpm 12
- Edge o Chrome (Web Speech API; el reconocedor por defecto se midió en Edge, Chrome está pendiente de comprobar)
- Para servir la web en local: `pnpm serve:web` (no necesita VS Code) o VS Code con la extensión Live Server (puerto fijo `5500`)
- Cuentas gratuitas para la nube: Neon (Postgres), MongoDB Atlas (M0), Render y Vercel ([docs/deploy.md](docs/deploy.md))
- Para Whisper local (alternativa al reconocedor por defecto): binario de whisper.cpp para Windows y el modelo `small` con el prompt de ajedrez, **fuera del repo** (rutas en `.env`); un script lo instalará en un solo comando. Desde una web pública el navegador puede bloquear la llamada al agente local (acceso a red local).

## Puesta en marcha

**Hoy (existe):**
```bash
pnpm install
pnpm verify                 # typecheck y tests de todos los paquetes
pnpm build:web              # compila la web a web/dist
pnpm serve:web              # la sirve en http://127.0.0.1:5500
pnpm --filter @chessspeak/local-agent start   # agente local; necesita Whisper (pnpm --filter @chessspeak/spike-whisper-local download)
```

**Objetivo (se habilita por fases; verifica que exista antes de usarlo):**
```bash
cp .env.example .env        # rellena tus propios secretos; nunca los subas
pnpm --filter server start:dev   # API en local
pnpm build:web                   # compila los microfrontends a web/dist
pnpm serve:web                   # sirve web/dist en http://127.0.0.1:5500 (servidor estático de Node)
```

Cada microfrontend tiene además su página standalone con contexto simulado, para trabajar en uno sin levantar los demás.

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
- `pnpm test:integration` solo se ejecuta contra `localhost` o `127.0.0.1` y contra bases cuyo nombre termina en `_test` (`DATABASE_URL_TEST` y `MONGO_URI_TEST`); en cualquier otro caso se niega. `pnpm verify` no necesita Docker.
- `GET /health` responde siempre 200: `status` vale `degraded` si una base está caída.

## Documentación

| Archivo | Para qué |
|---|---|
| [docs/CONTEXT.md](docs/CONTEXT.md) | Una página para ponerse al día |
| [SPEC.md](SPEC.md) | Qué construimos y cuándo algo está “terminado” |
| [PLAN.md](PLAN.md) | Estado, calendario, reparto y riesgos |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Componentes, datos, comunicación y decisiones |
| [docs/deploy.md](docs/deploy.md) | Despliegue en Render, Neon, Atlas y Vercel, paso a paso |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Ramas, commits y pull requests |
| [AGENTS.md](AGENTS.md) | Reglas para asistentes de IA |
| `docs/adr/` | Decisiones de arquitectura (media página cada una; el 4 y el 5 están aceptados) |
| `docs/spike-*.md` | Criterios, resultados, decisión y notas del spike de voz |
| `docs/quality.md` | Escenarios de calidad con cifras medidas |

## Licencia

GPL-3.0 (por la dependencia de chessground).
