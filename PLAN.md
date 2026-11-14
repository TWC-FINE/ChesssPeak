# ChessSpeak — Plan del proyecto

> Última actualización: 14 de noviembre de 2026, con `main` en `08d3ccb`.
> **Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).** Con demo en vivo. Orden de trabajo en la sección 9.
> Equipo: **una persona trabaja sola, sin revisión de otra persona, y es la única que aprueba** (decisión del 6 de noviembre). Sigue sin definir quién aporta la otra voz, la segunda laptop de los ensayos y la máquina limpia del README.

## 1. Estado a 14 de noviembre de 2026
- **Spike cerrado el 2 de noviembre**, con los ADR 4 y 5 aceptados. Informe: [docs/spike-results.md](docs/spike-results.md) y [docs/spike-run-b.md](docs/spike-run-b.md).
- **Decisión:**
  - Reconocedor por defecto: **Web Speech en Edge, con un retardo de 400 ms entre soltar el botón y llamar a `stop()`** (requisito del producto).
  - **Whisper local, modelo `small` con prompt de ajedrez**, como alternativa seleccionable y módulo local, con su latencia declarada.
  - **Confirmación explícita obligatoria** con cualquier reconocedor.
- **Números clave** (split `test`, 78 frases de jugada): Web Speech sin retardo (A) 56,4 % de acierto; con retardo de 400 ms (B) **87,2 %** (IC95 78–93 %), 0 aceptaciones erróneas, 0 ambigüedad, latencia p50 0,57 s. Whisper `small` con prompt: 89,7 % pero p50 2,91 s y p95 3,06 s (solo inferencia, en un i5-12400F), por encima de los umbrales de latencia.
- **Las cifras pertenecen a la versión del parser de la etiqueta `spike-parser-freeze`.** Si el parser cambia, esas cifras ya no describen el producto (ver 5.7).
- **Salvedades:** una voz y una corrida B; no está demostrado que la mejora se deba solo al retardo; todo se midió en **Edge 156**. **Chrome no se midió** (hay una comprobación declarada en [docs/spike-chrome.md](docs/spike-chrome.md), pendiente). La validación con **otra voz, frases nuevas y otro equipo** se hace en el paso 6 del orden de trabajo (sección 9). La demo se hace en Edge, así que medir Chrome ya no bloquea nada.
- **En `main`:**
  - el contrato v1 de `shared/` y `GameRoom`;
  - los invitados con token firmado, `POST /games` y Socket.IO;
  - el guardado en Mongo con rehidratación, y la telemetría de voz (`voice_attempts`);
  - los 3 microfrontends reales, Web Speech con 400 ms y el adaptador de Whisper local;
  - `local-agent`, con un pool por procesos (ADR 10) y otro por URLs (ADR 12).
- **Desplegado el 8 de noviembre:** Render, Neon, Atlas y Vercel, en <https://chessspeak.vercel.app>.
- **Pruebas manuales con voz real:** Web Speech el 7 y el 8 de noviembre, y Whisper el 8, con una sola voz.
- **Balanceo de carga (requisito del profesor):** la decisión vigente es el [ADR 12](docs/adr/0012-whisper-como-servicio-con-pool-por-urls.md). Whisper es un servicio HTTP, balanceado por URLs desde `local-agent`.
  - **Medido** con 3 contenedores locales el 14 de noviembre: aislar un worker no perdió ninguna petición en 3 de 3 repeticiones. Todo corrió en un solo equipo.
  - **AWS EC2: preparado en `whisper-cloud/aws/`, sin probar.**
  - El pool de `move-workers` (ADR 11) no se construyó, y ese ADR quedó sustituido.
  - El análisis con Stockfish no pasó su prueba de viabilidad ([docs/analysis-gate.md](docs/analysis-gate.md)).
- **Falta:**
  - `docs/quality.md` con la validación;
  - el ADR 9 y el C4;
  - el README probado en una máquina limpia;
  - el ensayo, el video de respaldo y el tag.

  La lista ordenada está en [docs/proximos-pasos.md](docs/proximos-pasos.md).
- Lo que el spike deja por hacer está en [docs/spike-notes.md](docs/spike-notes.md) (sección 7), agrupado por área: **agente local**, **producto** y **CI y entrega**.

## 2. Qué es
Proyecto final de Arquitectura de Software: web de ajedrez donde las jugadas se dicen en voz alta en notación algebraica (en español). El sistema reconoce la frase, la resuelve contra las jugadas legales, pide confirmación y la aplica en la partida en tiempo real.

Fuera del núcleo (“Futuro”): chat de voz entre jugadores (WebRTC/TURN/señalización), análisis con Stockfish, inglés.

## 3. Cómo se entrega: demo en vivo
**La demo es en vivo** (5 de noviembre; reemplaza a la decisión anterior de “no hay demo en vivo”). Se supone que es el mismo día de la entrega (ver 12). **Sin definir:** hora y duración de la demo, y si el profesor abrirá el proyecto él mismo. Hay que preparar **una presentación que no falle**, y el README debe bastar por si lo abre él mismo.

- **Montaje de la demo:** dos laptops (la segunda, sin definir) con **Edge** (el navegador medido en el spike), diademas y la web en local con `pnpm serve:web` (`127.0.0.1:5500`), conectada al backend en Render. Servir en local evita el permiso de red local que puede bloquear a Whisper desde una página pública.
- **Mínimo garantizado:** la web publicada en Vercel con su URL `vercel.app`. La demo no lo necesita, pero ya no se recorta: es lo que queda publicado si no da tiempo al dominio. `vercel.json` ya existe.
- **Guion (criterios de aceptación de SPEC.md, sección 6):**
  1. Crear una partida y unirse desde la otra laptop.
  2. Jugar por voz con Web Speech, confirmando con flecha.
  3. Decir una frase ambigua o ilegible y ver que ninguna pieza se mueve.
  4. Desconectar un jugador y ver que la partida continúa al volver.
  5. Hacer una jugada con Whisper local.
  6. Mostrar el balanceo (ADR 12): los 3 contenedores con `WHISPER_URLS` y el dashboard (`/lb/dashboard`), aislando y devolviendo un worker. Si falla Docker, la salida es `LB_WORKERS=3` con el botón «Matar».
  7. Enseñar `game_moves` y `voice_attempts` en Mongo, y `games` en Postgres.
  8. Terminar la partida (se puede partir de una posición cercana al mate o usar el abandono).
- **Respaldos:** la **caja de texto** si falla el micrófono o el reconocedor, datos del celular si falla la red de la sala y el **video de respaldo** si falla todo lo demás.
- **Antes de empezar la demo:** despertar Render y comprobar `/health`, y probar los micrófonos. Arrancar `local-agent`; si se va a mostrar el balanceo, arrancar antes Docker Desktop y los 3 contenedores.
- **Reproducibilidad:** el README es necesario (repo público y criterio 7 de SPEC.md) y su prueba nunca se recorta. Se comprueba con un **clon nuevo en una máquina limpia**, siguiendo solo el README. Para instalar Whisper se reutiliza `pnpm --filter @chessspeak/spike-whisper-local download`.
- La aplicación avisa si el navegador no tiene Web Speech (Firefox) y ofrece Whisper local o la caja de texto. Es poco trabajo, pero en la demo no se usa, por eso entra en el orden de recorte (9.2).

## 4. Requisitos del profesor y cómo se cumplen
| Requisito | Cómo se cumple |
|---|---|
| Desplegado en la nube | Backend NestJS en Render, Postgres en Neon, Mongo en Atlas M0. Web estática publicada en Vercel con su URL `vercel.app`, mínimo garantizado (la demo la sirve en local) |
| Módulo local | `local-agent` (Node + TS) en la laptop de la demo; envuelve `whisper-server` (whisper.cpp) en `http://127.0.0.1:8765`. **El profesor confirmó que cuenta como módulo local** |
| Sockets | Socket.IO: partida en tiempo real (un único socket, abierto por el shell) |
| Cámara o micrófono | Micrófono: jugadas por voz (Web Speech API o Whisper local). **El profesor confirmó que es aceptable que Web Speech use la nube de Google** |
| Mínimo 2 bases de datos | Postgres (`games`, y `users` si se hace el login) + Mongo (`game_moves`, `voice_attempts`) |
| 100% en GitHub | Repo público `chessspeak`, GPL-3.0, ramas por feature con PR, CI |
| Microfrontends | 3 custom elements independientes (`<mf-game>`, `<mf-voice-input>`, `<mf-history>`) que conviven en un index servido como web estática |
| Balanceo de carga sobre un proceso crítico | Whisper como servicio, balanceado por URLs desde `local-agent` ([ADR 12](docs/adr/0012-whisper-como-servicio-con-pool-por-urls.md)). Se midió con 3 contenedores locales, y el pool por procesos (ADR 10) queda como salida. AWS EC2 sigue sin probar. **Cumplimiento sin confirmar:** todo lo medido corre en un solo equipo |

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
  web/dist/               salida única de `pnpm build:web` (supuesto: se commitea en el commit de entrega, solo al congelar el código)
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
- **5 de noviembre:** un **borrador mínimo y versionado** (campo `v: 1`) en un **PR abierto**. Mínimo: lo imprescindible para trabajar por separado en el servidor y en la web.
- **Aprobación:** sin firma. Lo aprueba el responsable del repo, único aprobador, al fusionar el PR #3 (decisión del 6 de noviembre).
- Incluye:
  - eventos del socket (cliente → servidor y servidor → cliente) con schemas zod;
  - eventos `cs:*` entre microfrontends;
  - tipos de contexto que reciben los microfrontends.
- Cualquier cambio posterior va en un PR, lo aprueba el responsable del repo y sube la versión.

### 5.7 Entrada por voz
Decidida por el spike (ADR [4](docs/adr/0004-resolucion-contra-jugadas-legales.md) y [5](docs/adr/0005-strategy-y-reconocedor-por-defecto.md)).
- **Idea clave:** resolver contra las jugadas legales (chessops). Se genera la forma hablada de cada jugada legal y se elige la más parecida a lo reconocido, con umbral, margen y detección de ambigüedad. Resultado: `move | ambiguous | nomatch | command`.
- **Flujo:** mantener pulsado para hablar → **retardo de 400 ms tras soltar** → reconocimiento → normalización → resolución → **confirmación explícita obligatoria** (flecha en el tablero, chessground en `viewOnly`; sí/no/cancelar) → `game:move` en UCI. No hay autoconfirmación: contradice el ADR 5.
- **`SpeechRecognizer` (patrón Strategy):** adaptadores Web Speech (por defecto), Whisper local (módulo local), Fake (tests) y caja de texto de respaldo.
- **Idioma:** `es-CO` (el medido en el spike). **N-best: no se adopta** (ganancia 0,0 puntos).
- **Vocabulario (español):** piezas; letras con alias (be/ve, ce/se, ge/je); coordenadas (“e2 e4”); “toma”; enroque corto/largo; “corona a dama”; comandos sí/no/cancelar. Alfabeto OTAN e inglés, fuera del plan.
- **voice-parser:** TS puro con tests en Vitest, ya existente. **Las cifras del spike pertenecen a la versión de la etiqueta `spike-parser-freeze`.** **El lote de mejoras queda fuera del plan:** el parser no se modifica. La validación usa **frases nuevas** y **registra el hash del parser usado**. **Las 40 frases de validación las escribe el responsable del repo**, en lugar de las 80 del corpus v1 previsto: el intervalo de confianza será más ancho y se declara así. La sesión puede usar el arnés de `spike/web-speech` y `pnpm metrics` si la app aún no registra `expectedUci`.
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
- **Modo por URLs (ADR 12):** con `WHISPER_URLS`, el agente balancea workers que ya están en marcha, por ejemplo los 3 contenedores de `whisper-cloud/compose.local.yml`, en lugar de arrancar procesos.

## 6. Calidad y convenciones
- Tests: Jest en `server`; Vitest en `shared`, `voice-parser` y `web`. Sin fast-check.
- **CI inicial (Fase 0): solo lint y gitleaks.** Tests en CI cuando existan. El `pnpm install` debe terminar con código 0 (ver `ERR_PNPM_IGNORED_BUILDS` en [docs/spike-notes.md](docs/spike-notes.md)).
- **dependency-cruiser después** (Fase 3, solo si hay tiempo; ver 9.2), con 3 reglas:
  1. Los `web/mf-*` no se importan entre sí (solo `shared`).
  2. `voice-parser` no importa DOM, Nest ni `web`.
  3. `GameRoom` no importa `@nestjs/*`.
- Código y commits en inglés; interfaz en español. Ramas por feature con PR.
- Nombre: **ChessSpeak**. El repositorio en GitHub se llama hoy **`TWC-FINE/ChesssPeak`** y el remoto local apunta a él. La carpeta local anidada `ChesssPeak/ChesssPeak` se deja por ahora. Fuera de esos dos casos, “ChessPeak” y “ChesssPeak” son errores.

### 6.1 Escenarios de atributos de calidad (`docs/quality.md`)
Formato: fuente, estímulo, entorno, respuesta y medida. Las cifras salen del spike y de la sesión de evaluación; **no se inventan**.

| Atributo | Escenario | Medida |
|---|---|---|
| Precisión de voz (usabilidad) | Un jugador dice una jugada legal del corpus | Acierto top-1, aceptación errónea y ambigüedad, por reconocedor, con otra voz y frases nuevas, **con el hash del parser usado** |
| Rendimiento (voz) | El jugador suelta el botón | p50/p95 de `totalMs` (desglose en `recognitionMs` y `resolveMs`), con Web Speech (incluye los 400 ms) y con Whisper |
| Rendimiento (partida) | Un jugador confirma una jugada | Tiempo hasta que el rival la ve (p50/p95) |
| Disponibilidad / recuperación | Un jugador pierde la conexión a mitad de la partida | Tiempo de reconexión y jugadas perdidas (objetivo: 0) |
| Seguridad | Un cliente intenta jugar por otro o abusa de `/auth/guest` | Rechazo por identidad del servidor; 429 del throttler |
| Modificabilidad | Añadir un reconocedor nuevo | Archivos tocados: solo un adaptador nuevo (ni parser ni servidor) |
| Reproducibilidad | Un clon nuevo en una máquina limpia, siguiendo solo el README | Pasos del README hasta abrir la app y jugar una jugada por voz; fallos encontrados |

## 7. ADRs
Media página cada uno, **escritos cuando se toma la decisión**, no al final.
| ADR | Decisión | Estado |
|---|---|---|
| 1 | Monolito modular NestJS en TypeScript, con los contratos en `shared/` | **Aceptado** (2 nov) |
| 2 | Microfrontends con custom elements + web estática (sin Module Federation) | **Aceptado** (2 nov) |
| 3 | Dos bases: Postgres (partidas) y Mongo (jugadas append-only y telemetría) | **Aceptado** (3 nov) |
| 4 | Resolución de voz contra jugadas legales + criterios del spike | **Aceptado** (2 nov) |
| 5 | `SpeechRecognizer` como Strategy; reconocedor por defecto (Web Speech en Edge con retardo de 400 ms; Whisper `small` alternativo) | **Aceptado** (2 nov) |
| 6 | `local-agent` por HTTP en localhost frente a WebSocket saliente | **Aceptado** (6 nov). Probado a mano con el Whisper real el 8 nov, con una sola voz |
| 7 | Estado en memoria + write-behind idempotente | **Aceptado** (5 nov) |
| 8 | Invitados con token firmado; login fuera del plan | **Aceptado** (5 nov) |
| 9 | Licencia GPL-3.0 (por chessground) | **Sin escribir** |
| 10 | Balanceo de carga de la transcripción en `local-agent` | **Aceptado** (4 nov); revisado el 5 nov. Queda como salida del ADR 12 |
| 11 | Balanceo del guardado de jugadas con `move-workers` | **Sustituido por el ADR 12** (14 nov); el pool nunca se construyó |
| 12 | Whisper como servicio, balanceado por URLs desde `local-agent` | **Aceptado** (14 nov). Medido con contenedores locales; EC2 sin probar |

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

## 9. Orden de trabajo

**Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).** La prioridad es este orden de trabajo, no un calendario por días.

### 9.1 Orden
1. ✅ **Fusionar la cadena** #3 y #10 a #14 y el PR de `docs/delivery-nov-19`.
2. ✅ **Despliegue** en Render, Neon, Atlas y Vercel (8 de noviembre, #34).
3. ✅ **Voz de punta a punta:** Web Speech `es-CO` con 400 ms, `voice:attempt` y `voice_attempts`, y `<mf-history>` real (#25 a #28). Probada a mano con una sola voz.
4. ✅ **Adaptador de Whisper local** (#29). Probado a mano el 8 de noviembre.
5. ✅ **Balanceo:** el ADR 12 sustituye al pool de `move-workers`. Pool por URLs (#41), criterio (#43) y medición con 3 contenedores locales (#44). **EC2** está preparado (#46) y **sin probar**: es opcional y lo primero que se recorta.
6. **Cierre (pendiente):**
   - validación con otra voz; sin otra voz, se hace con la del responsable del repo y se declara en `docs/quality.md`;
   - C4 niveles 1 y 2;
   - README probado en una máquina limpia;
   - ensayo y tag.

### 9.2 Recortes
**Nunca se recorta:** voz, despliegue y README probado.

**Si algo se atrasa, se avisa al responsable del repo** y se recorta primero, en este orden:
1. Experimento en AWS EC2: el balanceo se demuestra con los contenedores locales.
2. Dashboard integrado: no se hace; queda `/lb/dashboard` de `local-agent` para la demo.
3. Medición en Chrome (la demo usa Edge; el README recomienda Edge y dice que Chrome no se midió).
4. Repetición de la carga de Whisper.

Después: dependency-cruiser y el aviso en navegadores sin Web Speech.

**Fuera del plan:** el lote del parser (queda `spike-parser-freeze`, cuyas cifras siguen siendo válidas), `speechSynthesis`, login/registro, alfabeto OTAN, pestaña Precisión y la corrida con un modelo cuantizado.

**Consecuencias, si se llegara a recortar** (también en `SPEC.md`):
- **Si se recorta el experimento en EC2:** el balanceo queda demostrado solo con contenedores en un mismo equipo (ADR 12), y hay que decirlo al presentar.
- El pool de `move-workers` y el adaptador de Whisper ya no son recortables: el primero se sustituyó por el ADR 12, y el segundo está hecho (#29).

### 9.3 Fases
| Fase | Qué incluye | Estado |
|---|---|---|
| **Spike** | Web Speech + chessops, Whisper, decisión y ADR 4 y 5 | ✅ Cerrado |
| **Fase 0 — Fundaciones** | Monorepo, esqueletos, shell y 3 proyectos Vite, `serve:web`, CI y despliegue en Neon, Atlas, Render y Vercel | ✅ Desplegado el 8 de noviembre |
| **Fase 1 — Partida entre invitados** | Auth de invitados, Socket.IO, `games` y write-behind, shell con sesión, `<mf-game>`, caja de texto → parser → jugada, `local-agent` | ✅ En `main` y desplegada |
| **Fase 2 — Voz de punta a punta** | Reconexión y fin de partida, `voice-metrics`, `<mf-voice-input>` (Web Speech con 400 ms, Whisper), confirmación explícita, `<mf-history>` | ✅ En `main`. Voz real probada a mano, con una sola voz |
| **Fase 3 — Validación, ensayo y entrega** | Validación (con el hash del parser), `quality.md`, ensayo, video de respaldo, README probado, tag | **En curso:** solo el balanceo (ADR 12) está medido; lo demás falta |

## 10. Riesgos
El proyecto se presenta en vivo, en la fecha de entrega. Los riesgos principales ahora son el tiempo y lo que pueda fallar en la sala.

| Riesgo | Mitigación |
|---|---|
| **Se atrasa un paso del orden de trabajo** | Se avisa al responsable del repo y se recorta según 9.2, en ese momento y no al final |
| **Una sola persona, sin revisión independiente** | Cada trabajo de CI se revisa por separado antes de fusionar |
| Falla la red de la sala | Datos del celular como alternativa; video de respaldo. Web Speech y el backend necesitan internet |
| Instancia gratuita de Render dormida al empezar | Despertarla antes de la demo y comprobar `/health` |
| En la sala, el micrófono capta al otro jugador | Pulsar para hablar, diademas, **confirmación explícita**; ensayo con dos voces (sin definir quién aporta la otra) |
| El reconocedor falla delante del profesor (B acertó 87,2 % en el spike, con una voz: **alrededor de 1 de cada 8 frases puede fallar**) | Mostrarlo como parte del diseño: la confirmación evita jugadas erróneas y se repite la frase; caja de texto como respaldo; ensayar el guion con jugadas probadas |
| Whisper `small` tarda demasiado en la laptop de la demo (en un i5-12400F: p50 2,91 s) o el pool la satura | Medirlo en esa laptop antes del ensayo; correrlo en la laptop más potente; latencia declarada en la interfaz; es alternativa, no el reconocedor por defecto |
| El acceso de Edge a `127.0.0.1:8765` falla en la laptop de la demo. Se probó a mano el 8 de noviembre en la web local y en la pública, y funcionó; no consta si apareció el aviso de red local | Repetirlo en la laptop de la demo antes del ensayo, no el día de la demo |
| Whisper transcribe algo con silencio o ruido | Umbral de volumen y duración; **confirmación explícita obligatoria**, así que nada se juega solo |
| El resultado de B no se repite con otra voz o con frases nuevas (una voz, una corrida, IC95 inferior de 78 %) | Validación con otra voz, frases nuevas y otra laptop (sin definir quién aporta la voz ni de dónde sale la laptop); las cifras reales van a `quality.md` sin maquillar |
| Cambiar el parser invalida las cifras del spike | El parser queda en `spike-parser-freeze`, sin lote de mejoras; se registra el hash usado |
| Divergencia entre servidor y frontend | Contrato v0 de `shared/` versionado (`v: 1`); cambios solo por PR aprobado por el responsable del repo |
| El profesor no acepta como balanceo real los contenedores en un solo equipo (ADR 12), igual que cuestionó los procesos locales (revisión del ADR 10) | Decirlo al presentar y mostrar lo medido. **EC2 está preparado pero sin probar** |
| La demo del balanceo depende de Docker Desktop | Arrancarlo antes de la demo. Si falla, usar el pool por procesos (`LB_WORKERS=3`), que no necesita Docker |

## 11. Recomendaciones y objeciones
1. **Manda el orden de trabajo de 9.1.** Si un paso se atrasa, se recorta según 9.2 en ese momento, no al final.
2. **Sin revisión de otra persona.** El responsable del repo aprueba los PR #3 y #10 a #14, la base de todo lo demás, después de revisar por separado cada trabajo de CI.
3. **El lote del parser queda fuera.** Se queda `spike-parser-freeze`, cuyas cifras siguen siendo válidas, y no hay que volver a medir por ese cambio.
4. **La validación se reduce a 40 frases.** Antes eran 80. Con menos frases el intervalo de confianza es más ancho, y `quality.md` debe decirlo. Se protege: sin esas cifras no se cumple un requisito que no se recorta.
5. **Los detalles de la demo son supuestos** (ver 12): no hay confirmación del profesor sobre ellos, así que se prepara también una versión corta del guion.
6. **Repositorio:** se llama `TWC-FINE/ChesssPeak` en GitHub. Renombrarlo a `chessspeak` queda como decisión del responsable del repo. La carpeta local anidada se deja por ahora.
7. **No adoptar el N-best:** el spike lo midió y no mejora nada (+0,0 puntos). **Tampoco hay autoconfirmación.**

## 12. Preguntas abiertas y supuestos
**Resueltas:**
- ✅ El agente Whisper en localhost **cuenta como módulo local**.
- ✅ Es aceptable que Web Speech use la nube de Google.
- ✅ **La demo es en vivo.**

- ✅ **La documentación de arquitectura se hace con C4.**
- ✅ **El dominio se obtiene con DigitalPlat FreeDomain.**

**Supuestos:** lo que sigue abierto se decide con supuestos, porque no hay confirmación del profesor sobre esos puntos. Si confirma alguno, se corrige aquí. La lista completa está en [docs/proximos-pasos.md](docs/proximos-pasos.md).

- **Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).**
- **Despliegue:** Render, Neon y Atlas.
- **Dominio:** en espera del profesor, que debe agregarlo en el hosting (ADR 11). Mínimo garantizado: la web publicada en Vercel con su URL `vercel.app`.
- **`web/dist`:** en el commit de entrega, solo al congelar el código.
- **Chrome:** sigue como recorte (ver 9.2).

**Sin definir:**
- Hora y duración de la demo, y si el profesor abrirá el proyecto él mismo.
- Quién aporta la otra voz para la validación. Sin otra voz, se valida con la del responsable del repo y se declara en `docs/quality.md`.
- De dónde sale la segunda laptop, para medir la latencia de Whisper y para los ensayos.
- Cuál es la máquina limpia para probar el README. Windows Sandbox es una opción sin probar; sus límites están en `docs/HANDOFF.md`.
