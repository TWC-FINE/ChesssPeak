# ChessSpeak — Arquitectura

Mapa del sistema: componentes, responsabilidades, comunicación y datos. No es una arquitectura de microservicios: es un **monolito modular** en el backend y **microfrontends** en el cliente (requisito del curso). Las decisiones se justifican en `docs/adr/`.

## 1. Vista general

```
 Navegador (Edge/Chrome; `pnpm serve:web` o Live Server :5500; opcionalmente, Vercel)
 ┌──────────────────────────────────────────────────────┐
 │ shell (TS vanilla): router, sesión, ÚNICO socket     │
 │  ├─ <mf-game>        tablero + jugadas (recibe socket)│
 │  ├─ <mf-voice-input> pulsar para hablar + confirmar  │
 │  └─ <mf-history>     lista de jugadas, (Precisión)   │
 └───────┬──────────────────────────────┬───────────────┘
         │ HTTP + Socket.IO             │ HTTP (CORS + PNA)
         ▼                              ▼
 ┌─────────────────────┐        ┌──────────────────────────┐
 │ server (NestJS)     │        │ local-agent (Node)       │
 │ Render, 1 instancia │        │ 127.0.0.1:8765           │
 │ auth·games·         │        │ └─ whisper-server        │
 │ voice-metrics·health│        │    (whisper.cpp, local)  │
 └───┬──────────┬──────┘        └──────────────────────────┘
     ▼          ▼
 Postgres     MongoDB
 (Neon)       (Atlas M0)
```

El reconocimiento de voz ocurre en el navegador (Web Speech) o en la máquina de quien usa la aplicación (Whisper). El servidor solo recibe jugadas en UCI y telemetría.

**Estado (5 de noviembre):** existen `packages/voice-parser/`, `spike/`, `local-agent/`, el esqueleto de `server/` y `web/` con marcadores de posición. Faltan Socket.IO, `GameRoom`, la autenticación y la voz en la interfaz; el contrato de `shared/` está en revisión.

## 2. Componentes

| Componente | Responsabilidad | No hace |
|---|---|---|
| `shared/` | Contrato: eventos del socket (zod), eventos `cs:*`, tipos de contexto | Lógica de negocio |
| `packages/voice-parser/` | Normaliza texto y lo resuelve contra jugadas legales (chessops) → `move`/`ambiguous`/`nomatch`/`command` | DOM, red, Nest |
| `server/` | Identidad, partidas, validación de jugadas, persistencia, métricas | Nada de voz |
| `web/shell/` | Router por hash, sesión, abre el único socket, monta los microfrontends | Lógica de partida |
| `web/mf-game/` | Tablero (chessground, `viewOnly`), estado de la partida, envía `game:move` | Reconocimiento |
| `web/mf-voice-input/` | Botón de hablar, adaptadores de reconocimiento, confirmación | Acceso al socket |
| `web/mf-history/` | Lista de jugadas; pestaña Precisión (opcional) | Acceso al socket |
| `local-agent/` | Servicio HTTP que transcribe un WAV con un pool de whisper-server (1 worker por defecto, ADR 10); umbral de volumen y duración; dashboard | Reglas de ajedrez |

### 2.1 Backend (monolito modular NestJS)
Módulos: `auth` (invitados; login opcional), `games`, `voice-metrics`, `health`. `analysis` opcional; sin `signaling`.

- **`GameRoom`:** clase pura, sin Nest. Es la fuente de verdad en memoria de una partida; se actualiza **de forma síncrona antes de cualquier `await`**.
- **Persistencia write-behind:** cada jugada se guarda en Mongo de forma idempotente con `updateOne({gameId, plyCount: ply-1}, {$push, $inc: {plyCount: 1}})`.
- **Rehidratación:** al reconectar se reconstruye la sala desde Mongo.
- **Una sola instancia** en Render; no hace falta sticky session.

### 2.2 Microfrontends
- Custom elements con Lit en light DOM, un proyecto Vite por microfrontend, salida única `web/dist/`.
- Cada uno tiene una página standalone con contexto simulado.
- Contexto por propiedad (`el.context`). **Mínimo privilegio:** solo `<mf-game>` recibe el socket; la telemetría de voz la reenvía el shell.
- Comunicación entre microfrontends con `CustomEvent` tipados, prefijo `cs:`, definidos en `shared/`.
- Sin Shadow DOM: CSS plano con prefijo por microfrontend y tokens compartidos.

## 3. Flujo de una jugada por voz

```
mf-voice-input: botón pulsado → SpeechRecognizer.recognize()
   → (Web Speech: 400 ms de espera tras soltar, antes de stop())
   → texto + alternativas
   → voice-parser.resolve(texto, FEN)   → move | ambiguous | nomatch | command
   → mostrar flecha y pedir confirmación (obligatoria)
   → cs:voice-move-confirmed   ──►  shell  ──►  mf-game
   → game:move (UCI) por socket ──►  server valida y actualiza GameRoom
   → game:state a ambos jugadores ◄── server
   → telemetría (voice_attempts) vía shell ──► server (jugador lo pone el servidor)
```

## 4. Reconocimiento de voz (patrón Strategy)

Interfaz `SpeechRecognizer` con adaptadores intercambiables:

| Adaptador | Dónde corre | Uso |
|---|---|---|
| Web Speech API | Navegador (nube del navegador) | Por defecto, con retardo de 400 ms tras soltar (ADR 5) |
| Whisper local | `local-agent` en `127.0.0.1:8765` | Alternativa seleccionable y módulo local obligatorio |
| Fake | Tests | Determinista |
| Caja de texto | Navegador | Respaldo |

**Resolución:** se genera la forma hablada de cada jugada legal y se elige la más parecida a lo reconocido, con umbral, margen y detección de ambigüedad. Idioma: `es-CO`. La confirmación del jugador es obligatoria con cualquier adaptador.

**Whisper:** umbral mínimo de volumen y duración antes de transcribir. Modelo `small` con el prompt de ajedrez (sin prompt el acierto baja de 89,7 % a 61,5 %); latencia declarada: p50 2,91 s y p95 3,06 s solo de inferencia. El binario y el modelo viven fuera del repo (rutas en `.env`) y un script los instala en un solo comando. El navegador llama al agente con CORS y cabecera de acceso a red privada; desde una web pública puede bloquearse por el acceso a red local.

**Parser:** las cifras del spike son de la versión `spike-parser-freeze`. Solo se modifica en un lote antes de la validación del 17 de noviembre, registrando el hash usado.

## 5. Datos

**Postgres (Neon, Prisma)**: `games` (con CHECK sobre la identidad de cada jugador: invitado o usuario); `users` mínimo solo si se hace el login.

**Mongo (Atlas M0, @nestjs/mongoose)**:
- `game_moves`: jugadas con `plyCount` para idempotencia.
- `voice_attempts`: un documento por intento, **sin audio**.

| Campo de `voice_attempts` | Contenido |
|---|---|
| `gameId`, `ply`, `fen` | Partida, media jugada y posición |
| `player` | Lo pone el servidor, nunca el cliente |
| `lang`, `recognizer` | Idioma y adaptador usado |
| `alternatives`, `transcript`, `normalized` | N-best, texto elegido y texto normalizado |
| `candidates` | Top 3 de candidatas con puntuación |
| `resolvedUci`, `expectedUci` | Resuelta; esperada (**solo en sesiones de evaluación**) |
| `outcome`, `accepted`, `tryIndex` | Resultado, si se confirmó y número de intento |
| `latency` | `{ recognitionMs, resolveMs, totalMs }` |
| `session`, `createdAt` | Sesión (separa evaluación de partidas normales) y fecha |

Los percentiles p50/p95 se calculan en Node, no con agregaciones de Mongo.

## 6. Comunicación y contrato
- **HTTP (REST):** `/auth/guest` (y `/auth/login` si se hace), `/health`.
- **Socket.IO:** eventos de partida validados con zod en `shared/`. Un solo socket por cliente, abierto por el shell.
- **Contrato v0 de `shared/`:** borrador mínimo y versionado (`v: 1`) en un PR abierto el jue 5 de noviembre; lo firman A y B el lun 9. Cambios posteriores solo por PR revisado por los dos.
- **CORS** (HTTP y Socket.IO): `http://127.0.0.1:5500`, `http://localhost:5500` y el dominio de Vercel.

## 7. Seguridad
- Identidad siempre decidida por el servidor; invitados con token firmado (sin fila en `users`). Login con JWT propio + bcrypt es opcional.
- `@nestjs/throttler` en `/auth/guest` y `/auth/login` (`trust proxy` en Render).
- Atlas abierto a `0.0.0.0/0`, mitigado con usuario de mínimos privilegios y contraseña fuerte.
- Secretos solo en `.env` (con `.env.example` en el repo); gitleaks en CI.

## 8. Reglas de dependencia (dependency-cruiser, Fase 3, solo si hay tiempo)
1. Los `web/mf-*` no se importan entre sí (solo `shared`).
2. `voice-parser` no importa DOM, Nest ni `web`.
3. `GameRoom` no importa `@nestjs/*`.

## 9. Despliegue
| Parte | Dónde |
|---|---|
| Backend | Render (una instancia; despertarla antes de evaluar) |
| Postgres / Mongo | Neon / Atlas M0 |
| Web | En local, `pnpm serve:web` (servidor estático de Node, `127.0.0.1:5500`; lo usa la demo) o Live Server sobre `web/dist`; opcionalmente, Vercel (URL pública) |
| `local-agent` | En la máquina de quien usa Whisper |

## 10. Decisiones (ADRs)
Media página cada una, escritas cuando se toma la decisión: monolito modular; microfrontends con custom elements; dos bases de datos; resolución contra jugadas legales; `SpeechRecognizer` como Strategy; `local-agent` por HTTP (alternativa: WebSocket saliente); estado en memoria + write-behind; invitados con token firmado; GPL-3.0. Calendario en [PLAN.md](PLAN.md).
