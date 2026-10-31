# ChessSpeak

Ajedrez en línea donde las jugadas **se dicen en voz alta** en notación algebraica (en español), en lugar de moverlas con el mouse. El sistema reconoce la frase, la resuelve contra las jugadas legales de la posición, pide confirmación y la aplica en la partida en tiempo real.

Proyecto final de Arquitectura de Software (equipo de 2 personas).

> **Estado:** en fase de planificación. Todavía no hay código; los comandos de abajo describen el objetivo y se irán habilitando por fases (ver [PLAN.md](PLAN.md)).

## Cómo funciona

1. Mantienes pulsado el botón y dices, por ejemplo, “caballo efe tres”.
2. El reconocedor (Web Speech API o Whisper local) devuelve un texto.
3. `voice-parser` lo compara con las jugadas legales y propone una (o marca ambigüedad).
4. Confirmas (flecha en el tablero, “sí”/“no”/“cancelar”) y la jugada se envía al servidor por Socket.IO.
5. El servidor valida la jugada y la retransmite al rival. **El servidor no sabe nada de voz.**

## Piezas del sistema

| Pieza | Qué es |
|---|---|
| `web/` | Shell estático + 3 microfrontends (`<mf-game>`, `<mf-voice-input>`, `<mf-history>`) servidos con Live Server |
| `server/` | NestJS (monolito modular): auth, partidas, métricas de voz, health |
| `packages/voice-parser/` | Parser de frases habladas a jugadas, TypeScript puro |
| `local-agent/` | Módulo local: envuelve `whisper-server` (whisper.cpp) en `127.0.0.1:8765` |
| `shared/` | Contrato compartido: eventos del socket, eventos `cs:*`, schemas zod |

Detalle en [ARCHITECTURE.md](ARCHITECTURE.md).

## Requisitos

- Node.js LTS y pnpm
- Chrome o Edge (Web Speech API)
- VS Code con la extensión Live Server (puerto fijo `5500`)
- Cuentas gratuitas para la nube: Neon (Postgres), MongoDB Atlas (M0), Render
- Para Whisper local (opcional en desarrollo): binario de whisper.cpp para Windows y los modelos `base`/`small`, **fuera del repo** (rutas en `.env`)

## Puesta en marcha (objetivo; se habilita por fases)

```bash
pnpm install
cp .env.example .env        # rellena tus propios secretos; nunca los subas
pnpm --filter server start:dev   # API en local
pnpm build:web                   # compila los microfrontends a web/dist
# abre web/dist/index.html con Live Server en el puerto 5500
```

Cada microfrontend tiene además su página standalone con contexto simulado, para trabajar en uno sin levantar los demás.

## Documentación

| Archivo | Para qué |
|---|---|
| [SPEC.md](SPEC.md) | Qué construimos y cuándo algo está “terminado” |
| [PLAN.md](PLAN.md) | Calendario, fases, reparto y riesgos |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Componentes, datos, comunicación y decisiones |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Ramas, commits y pull requests |
| [AGENTS.md](AGENTS.md) | Reglas para asistentes de IA |
| `docs/adr/` | Decisiones de arquitectura (media página cada una) |
| `docs/quality.md` | Escenarios de calidad con cifras medidas |

## Licencia

GPL-3.0 (por la dependencia de chessground).
