# ChessSpeak

Ajedrez en línea donde las jugadas **se dicen en voz alta** en notación algebraica (en español), en lugar de moverlas con el mouse. El sistema reconoce la frase, la resuelve contra las jugadas legales de la posición, pide confirmación y la aplica en la partida en tiempo real.

Proyecto final de Arquitectura de Software (equipo de 2 personas).

> **Estado:** el spike de voz está **cerrado** (2 de noviembre de 2026; ADR 4 y 5 aceptados). Ya hay código en `packages/voice-parser` y `spike/` (arnés de Web Speech y Whisper local); el resto (`shared/`, `server/`, `web/`, `local-agent/`) está por hacer y se habilita por fases (ver [PLAN.md](PLAN.md)). Para ponerte al día, empieza por [docs/CONTEXT.md](docs/CONTEXT.md).

El proyecto **no se presenta en una demo en vivo**: se entrega terminado para que se abra en un equipo ajeno (el de cualquiera de los dos o el del profesor), con Edge o Chrome. Por eso las instrucciones de instalación de este README son un entregable.

## Cómo funciona

1. Mantienes pulsado el botón y dices, por ejemplo, “caballo efe tres”.
2. El reconocedor devuelve un texto: **Web Speech API por defecto, con un retardo de 400 ms tras soltar el botón**, o **Whisper local** (alternativa y módulo local).
3. `voice-parser` lo compara con las jugadas legales y propone una (o marca ambigüedad).
4. **Confirmas siempre** (flecha en el tablero, “sí”/“no”/“cancelar”) y la jugada se envía al servidor por Socket.IO. La confirmación es obligatoria.
5. El servidor valida la jugada y la retransmite al rival. **El servidor no sabe nada de voz.**

## Piezas del sistema

| Pieza | Qué es |
|---|---|
| `web/` | Shell estático + 3 microfrontends (`<mf-game>`, `<mf-voice-input>`, `<mf-history>`); URL pública en Vercel, o en local con `pnpm serve:web` o Live Server (por hacer) |
| `server/` | NestJS (monolito modular): auth, partidas, métricas de voz, health |
| `packages/voice-parser/` | Parser de frases habladas a jugadas, TypeScript puro (**existe**) |
| `local-agent/` | Módulo local: envuelve `whisper-server` (whisper.cpp) en `127.0.0.1:8765`; parte del prototipo de `spike/whisper-local` |
| `spike/` | Arnés de Web Speech y benchmark de Whisper del spike (**existe**) |
| `shared/` | Contrato compartido: eventos del socket, eventos `cs:*`, schemas zod |

Detalle en [ARCHITECTURE.md](ARCHITECTURE.md).

## Requisitos

- Node.js LTS y pnpm
- Edge o Chrome (Web Speech API; el reconocedor por defecto se midió en Edge, Chrome está pendiente de comprobar)
- Para servir la web en local: `pnpm serve:web` (no necesita VS Code) o VS Code con la extensión Live Server (puerto fijo `5500`)
- Cuentas gratuitas para la nube: Neon (Postgres), MongoDB Atlas (M0), Render
- Para Whisper local (alternativa al reconocedor por defecto): binario de whisper.cpp para Windows y el modelo `small` con el prompt de ajedrez, **fuera del repo** (rutas en `.env`); un script lo instalará en un solo comando. Desde una web pública el navegador puede bloquear la llamada al agente local (acceso a red local).

## Puesta en marcha

**Hoy (existe):**
```bash
pnpm install                # puede salir con ERR_PNPM_IGNORED_BUILDS (esbuild): ver docs/spike-notes.md
pnpm test && pnpm typecheck
pnpm spike:build            # arnés del spike; ver spike/README.md
```

**Objetivo (se habilita por fases; verifica que exista antes de usarlo):**
```bash
cp .env.example .env        # rellena tus propios secretos; nunca los subas
pnpm --filter server start:dev   # API en local
pnpm build:web                   # compila los microfrontends a web/dist
pnpm serve:web                   # sirve web/dist en http://127.0.0.1:5500 (servidor estático de Node)
```

Cada microfrontend tiene además su página standalone con contexto simulado, para trabajar en uno sin levantar los demás.

## Documentación

| Archivo | Para qué |
|---|---|
| [docs/CONTEXT.md](docs/CONTEXT.md) | Una página para ponerse al día |
| [SPEC.md](SPEC.md) | Qué construimos y cuándo algo está “terminado” |
| [PLAN.md](PLAN.md) | Estado, calendario, reparto y riesgos |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Componentes, datos, comunicación y decisiones |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Ramas, commits y pull requests |
| [AGENTS.md](AGENTS.md) | Reglas para asistentes de IA |
| `docs/adr/` | Decisiones de arquitectura (media página cada una; el 4 y el 5 están aceptados) |
| `docs/spike-*.md` | Criterios, resultados, decisión y notas del spike de voz |
| `docs/quality.md` | Escenarios de calidad con cifras medidas |

## Licencia

GPL-3.0 (por la dependencia de chessground).
