# ChessSpeak — Plan del proyecto

> Última actualización: jueves 5 de noviembre de 2026.
> **Entrega y demo en vivo: jueves 19 de noviembre de 2026** (antes se suponía el vie 27 sin demo). Calendario en la sección 9.
> Equipo: una persona sola hasta que se incorpore el compañero (hacia el **lun 9 de noviembre**). Desde entonces, dos personas con los roles A (servidor) y B (shell y microfrontends), que **se asignan el lun 9** según la comodidad de cada una con NestJS o con el front y Lit; el `local-agent` y la integración de voz, entre las dos. Hasta el 9, una sola persona cubre A y B.

## 1. Estado a 5 de noviembre de 2026
- **Spike cerrado el 2 de noviembre**, con los ADR 4 y 5 aceptados. Informe: [docs/spike-results.md](docs/spike-results.md) y [docs/spike-run-b.md](docs/spike-run-b.md).
- **Decisión:**
  - Reconocedor por defecto: **Web Speech en Edge, con un retardo de 400 ms entre soltar el botón y llamar a `stop()`** (requisito del producto).
  - **Whisper local, modelo `small` con prompt de ajedrez**, como alternativa seleccionable y módulo local, con su latencia declarada.
  - **Confirmación explícita obligatoria** con cualquier reconocedor.
- **Números clave** (split `test`, 78 frases de jugada): Web Speech sin retardo (A) 56,4 % de acierto; con retardo de 400 ms (B) **87,2 %** (IC95 78–93 %), 0 aceptaciones erróneas, 0 ambigüedad, latencia p50 0,57 s. Whisper `small` con prompt: 89,7 % pero p50 2,91 s y p95 3,06 s (solo inferencia, en un i5-12400F), por encima de los umbrales de latencia.
- **Las cifras pertenecen a la versión del parser de la etiqueta `spike-parser-freeze`.** Si el parser cambia, esas cifras ya no describen el producto (ver 5.7).
- **Salvedades:** una voz y una corrida B; no está demostrado que la mejora se deba solo al retardo; todo se midió en **Edge 156**. **Chrome no se midió** (hay una comprobación declarada en [docs/spike-chrome.md](docs/spike-chrome.md), pendiente). La validación con **otra voz, frases nuevas y otro equipo** se hace el mar 17. La demo se hace en Edge, así que medir Chrome ya no bloquea nada.
- **Código que existe (5 de noviembre):** `packages/voice-parser`, `spike/`, `local-agent` (pool de Whisper con dashboard y prueba de carga, adelantado respecto a la Fase 1), esqueleto de `server/` con las dos bases, `web/` con marcadores de posición y CI. Copia de seguridad de los WAV hecha. **`GameRoom` está escrita, en el PR #10, abierto y sin revisar.** **Falta de la Fase 0:** desplegar (`docs/deploy.md`, requiere crear las cuentas) y firmar el contrato (PR #3).
- **Balanceo de carga (requisito nuevo del profesor):** está en `local-agent` (ADR 10), con carga de prueba sintética, porque en una partida real ese balanceador ve una petición a la vez. Se evaluó un análisis post-partida con Stockfish como caso con carga natural y su prueba de viabilidad **no pasó** ([docs/analysis-gate.md](docs/analysis-gate.md)). El alcance exigido está por confirmar con el profesor.
- Lo que el spike deja por hacer está en [docs/spike-notes.md](docs/spike-notes.md) (sección 7), agrupado por área: **agente local**, **producto** y **CI y entrega**.

## 2. Qué es
Proyecto final de Arquitectura de Software: web de ajedrez donde las jugadas se dicen en voz alta en notación algebraica (en español). El sistema reconoce la frase, la resuelve contra las jugadas legales, pide confirmación y la aplica en la partida en tiempo real.

Fuera del núcleo (“Futuro”): chat de voz entre jugadores (WebRTC/TURN/señalización), análisis con Stockfish, inglés.

## 3. Cómo se entrega: demo en vivo
**La demo es en vivo** (5 de noviembre; reemplaza a la decisión anterior de “no hay demo en vivo”). Se supone que es el mismo **jueves 19** y que la presentamos los dos con nuestras laptops; ambos supuestos están por confirmar (ver 12). Ya no hay que preparar el proyecto para alguien que lo abra solo: hay que preparar **una presentación que no falle**.

- **Montaje de la demo:** dos laptops con **Edge** (el navegador medido en el spike), diademas y la web en local con `pnpm serve:web` (`127.0.0.1:5500`), conectada al backend en Render. Servir en local evita el permiso de red local que puede bloquear a Whisper desde una página pública.
- **Vercel deja de ser núcleo.** La demo no lo necesita. `vercel.json` ya existe, así que se despliega si no quita tiempo, y es lo primero que se recorta.
- **Guion (criterios de aceptación de SPEC.md, sección 6):**
  1. Crear una partida y unirse desde la otra laptop.
  2. Jugar por voz con Web Speech, confirmando con flecha.
  3. Decir una frase ambigua o ilegible y ver que ninguna pieza se mueve.
  4. Desconectar un jugador y ver que la partida continúa al volver.
  5. Hacer una jugada con Whisper local y mostrar el dashboard del balanceo (`/lb/dashboard`).
  6. Enseñar `game_moves` y `voice_attempts` en Mongo, y `games` en Postgres.
  7. Terminar la partida (se puede partir de una posición cercana al mate o usar el abandono).
- **Respaldos:** la **caja de texto** si falla el micrófono o el reconocedor, datos del celular si falla la red de la sala y el **video grabado el mié 18** si falla todo lo demás.
- **Reproducibilidad, reducida:** el README sigue siendo necesario (repo público y criterio 7 de SPEC.md), pero ya no es lo que usa quien evalúa. Se comprueba con un **clon nuevo en la segunda laptop**, siguiendo solo el README. Para instalar Whisper se reutiliza `pnpm --filter @chessspeak/spike-whisper-local download`.
- La aplicación avisa si el navegador no tiene Web Speech (Firefox) y ofrece Whisper local o la caja de texto. Es poco trabajo, pero en la demo no se usa, por eso entra en el orden de recorte (9.7).

## 4. Requisitos del profesor y cómo se cumplen
| Requisito | Cómo se cumple |
|---|---|
| Desplegado en la nube | Backend NestJS en Render, Postgres en Neon, Mongo en Atlas M0. Web estática en Vercel opcional (la demo la sirve en local) |
| Módulo local | `local-agent` (Node + TS) en la laptop de la demo; envuelve `whisper-server` (whisper.cpp) en `http://127.0.0.1:8765`. **El profesor confirmó que cuenta como módulo local** |
| Sockets | Socket.IO: partida en tiempo real (un único socket, abierto por el shell) |
| Cámara o micrófono | Micrófono: jugadas por voz (Web Speech API o Whisper local). **El profesor confirmó que es aceptable que Web Speech use la nube de Google** |
| Mínimo 2 bases de datos | Postgres (`games`, y `users` si se hace el login) + Mongo (`game_moves`, `voice_attempts`) |
| 100% en GitHub | Repo público `chessspeak`, GPL-3.0, ramas por feature con PR, CI |
| Microfrontends | 3 custom elements independientes (`<mf-game>`, `<mf-voice-input>`, `<mf-history>`) que conviven en un index servido como web estática |
| Balanceo de carga sobre un proceso crítico | Pool de `whisper-server` en `local-agent`, con dashboard y prueba de carga (ADR 10). **Alcance exigido por confirmar con el profesor** |

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
- Login/registro (JWT propio + bcrypt): **fuera del plan** por la fecha del 19.
- `@nestjs/throttler` en `/auth/guest` (y en `/auth/login` si se hace), con `trust proxy` en Render.
- Atlas con `0.0.0.0/0`, mitigado con un usuario de mínimos privilegios y contraseña fuerte.
- Secretos solo en `.env`, con `.env.example` en el repo; gitleaks en CI.
- CORS (HTTP y Socket.IO): `http://127.0.0.1:5500`, `http://localhost:5500` y el dominio de Vercel.

### 5.5 Microfrontends
- Cada microfrontend es un custom element (Lit en light DOM) en su propio proyecto Vite y tiene su página standalone con contexto simulado.
- Todos conviven en el index del shell, que se puede servir con Live Server, con `pnpm serve:web` (servidor estático de Node sin dependencias, `127.0.0.1:5500`; es lo que usa la demo) o, si se despliega, como web estática pública en Vercel. No se exigen despliegues independientes; Module Federation descartado.
- Contexto por propiedad (`el.context`). Mínimo privilegio: solo `<mf-game>` recibe el socket; la telemetría de voz la reenvía el shell.
- Comunicación con CustomEvent tipados con prefijo `cs:`, definidos en `shared/`.
- Sin Shadow DOM: CSS plano con prefijo por microfrontend y tokens compartidos.
- La pestaña “Precisión” de `<mf-history>` (una tabla) queda **fuera del plan** por la fecha del 19.

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
- **Vocabulario (español):** piezas; letras con alias (be/ve, ce/se, ge/je); coordenadas (“e2 e4”); “toma”; enroque corto/largo; “corona a dama”; comandos sí/no/cancelar. Alfabeto OTAN e inglés, fuera del plan.
- **voice-parser:** TS puro con tests en Vitest, ya existente. **Las cifras del spike pertenecen a la versión de la etiqueta `spike-parser-freeze`.** Las mejoras conocidas (alias para «toma» fundido con la letra, «alfil» partido en dos palabras, «peone») se aplican **en un solo lote, con un máximo de 1 día, antes de la validación del mar 17**, que usa **frases nuevas** y **registra el hash del parser usado**. El parser solo se modifica registrando la versión y re-midiendo en esa validación. Si no da tiempo, se queda `spike-parser-freeze`. El responsable del lote se asigna el lun 9. El lote se guía por los fallos ya anotados en el spike, no por las frases nuevas. **Las 40 frases de validación las escriben los dos (20 cada uno)**, en lugar de las 80 del corpus v1 previsto: el intervalo de confianza será más ancho y se declara así. La sesión puede usar el arnés de `spike/web-speech` y `pnpm metrics` si la app aún no registra `expectedUci`.
- La aplicación avisa si el navegador no tiene Web Speech (Firefox) y ofrece Whisper local o la caja de texto.
- Anunciar la jugada del rival con `speechSynthesis`: fuera del plan por la fecha del 19.

### 5.8 Módulo local (núcleo obligatorio)
- `local-agent` (Node + TS) envuelve `whisper-server`. El navegador lo llama en `http://127.0.0.1:8765` (CORS + cabecera de acceso a red privada). Se parte del prototipo de `spike/whisper-local` (servidor HTTP, puerta, prompt).
- El binario y el modelo quedan fuera del repo; sus rutas van en `.env`. Se instalan con el script que ya existe, `pnpm --filter @chessspeak/spike-whisper-local download`, y el README lo explica.
- **Modelo `small` por defecto, siempre con el prompt de ajedrez** (sin él, el acierto baja de 89,7 % a 61,5 %). `base` queda descartado (74,4 % con prompt).
- **Latencia declarada:** p50 2,91 s y p95 3,06 s solo de inferencia en un i5-12400F de 6 núcleos y 12 hilos; en otros equipos será distinta (ver [docs/spike-notes.md](docs/spike-notes.md), sección 8).
- Umbral mínimo de volumen (≥ −50 dBFS) y de duración (≥ 300 ms) antes de transcribir (evita que Whisper alucine con silencio o ruido).
- Desde una página pública (Vercel), el navegador puede bloquear la llamada a `127.0.0.1` por el acceso a red local; por eso la demo abre la web en local.
- Alternativa documentada en un ADR: agente con WebSocket saliente hacia el servidor.

## 6. Calidad y convenciones
- Tests: Jest en `server`; Vitest en `shared`, `voice-parser` y `web`. Sin fast-check.
- **CI inicial (Fase 0): solo lint y gitleaks.** Tests en CI cuando existan. El `pnpm install` debe terminar con código 0 (ver `ERR_PNPM_IGNORED_BUILDS` en [docs/spike-notes.md](docs/spike-notes.md)).
- **dependency-cruiser después** (Fase 3, solo si hay tiempo; ver 9.7), con 3 reglas:
  1. Los `web/mf-*` no se importan entre sí (solo `shared`).
  2. `voice-parser` no importa DOM, Nest ni `web`.
  3. `GameRoom` no importa `@nestjs/*`.
- Código y commits en inglés; interfaz en español. Ramas por feature con PR.
- Nombre: **ChessSpeak**. El repositorio en GitHub se llama hoy **`TWC-FINE/ChesssPeak`** y el remoto local apunta a él. La carpeta local anidada `ChesssPeak/ChesssPeak` se deja por ahora. Fuera de esos dos casos, “ChessPeak” y “ChesssPeak” son errores.

### 6.1 Escenarios de atributos de calidad (`docs/quality.md`)
Formato: fuente, estímulo, entorno, respuesta y medida. Las cifras salen del spike y de la sesión de evaluación del mar 17; **no se inventan**.

| Atributo | Escenario | Medida |
|---|---|---|
| Precisión de voz (usabilidad) | Un jugador dice una jugada legal del corpus | Acierto top-1, aceptación errónea y ambigüedad, por reconocedor, con otra voz y frases nuevas, **con el hash del parser usado** |
| Rendimiento (voz) | El jugador suelta el botón | p50/p95 de `totalMs` (desglose en `recognitionMs` y `resolveMs`), con Web Speech (incluye los 400 ms) y con Whisper |
| Rendimiento (partida) | Un jugador confirma una jugada | Tiempo hasta que el rival la ve (p50/p95) |
| Disponibilidad / recuperación | Un jugador pierde la conexión a mitad de la partida | Tiempo de reconexión y jugadas perdidas (objetivo: 0) |
| Seguridad | Un cliente intenta jugar por otro o abusa de `/auth/guest` | Rechazo por identidad del servidor; 429 del throttler |
| Modificabilidad | Añadir un reconocedor nuevo | Archivos tocados: solo un adaptador nuevo (ni parser ni servidor) |
| Reproducibilidad | Un clon nuevo en la segunda laptop, siguiendo solo el README | Pasos del README hasta abrir la app y jugar una jugada por voz; fallos encontrados |

## 7. ADRs
Media página cada uno, **escritos cuando se toma la decisión**, no al final.
| ADR | Decisión | Estado / cuándo se escribe |
|---|---|---|
| 1 | Monolito modular NestJS en TypeScript, con los contratos en `shared/` | **Aceptado** (2 nov) |
| 2 | Microfrontends con custom elements + web estática (sin Module Federation) | **Aceptado** (2 nov) |
| 3 | Dos bases: Postgres (partidas) y Mongo (jugadas append-only y telemetría) | **Aceptado** (3 nov) |
| 4 | Resolución de voz contra jugadas legales + criterios del spike | **Aceptado** (2 nov) |
| 5 | `SpeechRecognizer` como Strategy; reconocedor por defecto (Web Speech en Edge con retardo de 400 ms; Whisper `small` alternativo) | **Aceptado** (2 nov) |
| 6 | `local-agent` por HTTP en localhost frente a WebSocket saliente | lun 16 |
| 7 | Estado en memoria + write-behind idempotente | mar 10 – mié 11 |
| 8 | Invitados con token firmado; login fuera del plan | mar 10 – mié 11 |
| 9 | Licencia GPL-3.0 (por chessground) | vie 6; **sin escribir** |
| 10 | Balanceo de carga de la transcripción en `local-agent` | **Aceptado** (4 nov) |

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

## 9. Calendario (recalculado el jue 5 de nov para entregar el jue 19)

La entrega se adelantó del vie 27 al **jue 19 de noviembre**: de hoy hasta el último día de trabajo pasamos de 16 a **10 días**. El plan se sostiene por tres cosas: el `local-agent` y `GameRoom` ya están escritos, la validación se reduce a medio día y los opcionales salen del plan.

### 9.1 Fases
| Fase | Qué incluye | Cuándo |
|---|---|---|
| **Spike** | Web Speech + chessops, Whisper, decisión y ADR 4 y 5 | ✅ Cerrado el lun 2 |
| **Fase 0 — Fundaciones** | Monorepo, esqueletos, shell y 3 proyectos Vite, `serve:web` y CI ✅. **Falta:** desplegar Neon, Atlas y Render, y firmar el contrato | **Cierra el vie 6** (la firma, el lun 9) |
| **Fase 1 — Partida entre invitados** | Auth de invitados, Socket.IO, `games` y write-behind, shell con sesión, `<mf-game>`, caja de texto → parser → jugada. `GameRoom` ✅ en el PR #10; `local-agent` ✅ en `main` | lun 9 – **mié 11** |
| **Fase 2 — Voz de punta a punta** | Reconexión y fin de partida, `voice-metrics`, `<mf-voice-input>` (Web Speech con 400 ms, Whisper), confirmación explícita, `<mf-history>`, lote del parser | jue 12 – **lun 16** |
| **Fase 3 — Validación, ensayo y entrega** | Validación (con el hash del parser), `quality.md`, ensayos, video de respaldo, README, tag | mar 17 – **jue 19** |

### 9.2 Escenarios de capacidad
Días de trabajo entre hoy (jue 5) y el mié 18 (el jue 19 es la entrega):
| | Se trabaja el festivo (lun 16) | No se trabaja el lun 16 |
|---|---|---|
| **Yo** | **Escenario base:** 10 días | 9 días (ver 9.5) |
| **Compañero (desde el lun 9)** | 8 días | 7 días |

Regla: los fines de semana o se planifican con tareas concretas (9.6) o no cuentan. No hay trabajo “si sobra tiempo”.

### 9.3 Semana 1 · jue 5 – vie 6 nov · Yo, solo
| Fecha | Tareas |
|---|---|
| Jue 5 | ✅ `GameRoom` (PR #10) y borrador del contrato (PR #3), abiertos y con CI en verde. Replanificación con la fecha nueva |
| Vie 6 | **Auth de invitados + throttler**, sobre `feat/game-room`, con las bases locales. ADR 9 (licencia). **El despliegue queda en espera** de lo que sugiera el profesor; los proveedores de este plan son provisionales (ver [docs/proximos-pasos.md](docs/proximos-pasos.md)) |

**Hito vie 6:** auth de invitados en un PR abierto. El despliegue tiene que hacerse antes del ensayo del mar 17.

### 9.4 Desde el lun 9 nov · Dos personas
**Roles A y B: se deciden el lun 9**, con el compañero, según su comodidad con NestJS o con el front y Lit. Hasta entonces se llaman así:

| Rol | Responsabilidad |
|---|---|
| **A** | Servidor: auth, `games`, Socket.IO, Postgres, write-behind en Mongo, reconexión, `voice-metrics` |
| **B** | Shell y microfrontends: shell con sesión y router, `<mf-game>`, `<mf-voice-input>`, `<mf-history>`, adaptadores de reconocimiento (Web Speech, caja de texto, Whisper en el navegador) |
| **Juntos** | Contrato v0 de `shared/`, integración de voz, frases de validación (20 cada uno), validación, ensayos |
| **Por asignar el lun 9** | Responsable del lote de mejoras del parser (ver 5.7) |

**Semana 2 · lun 9 – vie 13 nov · Fase 1 y primera mitad de la Fase 2**
| Fecha | A | B |
|---|---|---|
| Lun 9 | **Juntos, por la mañana:** puesta al día con [docs/CONTEXT.md](docs/CONTEXT.md), **firma del contrato v0** y fusión de los PR #3 y #10, **asignación de roles** y del responsable del parser; el compañero instala el proyecto en su laptop. **Por la tarde:** arranca cada rol | igual |
| Mar 10 – Mié 11 | Auth de invitados (si falta), gateway Socket.IO, `games` en Postgres, write-behind idempotente en Mongo; ADR 7 y 8 | Shell con sesión, router y socket único; `<mf-game>` (chessground `viewOnly`); caja de texto → parser → `game:move` |
| Jue 12 – Vie 13 | Fin de partida (mate, ahogado, tablas, abandono), reconexión y rehidratación, `voice-metrics` (ingesta de `voice_attempts` con `player` puesto por el servidor) | `<mf-voice-input>` (pulsar para hablar) con Web Speech y retardo de 400 ms, confirmación explícita con flecha y sí/no/cancelar, `<mf-history>`, eventos `cs:` de punta a punta, telemetría vía shell |
| Toda la semana | 20 frases de validación | 20 frases de validación |

**Hito mié 11:** dos invitados juegan escribiendo jugadas, con el backend desplegado o, si aún no hay despliegue, en local. **Es el punto de control más importante del plan** (ver 11.1).

**Hito vie 13:** partida completa por voz con Web Speech; la reconexión funciona; 40 frases de validación escritas.

**Semana 3 · lun 16 – jue 19 nov · Fin de la Fase 2 y Fase 3**
| Fecha | A | B |
|---|---|---|
| Lun 16 (festivo) | Endurecimiento de la validación; ADR 6. **Lote del parser** (máximo 1 día, solo si se cumplió el hito del vie 13; lo hace el responsable y el otro revisa) | **Adaptador Whisper en el navegador probado contra `local-agent` en Edge**, latencia declarada en la interfaz, aviso en navegadores sin Web Speech |
| Mar 17 | **Juntos. Por la mañana: validación** con las frases nuevas, los dos reconocedores, otra voz y la otra laptop → cifras reales en `docs/quality.md`, **registrando el hash del parser usado**. **Por la tarde: primer ensayo** con dos laptops y diademas, los dos hablando; clon nuevo en la segunda laptop siguiendo el README; corrección de errores | igual |
| Mié 18 | **Juntos. Solo corrección de errores.** Segundo ensayo, cronometrado, con el guion de la sección 3. **Grabación del video de respaldo.** README, ADRs y `quality.md` revisados. Commit de entrega con `web/dist` y tag `v1.0` | igual |
| Jue 19 | **Entrega y demo.** Antes de empezar: despertar Render y comprobar `/health`, probar micrófonos y arrancar `local-agent` | igual |

**Hito lun 16 (congelación de funcionalidades):** una jugada por voz con Whisper local desde el navegador; el parser queda **congelado de nuevo** antes de la validación. Desde aquí no entra nada nuevo.

### 9.5 Si no se trabaja el lunes festivo
- El **lote del parser sale del plan**: se queda la versión `spike-parser-freeze`.
- El adaptador Whisper pasa al fin de semana 14–15 si se trabaja; si no, al mar 17 por la mañana.
- La validación pasa al mar 17 por la tarde y el único ensayo es el del mié 18, junto con el video.

### 9.6 Fines de semana (bloques opcionales con tarea concreta)
**Recomendación:** trabajar al menos el 14–15, porque es el único colchón real que tiene este calendario. Se decide el lun 9.
| Fin de semana | Tarea | Qué libera |
|---|---|---|
| Sáb 7 – Dom 8 | Gateway Socket.IO básico sobre `GameRoom` | Menos carga el mar 10 – mié 11; asegura el hito del mié 11 |
| Sáb 14 – Dom 15 | Lo que falte del hito del vie 13; si no falta nada, el adaptador Whisper | Deja el lun 16 libre para el lote del parser y los errores |

### 9.7 Orden de recorte si hay retraso
**Ya fuera del plan por la fecha (no se hacen):** `speechSynthesis`, login/registro, alfabeto OTAN, pestaña Precisión y la corrida con un modelo cuantizado.

**Si aun así hay retraso, se recorta en este orden, sin discutir:**
1. Vercel (la demo usa `serve:web`)
2. Medición en Chrome (la demo usa Edge; el README recomienda Edge y dice que Chrome no se midió)
3. dependency-cruiser
4. Lote del parser (se queda `spike-parser-freeze`, cuyas cifras siguen siendo válidas)
5. Aviso en navegadores sin Web Speech

**No se recortan:** voz con confirmación explícita, sockets, las 2 bases de datos, reconexión, `local-agent` con Whisper y su balanceo, los microfrontends, `serve:web`, `quality.md` con cifras reales, al menos un ensayo y el video de respaldo.

## 10. Riesgos
El proyecto se presenta en vivo, con nosotros delante, el jue 19. Los riesgos principales ahora son el tiempo y lo que pueda fallar en la sala.

| Riesgo | Mitigación |
|---|---|
| **No se llega al hito del mié 11** (partida escrita en la nube) | Es lo primero que se vigila. El jue 12 por la mañana se aplican de una vez los recortes 1 a 4 de 9.7 |
| **El compañero entra después del lun 9** o tarda en ponerse al día | [docs/CONTEXT.md](docs/CONTEXT.md) y contrato ya escritos; pedirle que revise los PR #3 y #10 antes del lunes si puede. Si entra tarde, se aplica 9.7 desde ese día |
| Falla la red de la sala | Datos del celular como alternativa; video de respaldo. Web Speech y el backend necesitan internet |
| Instancia gratuita de Render dormida al empezar | Despertarla antes de la demo y comprobar `/health` |
| En la sala, el micrófono capta al otro jugador | Pulsar para hablar, diademas, **confirmación explícita**; ensayo con los dos hablando el mar 17 |
| El reconocedor falla delante del profesor (B acertó 87,2 % en el spike, con una voz: **alrededor de 1 de cada 8 frases puede fallar**) | Mostrarlo como parte del diseño: la confirmación evita jugadas erróneas y se repite la frase; caja de texto como respaldo; ensayar el guion con jugadas probadas |
| Whisper `small` tarda demasiado en la laptop de la demo (en un i5-12400F: p50 2,91 s) o el pool la satura | Medirlo en esa laptop el mar 17; correrlo en la laptop más potente; latencia declarada en la interfaz; es alternativa, no el reconocedor por defecto |
| El acceso de Edge a `127.0.0.1:8765` no funciona (solo se verificó con Chrome sin interfaz) | Probarlo el lun 16 con el adaptador real, no el día de la demo |
| Whisper transcribe algo con silencio o ruido | Umbral de volumen y duración; **confirmación explícita obligatoria**, así que nada se juega solo |
| El resultado de B no se repite con otra voz o con frases nuevas (una voz, una corrida, IC95 inferior de 78 %) | Validación del mar 17 con otra voz, frases nuevas y otra laptop; las cifras reales van a `quality.md` sin maquillar |
| Cambiar el parser invalida las cifras del spike | Un solo lote antes de la validación y se registra el hash del parser usado; si no da tiempo, se queda la versión `spike-parser-freeze` |
| Divergencia entre servidor y frontend | Contrato v0 de `shared/` versionado (`v: 1`), firmado el lun 9; cambios solo por PR revisado por los dos |
| Trabajo en solitario hasta el lun 9 sobre PR sin fusionar | Las ramas salen de `feat/game-room`; si la revisión del contrato cambia algo, se ajusta el lunes por la tarde |

## 11. Recomendaciones y objeciones
1. **Este calendario no tiene colchón.** Tiene tres puntos de control: **mié 11** (partida escrita en la nube), **vie 13** (partida por voz) y **lun 16** (congelación). Si uno falla, se recorta ese mismo día según 9.7, no al final.
2. **Pedir la revisión de los PR #3 y #10 antes del lun 9, si el compañero puede.** Son la base de todo lo demás y nadie aprueba su propio PR.
3. **El lote del parser es lo más prescindible del núcleo.** Mejora frases concretas, pero obliga a volver a medir y añade riesgo a tres días de la demo. Si el lun 16 hay cualquier duda, no se toca.
4. **La validación se reduce a 40 frases y medio día.** Antes eran 80 frases y dos días. Con menos frases el intervalo de confianza es más ancho, y `quality.md` debe decirlo. El mar 17 por la mañana se protege: sin esas cifras no se cumple un requisito que no se recorta.
5. **Pedir detalles de la demo al profesor esta semana** (ver 12): lo que responda cambia el guion y el montaje.
6. **Repositorio:** se llama `TWC-FINE/ChesssPeak` en GitHub. Renombrarlo a `chessspeak` queda como decisión del equipo. La carpeta local anidada se deja por ahora.
7. **No adoptar el N-best:** el spike lo midió y no mejora nada (+0,0 puntos). **Tampoco hay autoconfirmación.**

## 12. Preguntas abiertas
**Resueltas:**
- ✅ El agente Whisper en localhost **cuenta como módulo local**.
- ✅ Es aceptable que Web Speech use la nube de Google.
- ✅ **Fecha de entrega: jueves 19 de noviembre de 2026.**
- ✅ **La demo es en vivo.**

- ✅ **La documentación de arquitectura se hace con C4.**
- ✅ **El dominio se obtiene con DigitalPlat FreeDomain.**

**Pendientes para el profesor:** la lista completa, con la propuesta del modo de dictado para el balanceo (sin aprobar), está en [docs/proximos-pasos.md](docs/proximos-pasos.md).

**Para el equipo (se deciden el lun 9):**
- Roles A y B: según la comodidad de cada persona con NestJS o con el front y Lit.
- Responsable del lote de mejoras del parser.
- Si se trabajan los fines de semana (recomendado el 14–15) y el lunes festivo del 16.
