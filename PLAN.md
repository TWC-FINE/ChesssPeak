# ChessSpeak — Plan del proyecto

> Última actualización: lunes 2 de noviembre de 2026.
> Entrega supuesta: viernes 27 de noviembre de 2026 (**por confirmar**).
> Equipo: una persona sola hasta que se incorpore el compañero (hacia el **lun 9 de noviembre**). Desde entonces, dos personas con los roles A (servidor) y B (shell y microfrontends), que **se asignan el lun 9** según la comodidad de cada una con NestJS o con el front y Lit; el `local-agent` y la integración de voz, entre las dos. Hasta el 9, una sola persona cubre A y B.

## 1. Estado a 2 de noviembre de 2026
- **Spike cerrado el 2 de noviembre**, con los ADR 4 y 5 aceptados. Informe: [docs/spike-results.md](docs/spike-results.md) y [docs/spike-run-b.md](docs/spike-run-b.md).
- **Decisión:**
  - Reconocedor por defecto: **Web Speech en Edge, con un retardo de 400 ms entre soltar el botón y llamar a `stop()`** (requisito del producto).
  - **Whisper local, modelo `small` con prompt de ajedrez**, como alternativa seleccionable y módulo local, con su latencia declarada.
  - **Confirmación explícita obligatoria** con cualquier reconocedor.
- **Números clave** (split `test`, 78 frases de jugada): Web Speech sin retardo (A) 56,4 % de acierto; con retardo de 400 ms (B) **87,2 %** (IC95 78–93 %), 0 aceptaciones erróneas, 0 ambigüedad, latencia p50 0,57 s. Whisper `small` con prompt: 89,7 % pero p50 2,91 s y p95 3,06 s (solo inferencia, en un i5-12400F), por encima de los umbrales de latencia.
- **Las cifras pertenecen a la versión del parser de la etiqueta `spike-parser-freeze`.** Si el parser cambia, esas cifras ya no describen el producto (ver 5.7).
- **Salvedades:** una voz y una corrida B; no está demostrado que la mejora se deba solo al retardo; todo se midió en **Edge 156**. **Chrome no se midió** (hay una comprobación declarada en [docs/spike-chrome.md](docs/spike-chrome.md), pendiente). La validación con **otra voz, frases nuevas y otro equipo** se hace en la semana 4.
- **Código que existe:** `packages/voice-parser` y `spike/` (arnés de Web Speech y benchmark/agente de Whisper). Todo lo demás (`shared/`, `server/`, `web/`, `local-agent/`) está por hacer.
- Lo que el spike deja por hacer está en [docs/spike-notes.md](docs/spike-notes.md) (sección 7), agrupado por área: **agente local**, **producto** y **CI y entrega**.

## 2. Qué es
Proyecto final de Arquitectura de Software: web de ajedrez donde las jugadas se dicen en voz alta en notación algebraica (en español). El sistema reconoce la frase, la resuelve contra las jugadas legales, pide confirmación y la aplica en la partida en tiempo real.

Fuera del núcleo (“Futuro”): chat de voz entre jugadores (WebRTC/TURN/señalización), análisis con Stockfish, inglés.

## 3. Cómo se entrega
**No hay demo en vivo.** El proyecto se presenta **terminado**, en el equipo de cualquiera de los dos o en el del profesor, con **Edge o Chrome**. Quien evalúa abre la aplicación sin que nadie esté al lado, así que:

- **Una URL pública (Vercel) es la forma más portable de presentar:** no exige instalar nada para jugar con Web Speech o con la caja de texto. Por eso Vercel es **núcleo**, no opcional.
- **Whisper local desde una página pública puede bloquearse** por el acceso a red local del navegador (la página pública llama a `127.0.0.1`), y además **requiere instalar el agente**. Con Whisper hay que ensayar el permiso en Edge y en Chrome, o abrir la web en local.
- **Para equipos sin VS Code:** el script `pnpm serve:web` sirve `web/dist` en `127.0.0.1:5500` con un servidor estático de Node sin dependencias (Live Server sigue siendo válido).
- **La reproducibilidad en una máquina limpia es un entregable de la Fase 3:** clonar, instalar y abrir **siguiendo solo el README**. Esto incluye el `ERR_PNPM_IGNORED_BUILDS` de `pnpm install` (decidir los builds permitidos en `pnpm-workspace.yaml` y documentarlo) y un **script que instala Whisper en un solo comando** (binario, modelo `small`, rutas en `.env`).
- El README debe cubrir los fallos previsibles (Render dormido, sin micrófono, navegador sin Web Speech, sin Whisper) y cómo seguir con la **caja de texto**, que siempre funciona.
- La aplicación debe avisar si el navegador no tiene Web Speech (Firefox) y ofrecer Whisper local o la caja de texto.

## 4. Requisitos del profesor y cómo se cumplen
| Requisito | Cómo se cumple |
|---|---|
| Desplegado en la nube | Backend NestJS en Render, Postgres en Neon, Mongo en Atlas M0. **Web estática en Vercel (núcleo: URL pública)** |
| Módulo local | `local-agent` (Node + TS) en la máquina de quien evalúa; envuelve `whisper-server` (whisper.cpp) en `http://127.0.0.1:8765`. **El profesor confirmó que cuenta como módulo local** |
| Sockets | Socket.IO: partida en tiempo real (un único socket, abierto por el shell) |
| Cámara o micrófono | Micrófono: jugadas por voz (Web Speech API o Whisper local). **El profesor confirmó que es aceptable que Web Speech use la nube de Google** |
| Mínimo 2 bases de datos | Postgres (`games`, y `users` si se hace el login) + Mongo (`game_moves`, `voice_attempts`) |
| 100% en GitHub | Repo público `chessspeak`, GPL-3.0, ramas por feature con PR, CI |
| Microfrontends | 3 custom elements independientes (`<mf-game>`, `<mf-voice-input>`, `<mf-history>`) que conviven en un index servido como web estática |

## 5. Arquitectura

### 5.1 Monorepo (pnpm workspaces)
```
ChessSpeak/
  shared/                 @chessspeak/shared: protocolo del socket (zod), eventos cs:*, tipos de contexto
  packages/voice-parser/  @chessspeak/voice-parser: TS puro, sin DOM (existe, viene del spike)
  server/                 @chessspeak/server: NestJS, monolito modular
  web/shell/              index.html + TS vanilla (router por hash, sesión, único socket)
  web/mf-game/            proyecto Vite (Lit, light DOM)
  web/mf-voice-input/     proyecto Vite
  web/mf-history/         proyecto Vite
  web/dist/               salida única de `pnpm build:web` (se commitea solo en la entrega)
  local-agent/            @chessspeak/local-agent: Node + TS (parte de spike/whisper-local)
  scripts/                serve:web (servidor estático de Node, sin dependencias)
  spike/                  arnés del spike y benchmark de Whisper (existe)
  docs/adr/               ADRs de media página
  docs/quality.md         escenarios de atributos de calidad con cifras medidas
```

### 5.2 Backend (NestJS, monolito modular)
- Módulos: `auth` (invitados; login opcional), `games`, `voice-metrics`, `health`. `analysis` opcional; sin `signaling`.
- Estado de partida en memoria: clase `GameRoom` pura (sin Nest). Se actualiza de forma síncrona antes de cualquier `await`.
- Persistencia por jugada en Mongo (write-behind), idempotente: `updateOne({gameId, plyCount: ply-1}, {$push, $inc: {plyCount: 1}})`. Rehidratación desde Mongo al reconectar.
- El servidor valida la jugada (UCI) y **no sabe de voz**.
- Una sola instancia en Render (no hace falta sticky session).

### 5.3 Datos
**Postgres (Neon, Prisma)**
- `games`, con CHECK sobre la identidad de cada jugador (invitado o usuario).
- `users` mínimo solo si se hace el login (opcional).

**Mongo (Atlas M0, @nestjs/mongoose)**
- `game_moves`, con `plyCount`.
- `voice_attempts`: un documento por intento de reconocimiento. **No se guarda audio.**

| Campo | Contenido |
|---|---|
| `gameId` | Partida |
| `player` | Jugador; **lo pone el servidor**, nunca el cliente |
| `ply` | Número de media jugada |
| `fen` | Posición en la que se habló |
| `lang` | Código de idioma usado (`es-CO`) |
| `recognizer` | `webspeech` / `whisper` / `text` / `fake` |
| `alternatives` | N-best devuelto por el reconocedor |
| `transcript` | Texto elegido |
| `normalized` | Texto tras la normalización |
| `candidates` | Top 3 de jugadas candidatas con su puntuación |
| `resolvedUci` | Jugada resuelta (si la hay) |
| `expectedUci` | Jugada esperada; **solo en sesiones de evaluación** |
| `outcome` | `move` / `ambiguous` / `nomatch` / `command` |
| `accepted` | Si el jugador confirmó |
| `tryIndex` | Número de intento para la misma jugada |
| `latency` | `{ recognitionMs, resolveMs, totalMs }` |
| `session` | Identificador de sesión (separa partidas normales de sesiones de evaluación) |
| `createdAt` | Marca de tiempo |

Los percentiles (p50/p95) se calculan en Node, no con pipelines de agregación de Mongo.

### 5.4 Autenticación y seguridad
- Invitados con token firmado (sin fila en `users`); **con esto basta**. La identidad siempre la decide el servidor.
- Login/registro (JWT propio + bcrypt): **opcional**, al final, solo si hay tiempo.
- `@nestjs/throttler` en `/auth/guest` (y en `/auth/login` si se hace), con `trust proxy` en Render.
- Atlas con `0.0.0.0/0`, mitigado con un usuario de mínimos privilegios y contraseña fuerte.
- Secretos solo en `.env`, con `.env.example` en el repo; gitleaks en CI.
- CORS (HTTP y Socket.IO): `http://127.0.0.1:5500`, `http://localhost:5500` y el dominio de Vercel.

### 5.5 Microfrontends
- Cada microfrontend es un custom element (Lit en light DOM) en su propio proyecto Vite y tiene su página standalone con contexto simulado.
- Todos conviven en el index del shell, que se puede servir con Live Server, con `pnpm serve:web` (servidor estático de Node sin dependencias, `127.0.0.1:5500`) o como web estática pública en Vercel. No se exigen despliegues independientes; Module Federation descartado.
- Contexto por propiedad (`el.context`). Mínimo privilegio: solo `<mf-game>` recibe el socket; la telemetría de voz la reenvía el shell.
- Comunicación con CustomEvent tipados con prefijo `cs:`, definidos en `shared/`.
- Sin Shadow DOM: CSS plano con prefijo por microfrontend y tokens compartidos.
- La pestaña “Precisión” de `<mf-history>` (una tabla) es **opcional**.

### 5.6 Contrato v0 de `shared/`
- **Jueves 5 de noviembre:** un **borrador mínimo y versionado** (campo `v: 1`) en un **PR abierto**. Mínimo: lo imprescindible para que A y B trabajen por separado.
- **Lunes 9 de noviembre:** lo firman A y B (PR aprobado por los dos), cuando se incorpora el compañero.
- Incluye:
  - eventos del socket (cliente → servidor y servidor → cliente) con schemas zod;
  - eventos `cs:*` entre microfrontends;
  - tipos de contexto que reciben los microfrontends.
- Cualquier cambio posterior va en un PR revisado por los dos y sube la versión.

### 5.7 Entrada por voz
Decidida por el spike (ADR [4](docs/adr/0004-resolucion-contra-jugadas-legales.md) y [5](docs/adr/0005-strategy-y-reconocedor-por-defecto.md)).
- **Idea clave:** resolver contra las jugadas legales (chessops). Se genera la forma hablada de cada jugada legal y se elige la más parecida a lo reconocido, con umbral, margen y detección de ambigüedad. Resultado: `move | ambiguous | nomatch | command`.
- **Flujo:** mantener pulsado para hablar → **retardo de 400 ms tras soltar** → reconocimiento → normalización → resolución → **confirmación explícita obligatoria** (flecha en el tablero, chessground en `viewOnly`; sí/no/cancelar) → `game:move` en UCI. No hay autoconfirmación: contradice el ADR 5.
- **`SpeechRecognizer` (patrón Strategy):** adaptadores Web Speech (por defecto), Whisper local (módulo local), Fake (tests) y caja de texto de respaldo.
- **Idioma:** `es-CO` (el medido en el spike). **N-best: no se adopta** (ganancia 0,0 puntos).
- **Vocabulario (español):** piezas; letras con alias (be/ve, ce/se, ge/je); coordenadas (“e2 e4”); “toma”; enroque corto/largo; “corona a dama”; comandos sí/no/cancelar. Alfabeto OTAN opcional. Inglés opcional, más adelante.
- **voice-parser:** TS puro con tests en Vitest, ya existente. **Las cifras del spike pertenecen a la versión de la etiqueta `spike-parser-freeze`.** Las mejoras conocidas (alias para «toma» fundido con la letra, «alfil» partido en dos palabras, «peone») se aplican **en un solo lote antes de la validación de la semana 4**, que usa **frases nuevas** y **registra el hash del parser usado**. El parser solo se modifica registrando la versión y re-midiendo en esa validación. El responsable del lote se asigna el lun 9. El corpus v1 de 80 frases lo escriben los dos (40 cada uno).
- La aplicación avisa si el navegador no tiene Web Speech (Firefox) y ofrece Whisper local o la caja de texto.
- Opcional: anunciar la jugada del rival con `speechSynthesis`.

### 5.8 Módulo local (núcleo obligatorio)
- `local-agent` (Node + TS) envuelve `whisper-server`. El navegador lo llama en `http://127.0.0.1:8765` (CORS + cabecera de acceso a red privada). Se parte del prototipo de `spike/whisper-local` (servidor HTTP, puerta, prompt).
- El binario y el modelo quedan fuera del repo; sus rutas van en `.env`. Un **script de instalación en un solo comando** los descarga y verifica (entregable de la Fase 3).
- **Modelo `small` por defecto, siempre con el prompt de ajedrez** (sin él, el acierto baja de 89,7 % a 61,5 %). `base` queda descartado (74,4 % con prompt).
- **Latencia declarada:** p50 2,91 s y p95 3,06 s solo de inferencia en un i5-12400F de 6 núcleos y 12 hilos; en otros equipos será distinta (ver [docs/spike-notes.md](docs/spike-notes.md), sección 8).
- Umbral mínimo de volumen (≥ −50 dBFS) y de duración (≥ 300 ms) antes de transcribir (evita que Whisper alucine con silencio o ruido).
- Desde una página pública (Vercel), el navegador puede bloquear la llamada a `127.0.0.1` por el acceso a red local; en ese caso hay que conceder el permiso o abrir la web en local.
- Alternativa documentada en un ADR: agente con WebSocket saliente hacia el servidor.

## 6. Calidad y convenciones
- Tests: Jest en `server`; Vitest en `shared`, `voice-parser` y `web`. Sin fast-check.
- **CI inicial (Fase 0): solo lint y gitleaks.** Tests en CI cuando existan. El `pnpm install` debe terminar con código 0 (ver `ERR_PNPM_IGNORED_BUILDS` en [docs/spike-notes.md](docs/spike-notes.md)).
- **dependency-cruiser después** (Fase 3), con 3 reglas:
  1. Los `web/mf-*` no se importan entre sí (solo `shared`).
  2. `voice-parser` no importa DOM, Nest ni `web`.
  3. `GameRoom` no importa `@nestjs/*`.
- Código y commits en inglés; interfaz en español. Ramas por feature con PR.
- Nombre: **ChessSpeak**. El repositorio en GitHub ya se llama **`chessspeak`** (`https://github.com/TWC-FINE/chessspeak`) y el remoto local apunta a él. La carpeta local anidada `ChesssPeak/ChesssPeak` se deja por ahora. “ChessPeak” y “ChesssPeak” son errores.

### 6.1 Escenarios de atributos de calidad (`docs/quality.md`)
Formato: fuente, estímulo, entorno, respuesta y medida. Las cifras salen del spike y de la sesión de evaluación de la semana 4; **no se inventan**.

| Atributo | Escenario | Medida |
|---|---|---|
| Precisión de voz (usabilidad) | Un jugador dice una jugada legal del corpus | Acierto top-1, aceptación errónea y ambigüedad, por reconocedor, con otra voz y frases nuevas, **con el hash del parser usado** |
| Rendimiento (voz) | El jugador suelta el botón | p50/p95 de `totalMs` (desglose en `recognitionMs` y `resolveMs`), con Web Speech (incluye los 400 ms) y con Whisper |
| Rendimiento (partida) | Un jugador confirma una jugada | Tiempo hasta que el rival la ve (p50/p95) |
| Disponibilidad / recuperación | Un jugador pierde la conexión a mitad de la partida | Tiempo de reconexión y jugadas perdidas (objetivo: 0) |
| Seguridad | Un cliente intenta jugar por otro o abusa de `/auth/guest` | Rechazo por identidad del servidor; 429 del throttler |
| Modificabilidad | Añadir un reconocedor nuevo | Archivos tocados: solo un adaptador nuevo (ni parser ni servidor) |
| Reproducibilidad | Una persona ajena clona e instala en una máquina limpia, sin ayuda | Pasos del README hasta abrir la app y jugar una jugada por voz; fallos encontrados |

## 7. ADRs
Media página cada uno, **escritos cuando se toma la decisión**, no al final.
| ADR | Decisión | Estado / cuándo se escribe |
|---|---|---|
| 1 | Monolito modular NestJS en TypeScript, con los contratos en `shared/` | **Aceptado** (2 nov) |
| 2 | Microfrontends con custom elements + web estática (sin Module Federation) | Fase 0 (mié 4) |
| 3 | Dos bases: Postgres (partidas) y Mongo (jugadas append-only y telemetría) | Fase 0 (jue 5) |
| 4 | Resolución de voz contra jugadas legales + criterios del spike | **Aceptado** (2 nov) |
| 5 | `SpeechRecognizer` como Strategy; reconocedor por defecto (Web Speech en Edge con retardo de 400 ms; Whisper `small` alternativo) | **Aceptado** (2 nov) |
| 6 | `local-agent` por HTTP en localhost frente a WebSocket saliente | Fase 1 (jue 12) |
| 7 | Estado en memoria + write-behind idempotente | Fase 1 (semana 2) |
| 8 | Invitados con token firmado; login opcional | Fase 1 (semana 2) |
| 9 | Licencia GPL-3.0 (por chessground) | Fase 0 (mar 3) |

## 8. Spike — cerrado el 2 de noviembre
Se hizo antes de comprometer el diseño: Web Speech + chessops, y Whisper `base`/`small`. Criterios fijados antes de medir (no se cambian), en [docs/spike-criteria.md](docs/spike-criteria.md):

| Métrica | Umbral para seguir con Web Speech por defecto |
|---|---|
| Acierto top-1 en frases válidas | ≥ 85 % |
| Aceptación errónea | ≤ 2 % |
| Ambigüedad | ≤ 10 % |
| Latencia | p50 ≤ 1,5 s; p95 ≤ 3 s |
| Silencio/ruido | 0 jugadas aceptadas |
| N-best | Se adopta solo si sube el acierto ≥ 5 puntos sin aumentar la aceptación errónea |

**Resultado:** la corrida A (sin retardo) no cumplió; la corrida B (retardo de 400 ms) cumplió todos los umbrales y es la que cuenta según la regla de lectura. Whisper `small` con prompt acierta 89,7 % pero no cumple la latencia. Detalle, salvedades y datos: [docs/spike-results.md](docs/spike-results.md) y [docs/spike-run-b.md](docs/spike-run-b.md). Pendientes derivados: comprobación en Chrome ([docs/spike-chrome.md](docs/spike-chrome.md)) y validación con otra voz, frases nuevas y otro equipo (Fase 3).

## 9. Calendario (recalculado desde el lun 2 de nov)

### 9.1 Fases
| Fase | Qué incluye | Cuándo |
|---|---|---|
| **Spike** | Web Speech + chessops, Whisper, decisión y ADR 4 y 5 | ✅ Cerrado el lun 2 |
| **Fase 0 — Fundaciones** | Monorepo, `shared/` (borrador del contrato), esqueleto Nest + `health`, shell y 3 proyectos Vite, `serve:web`, Neon/Atlas, Render, Vercel, CI | mar 3 – vie 6 (solo); **cierra el vie 6** |
| **Fase 1 — Partida entre invitados y `local-agent` básico** | `GameRoom`, auth de invitados, Socket.IO, `games` y write-behind, shell con sesión, `<mf-game>`, caja de texto → parser → jugada, `local-agent` básico | **formal desde el lun 9** – vie 13 |
| **Fase 2 — Voz de punta a punta** | Reconexión y fin de partida, `voice-metrics`, `<mf-voice-input>` (Web Speech con 400 ms, Whisper), confirmación explícita, lote de mejoras del parser | lun 16 – vie 20 |
| **Fase 3 — Pulido, medición y entrega** | Validación (con el hash del parser), `quality.md`, dependency-cruiser, congelación, **prueba en máquina limpia**, README, entrega | lun 23 – vie 27 |

### 9.2 Escenarios de capacidad
Días de trabajo entre el mar 3 y el jue 26 (el vie 27 es la entrega):
| | Se trabajan los festivos (lun 16) | No se trabaja el lun 16 |
|---|---|---|
| **Yo (solo del 3 al 6; desde el 9, con el compañero)** | **Escenario base:** 18 días | 17 días: el calendario se corre (ver 9.5) |
| **Compañero (desde el lun 9)** | 14 días | 13 días |

Regla: los fines de semana o se planifican con tareas concretas (9.6) o no cuentan. No hay trabajo “si sobra tiempo”. El lun 2 (festivo) se usó para cerrar el spike.

### 9.3 Semana 1 · mar 3 – vie 6 nov · Yo, solo: Fase 0
Hasta que entre el compañero, una sola persona cubre A y B. **El plan base cierra la Fase 0 el vie 6**; el fin de semana no es obligatorio.
| Fecha | Tareas |
|---|---|
| Mar 3 | **Primero, por la mañana:** subir todo lo pendiente al remoto y hacer la **copia de seguridad de los WAV** (`spike/recordings/`) y de `spike/results/`; **después**, la **medición de Chrome** de [docs/spike-chrome.md](docs/spike-chrome.md) (~1 h). **Fase 0:** limpiar el workspace (añadir `shared/`, `server/`, `web/*`, `local-agent/` a `pnpm-workspace.yaml`) y decidir los builds permitidos para que `pnpm install` termine con código 0; esqueleto de `shared/`; esqueleto Nest + `health`; ADR 9 (licencia) |
| Mié 4 | **Fase 0:** shell estático, 3 proyectos Vite (Lit, light DOM), `build:web` → `web/dist`, **`pnpm serve:web`** (servidor estático de Node, sin dependencias, `127.0.0.1:5500`), páginas standalone con contexto simulado; ADR 1 y 2 |
| Jue 5 | **Fase 0:** Prisma/Neon (`games`), Mongoose/Atlas, `.env.example`; ADR 3; **borrador mínimo y versionado (`v: 1`) del contrato v0** de `shared/` en un PR abierto (se firma el lun 9) |
| Vie 6 | **Fase 0:** despliegue en Render y de la web estática en Vercel, CORS; CI con lint + gitleaks. **Cierra la Fase 0** |
| Sáb 7 – Dom 8 | **No obligatorio.** Si se trabaja, solo un extra: `GameRoom` (clase pura con tests). La Fase 1 formal empieza el lun 9 |

**Hito vie 6:** `health` desplegado; la web (shell con los 3 microfrontends vacíos) visible en una URL pública; `pnpm serve:web` funcionando; CI en verde; PR del contrato v0 abierto.

### 9.4 Desde el lun 9 nov · Dos personas
**Roles A y B: decisión pendiente para el lun 9**, con el compañero, según su comodidad con NestJS o con el front y Lit. Hasta entonces se llaman así:

| Rol | Responsabilidad |
|---|---|
| **A** | Servidor: auth, `games`, `GameRoom`, Socket.IO, Postgres, write-behind en Mongo, reconexión, `voice-metrics` |
| **B** | Shell y microfrontends: shell con sesión y router, `<mf-game>`, `<mf-voice-input>`, `<mf-history>`, adaptadores de reconocimiento (Web Speech, caja de texto, Whisper en el navegador) |
| **Juntos** | Contrato v0 de `shared/`, `local-agent`, integración de voz, corpus v1 (40 frases cada uno), validación, prueba en máquina limpia |
| **Por asignar el lun 9** | Responsable del lote de mejoras del parser (ver 5.7) |

**Semana 2 · lun 9 – vie 13 nov · Fase 1**
| Fecha | A | B |
|---|---|---|
| Lun 9 | **Juntos:** puesta al día con [docs/CONTEXT.md](docs/CONTEXT.md), **firma del contrato v0**, **asignación de roles A/B** y del responsable del parser | igual |
| Mar 10 – Mié 11 | `GameRoom` con tests (si no se hizo el fin de semana), auth de invitados + throttler, gateway Socket.IO, `games` en Postgres, write-behind idempotente en Mongo | Shell con sesión, router y socket único; `<mf-game>` (chessground `viewOnly`); caja de texto → parser → `game:move` |
| Jue 12 – Vie 13 | **`local-agent` básico** (A lidera; B revisa): servicio HTTP a partir de `spike/whisper-local`, con puerta de volumen, prompt de ajedrez y modelo `small`; CORS y acceso a red privada verificados desde 5500; ADR 6 | `<mf-history>` (lista de jugadas), eventos `cs:` de punta a punta, adaptador Web Speech con el retardo de 400 ms |
| Toda la semana | Corpus v1: 40 frases | Corpus v1: 40 frases |

**Hito vie 13:** dos invitados juegan escribiendo jugadas, desplegado en la nube; `local-agent` transcribe un WAV; corpus v1 completo (80 frases).

**Semana 3 · lun 16 – vie 20 nov · Fase 2**
| Fecha | A | B |
|---|---|---|
| Lun 16 (festivo) – Vie 20 | Reconexión y rehidratación, fin de partida (mate, ahogado, tablas, abandono), `voice-metrics` (ingesta de `voice_attempts` con `player` puesto por el servidor), endurecimiento de la validación | `<mf-voice-input>` (pulsar para hablar), confirmación explícita con flecha y sí/no/cancelar, telemetría vía shell, **adaptador Whisper en el navegador probado contra `local-agent`**, aviso en navegadores sin Web Speech |
| Mié 18 – Vie 20 | **Lote único de mejoras del parser** (alias de «toma» fundido con la letra, «alfil» partido, «peone»), guiado por el corpus v1; lo hace el responsable asignado el lun 9 y el otro revisa (ver 11.2) | igual |
| Vie 20 | **Juntos:** script de instalación de Whisper en un solo comando | igual |

**Hito vie 20:** partida completa por voz con Web Speech en la nube; una jugada por voz con Whisper local desde el navegador; la reconexión funciona; Whisper se instala con un comando; el parser queda **congelado de nuevo** antes de la validación.

**Semana 4 · lun 23 – vie 27 nov · Fase 3**
| Fecha | Juntos |
|---|---|
| Lun 23 – Mar 24 | **Validación** con **frases nuevas**, los dos reconocedores y **otra voz y otro equipo** → cifras reales en `docs/quality.md`, **registrando el hash del parser usado**; dependency-cruiser (3 reglas) en CI; corrección de errores. Opcionales solo si todo está en verde: pestaña Precisión, login/registro, speechSynthesis |
| Mié 25 | **Congelación de funcionalidades.** **Prueba en una máquina limpia** (clonar, `pnpm install`, `.env`, Whisper con un comando, abrir la URL pública y también en local con `serve:web`, en Edge y en Chrome) siguiendo solo el README; corregir lo que falle |
| Jue 26 | README e instrucciones del `local-agent` revisados con lo que falló en la prueba; repaso de los ADRs y de `quality.md`. Commit de entrega con `web/dist` y tag `v1.0` |
| Vie 27 | **Entrega** |

### 9.5 Si no se trabaja el lunes festivo
- **Lun 16 sin trabajar:** la Fase 2 del servidor pasa a mar 17 – vie 20 + lun 23. La validación se queda en el mar 24 y los opcionales salen del plan.
- El fin de semana 7–8 es opcional: no trabajarlo no cambia el calendario base.

### 9.6 Fines de semana (bloques opcionales con tarea concreta)
| Fin de semana | Tarea | Qué libera |
|---|---|---|
| Sáb 7 – Dom 8 | Solo `GameRoom` (clase pura con tests) | Menos carga el mar 10 – mié 11 |
| Sáb 14 – Dom 15 | Lote de mejoras del parser (responsable asignado el lun 9) | Descarga la semana 3 |
| Sáb 21 – Dom 22 | Primera pasada de la validación con frases nuevas | La semana 4 gana un día de colchón |

### 9.7 Orden de recorte si hay retraso
1. speechSynthesis
2. login/registro
3. alfabeto OTAN
4. pestaña Precisión

**No se recortan:** voz con confirmación explícita, sockets, las 2 bases de datos, `local-agent` con Whisper, los microfrontends, **la URL pública en Vercel y `serve:web`**, `quality.md` con cifras reales y la **reproducibilidad en máquina limpia**.

## 10. Riesgos
Ahora el proyecto se presenta terminado, en un equipo ajeno y sin que haya nadie al lado.

| Riesgo | Mitigación |
|---|---|
| El equipo de quien evalúa no tiene lo necesario (Node, pnpm, VS Code, Whisper) o el README falla | URL pública en Vercel (no exige instalar nada); `pnpm serve:web` sin VS Code; prueba en máquina limpia en la Fase 3; `pnpm install` con código 0; Whisper con un comando; la caja de texto funciona sin nada de eso |
| `pnpm install` termina con `ERR_PNPM_IGNORED_BUILDS` y parece que falló | Decidir los builds permitidos en `pnpm-workspace.yaml` y explicarlo en el README |
| Instancia gratuita de Render dormida (primera carga lenta) | `health` como comprobación; avisar en el README de la espera inicial; recomendar despertarla antes de evaluar |
| El navegador no tiene Web Speech (Firefox) o no hay internet | Aviso en la app y alternativas: Whisper local (si está instalado) o la caja de texto |
| Chrome funciona peor que Edge (no se midió) | Comprobación declarada en `docs/spike-chrome.md` (mar 3, tras subir y respaldar); si no cumple, el README y la app recomiendan Edge |
| Whisper `small` es lento en un equipo menos potente (en un i5-12400F: p50 2,91 s) | Latencia declarada en la interfaz; es alternativa, no el reconocedor por defecto; la caja de texto siempre disponible |
| El equipo de quien evalúa no es Windows x64 (el script de Whisper usa el binario de Windows) | Web Speech y la caja de texto funcionan en cualquier sistema; Whisper se documenta como opcional en Windows |
| Falta el micrófono o su permiso en el equipo ajeno | Mensaje claro en la app; la caja de texto como respaldo |
| Whisper transcribe algo con silencio o ruido | Umbral de volumen y duración; **confirmación explícita obligatoria**, así que nada se juega solo |
| Desde la URL pública (Vercel) el navegador bloquea las llamadas a `127.0.0.1` (acceso a red local), y Whisper además exige instalar el agente | Documentarlo en el README; ensayar el permiso en Edge y en Chrome; alternativa: abrir la web en local con `serve:web`; Web Speech y la caja de texto no se ven afectados |
| El resultado de B no se repite con otra voz o con frases nuevas (una voz, una corrida, IC95 inferior de 78 %) | Validación de la semana 4 con otra voz, frases nuevas y otro equipo; las cifras reales van a `quality.md` sin maquillar |
| Cambiar el parser invalida las cifras del spike | Un solo lote de mejoras antes de la validación y se registra el hash del parser usado; si no, se queda la versión `spike-parser-freeze` |
| Se prueba con dos jugadores en la misma sala y el micrófono capta al otro | Pulsar para hablar, diademas, confirmación explícita |
| Divergencia entre servidor y frontend | Contrato v0 de `shared/` versionado (`v: 1`), firmado el lun 9; cambios solo por PR revisado por los dos |
| Una sola persona hasta el 9 de noviembre | La Fase 0 ocupa del 3 al 6 y se cierra el vie 6; el fin de semana es opcional; la Fase 1 empieza el lun 9; si no alcanza, se aplica el orden de recorte |

## 11. Recomendaciones y objeciones
1. **Hasta el 9 de noviembre el trabajo es en solitario y es más de lo que el plan original repartía entre dos.** Si algo de la Fase 0 se retrasa, se recorta antes de empezar la Fase 1.
2. **El lote de mejoras del parser choca con la Fase 2 del servidor.** Quien lleve el servidor tiene la semana 3 ocupada. El responsable se asigna el lun 9 según quién tenga más margen; si se trabaja el fin de semana del 14–15, el lote se hace entonces.
3. **El `local-agent` básico del jue 12 – vie 13 es el punto de no retorno del módulo local.** El prototipo del spike (`spike/whisper-local`) lo reduce a portarlo, pero si ese viernes no transcribe un WAV desde el navegador, hay que escalarlo antes de la semana 3.
4. **Colchón casi nulo.** La semana 4 es validación y entrega, y es el único margen. Si algo de la semana 3 se retrasa, se aplica el orden de recorte sin discutir.
5. **`quality.md` necesita la validación.** Sin `expectedUci` y sin el hash del parser no hay cifras comparables. Protege el lun 23 – mar 24.
6. **Repositorio:** ya se llama `chessspeak` en GitHub y el remoto local está actualizado. La carpeta local anidada se deja por ahora. Decisión cerrada.
7. **No adoptar el N-best:** el spike lo midió y no mejora nada (+0,0 puntos). **Tampoco hay autoconfirmación.**
8. **Confirmar la fecha de entrega cuanto antes:** todo el calendario cuelga del vie 27. Si se adelanta, se aplica el orden de recorte desde ya.
9. **La medición de Chrome va el mar 3 por la mañana, después de subir todo y respaldar los WAV:** decide si el README y la app recomiendan solo Edge o ambos.

## 12. Preguntas abiertas
**Resueltas con el profesor:**
- ✅ El agente Whisper en localhost **cuenta como módulo local**.
- ✅ Es aceptable que Web Speech use la nube de Google.

**Pendientes para el profesor:**
1. ¿Hay que poder abrir el proyecto con Live Server sin compilar? (Hoy el plan sirve `web/dist`, ya compilado; con la URL pública y `serve:web` el riesgo baja, pero si la respuesta es sí, `web/dist` tendría que estar en el repo desde la entrega.)
2. ¿Cuál es la fecha real de entrega y el formato de la presentación?

**Para el equipo (se deciden el lun 9):**
- Roles A y B: según la comodidad de cada persona con NestJS o con el front y Lit.
- Responsable del lote de mejoras del parser.
- Si se trabajan los fines de semana (opcionales) y el lunes festivo del 16.
