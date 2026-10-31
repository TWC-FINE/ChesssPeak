# ChessSpeak — Plan del proyecto

> Última actualización: sábado 31 de octubre de 2026.
> Entrega supuesta: viernes 27 de noviembre de 2026 (**por confirmar**).
> Equipo: A (servidor + voice-parser) y B (shell, microfrontends y adaptadores de reconocimiento). El `local-agent` y la integración de voz se hacen entre los dos.

## 1. Qué es
Proyecto final de Arquitectura de Software: web de ajedrez donde las jugadas se dicen en voz alta en notación algebraica (en español). El sistema reconoce la frase, la resuelve contra las jugadas legales, pide confirmación y la aplica en la partida en tiempo real.

Fuera del núcleo (“Futuro”): chat de voz entre jugadores (WebRTC/TURN/señalización), análisis con Stockfish, inglés.

## 2. Requisitos del profesor y cómo se cumplen
| Requisito | Cómo se cumple |
|---|---|
| Desplegado en la nube | Backend NestJS en Render, Postgres en Neon, Mongo en Atlas M0. Web estática en Vercel (deseable, no la necesita la demo) |
| Módulo local | `local-agent` (Node + TS) en la máquina del estudiante; envuelve `whisper-server` (whisper.cpp) en `http://127.0.0.1:8765` |
| Sockets | Socket.IO: partida en tiempo real (un único socket, abierto por el shell) |
| Cámara o micrófono | Micrófono: jugadas por voz (Web Speech API o Whisper local) |
| Mínimo 2 bases de datos | Postgres (`games`, y `users` si se hace el login) + Mongo (`game_moves`, `voice_attempts`) |
| 100% en GitHub | Repo público `chessspeak`, GPL-3.0, ramas por feature con PR, CI |
| Microfrontends | 3 custom elements independientes (`<mf-game>`, `<mf-voice-input>`, `<mf-history>`) que conviven en un index servido con Live Server |

## 3. Arquitectura

### 3.1 Monorepo (pnpm workspaces)
```
ChessSpeak/
  shared/                 @chessspeak/shared: protocolo del socket (zod), eventos cs:*, tipos de contexto
  packages/voice-parser/  @chessspeak/voice-parser: TS puro, sin DOM
  server/                 @chessspeak/server: NestJS, monolito modular
  web/shell/              index.html + TS vanilla (router por hash, sesión, único socket)
  web/mf-game/            proyecto Vite (Lit, light DOM)
  web/mf-voice-input/     proyecto Vite
  web/mf-history/         proyecto Vite
  web/dist/               salida única de `pnpm build:web` (se commitea solo en la entrega)
  local-agent/            @chessspeak/local-agent: Node + TS
  docs/adr/               ADRs de media página
  docs/quality.md         escenarios de atributos de calidad con cifras medidas
```

### 3.2 Backend (NestJS, monolito modular)
- Módulos: `auth` (invitados; login opcional), `games`, `voice-metrics`, `health`. `analysis` opcional; sin `signaling`.
- Estado de partida en memoria: clase `GameRoom` pura (sin Nest). Se actualiza de forma síncrona antes de cualquier `await`.
- Persistencia por jugada en Mongo (write-behind), idempotente: `updateOne({gameId, plyCount: ply-1}, {$push, $inc: {plyCount: 1}})`. Rehidratación desde Mongo al reconectar.
- El servidor valida la jugada (UCI) y **no sabe de voz**.
- Una sola instancia en Render (no hace falta sticky session).

### 3.3 Datos
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
| `lang` | Código de idioma usado (p. ej. `es-CO`) |
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

### 3.4 Autenticación y seguridad
- Invitados con token firmado (sin fila en `users`); **con esto basta para la demo**. La identidad siempre la decide el servidor.
- Login/registro (JWT propio + bcrypt): **opcional**, al final, solo si hay tiempo.
- `@nestjs/throttler` en `/auth/guest` (y en `/auth/login` si se hace), con `trust proxy` en Render.
- Atlas con `0.0.0.0/0`, mitigado con un usuario de mínimos privilegios y contraseña fuerte.
- Secretos solo en `.env`, con `.env.example` en el repo; gitleaks en CI.
- CORS (HTTP y Socket.IO): `http://127.0.0.1:5500`, `http://localhost:5500` y el dominio de Vercel.

### 3.5 Microfrontends
- Cada microfrontend es un custom element (Lit en light DOM) en su propio proyecto Vite y tiene su página standalone con contexto simulado.
- Todos conviven en el index del shell, servido con Live Server en el puerto fijo 5500. No se exigen despliegues independientes; Module Federation descartado.
- Contexto por propiedad (`el.context`). Mínimo privilegio: solo `<mf-game>` recibe el socket; la telemetría de voz la reenvía el shell.
- Comunicación con CustomEvent tipados con prefijo `cs:`, definidos en `shared/`.
- Sin Shadow DOM: CSS plano con prefijo por microfrontend y tokens compartidos.
- La pestaña “Precisión” de `<mf-history>` (una tabla) es **opcional**.

### 3.6 Contrato v0 de `shared/`
Lo firman A y B el **jue 5 nov** (PR aprobado por los dos) antes de que cada uno trabaje por separado. Incluye:
- eventos del socket (cliente → servidor y servidor → cliente) con schemas zod;
- eventos `cs:*` entre microfrontends;
- tipos de contexto que reciben los microfrontends.

Cualquier cambio posterior va en un PR revisado por los dos.

### 3.7 Entrada por voz
- **Idea clave:** resolver contra las jugadas legales (chessops). Se genera la forma hablada de cada jugada legal y se elige la más parecida a lo reconocido, con umbral, margen y detección de ambigüedad. Resultado: `move | ambiguous | nomatch | command`.
- **Flujo:** mantener pulsado para hablar → reconocimiento → normalización → resolución → confirmación explícita (flecha en el tablero, chessground en `viewOnly`) → `game:move` en UCI.
  - La autoconfirmación con confianza alta (cancelable) es **opcional**.
- **`SpeechRecognizer` (patrón Strategy):** adaptadores Web Speech API (inicial), Whisper local (módulo local), Fake (tests) y caja de texto de respaldo.
- **Vocabulario (español):** piezas; letras con alias (be/ve, ce/se, ge/je); alfabeto OTAN opcional; coordenadas (“e2 e4”); “toma”; enroque corto/largo; “corona a dama”; comandos sí/no/cancelar. Variante del español por confirmar (código exacto para Web Speech). Inglés opcional, más adelante.
- **voice-parser:** TS puro con tests en Vitest. El prototipo sale del spike y se refina en la semana 3 contra el **corpus v1 de 80 frases**, que **escriben los dos** (40 cada uno).
- Opcional: anunciar la jugada del rival con `speechSynthesis`.

### 3.8 Módulo local (núcleo obligatorio)
- `local-agent` (Node + TS) envuelve `whisper-server`. El navegador lo llama en `http://127.0.0.1:8765` (CORS + cabecera de acceso a red privada).
- El binario y el modelo quedan fuera del repo; sus rutas van en `.env`.
- Umbral mínimo de volumen y de duración antes de transcribir (evita que Whisper alucine con silencio o ruido).
- Modelo `base` por defecto; `small` si `base` se queda corto en acierto.
- Alternativa documentada en un ADR: agente con WebSocket saliente hacia el servidor.

## 4. Calidad y convenciones
- Tests: Jest en `server`; Vitest en `shared`, `voice-parser` y `web`. Sin fast-check.
- **CI inicial (Fase 0): solo lint y gitleaks.** Tests en CI cuando existan.
- **dependency-cruiser después** (semana 4), con 3 reglas:
  1. Los `web/mf-*` no se importan entre sí (solo `shared`).
  2. `voice-parser` no importa DOM, Nest ni `web`.
  3. `GameRoom` no importa `@nestjs/*`.
- Código y commits en inglés; interfaz en español. Ramas por feature con PR.
- Nombre: **ChessSpeak**. Carpeta `ChessSpeak/`, repo `chessspeak`, paquetes `@chessspeak/*`. “ChessPeak” y “ChesssPeak” son errores (la carpeta local actual `ChesssPeak` hay que renombrarla).

### 4.1 Escenarios de atributos de calidad (`docs/quality.md`)
Formato: fuente, estímulo, entorno, respuesta y medida. Las cifras salen del spike y de la medición de la semana 4; **no se inventan**.

| Atributo | Escenario | Medida |
|---|---|---|
| Precisión de voz (usabilidad) | Un jugador dice una jugada legal del corpus | Acierto top-1, aceptación errónea y ambigüedad, por reconocedor |
| Rendimiento (voz) | El jugador suelta el botón | p50/p95 de `totalMs` (desglose en `recognitionMs` y `resolveMs`) |
| Rendimiento (partida) | Un jugador confirma una jugada | Tiempo hasta que el rival la ve (p50/p95) |
| Disponibilidad / recuperación | Un jugador pierde la conexión a mitad de la partida | Tiempo de reconexión y jugadas perdidas (objetivo: 0) |
| Seguridad | Un cliente intenta jugar por otro o abusa de `/auth/guest` | Rechazo por identidad del servidor; 429 del throttler |
| Modificabilidad | Añadir un reconocedor nuevo | Archivos tocados: solo un adaptador nuevo (ni parser ni servidor) |

## 5. ADRs
Media página cada uno, **escritos cuando se toma la decisión**, no al final.
| ADR | Decisión | Cuándo se escribe |
|---|---|---|
| 1 | Monolito modular NestJS | Fase 0 (mié 4) |
| 2 | Microfrontends con custom elements + Live Server (sin Module Federation) | Fase 0 (mié 4) |
| 3 | Dos bases: Postgres (partidas) y Mongo (jugadas append-only y telemetría) | Fase 0 (jue 5) |
| 4 | Resolución de voz contra jugadas legales + criterios del spike | Cierre del spike |
| 5 | `SpeechRecognizer` como Strategy; reconocedor por defecto | Cierre del spike |
| 6 | `local-agent` por HTTP en localhost frente a WebSocket saliente | Jue 12 |
| 7 | Estado en memoria + write-behind idempotente | Semana 2 |
| 8 | Invitados con token firmado; login opcional | Semana 2 |
| 9 | Licencia GPL-3.0 (por chessground) | Fase 0 (al crear el repo) |

## 6. Spike (1–2 días) — PENDIENTE, atrasado
Debía empezar el jueves 29 de octubre. Objetivo: validar Web Speech + chessops antes de comprometer el diseño.

**Preparación de Whisper:** primero se prueba un **binario precompilado de whisper.cpp para Windows**, con los modelos `base` y `small` **ya descargados** antes del spike. Solo se compila si el binario precompilado falla.

**Qué se mide:** acierto, aceptación errónea, ambigüedad, latencia p50/p95 (desde soltar el botón hasta la propuesta), si el N-best ayuda, y Whisper `base`/`small` con clips de silencio y ruido.

**Criterios propuestos (hay que fijarlos antes de medir; no se cambian después):**
| Métrica | Umbral para seguir con Web Speech por defecto |
|---|---|
| Acierto top-1 en frases válidas | ≥ 85 % |
| Aceptación errónea | ≤ 2 % |
| Ambigüedad | ≤ 10 % |
| Latencia | p50 ≤ 1,5 s; p95 ≤ 3 s |
| Silencio/ruido | 0 jugadas aceptadas |
| N-best | Se adopta solo si sube el acierto ≥ 5 puntos sin aumentar la aceptación errónea |

**Decisión:**
- Si se cumplen los umbrales, se sigue con el diseño.
- Si el acierto queda entre 70 % y 85 %, se refuerzan los alias y el modo coordenadas.
- Si queda por debajo del 70 %, se revisa el enfoque y se registra en un ADR.

## 7. Calendario (recalculado desde el sáb 31 oct)

### 7.1 Estado de lo que debía estar hecho
| Ítem | Estado |
|---|---|
| Spike (desde el jue 29 oct) | ⚠️ Pendiente, atrasado |
| Fase 0 (fundaciones) | ⚠️ Pendiente, atrasada |

### 7.2 Escenarios de capacidad
Días de trabajo por persona entre el lun 2 y el jue 26 (el vie 27 es la entrega):
| | Se trabajan los festivos (lun 2 y lun 16) | No se trabajan los festivos |
|---|---|---|
| **Sin fines de semana** | **Escenario base:** 19 días | 17 días: el calendario se corre (ver 7.4) |
| **Con fines de semana** | 27 días: base + bloques de fin de semana (ver 7.5) | 25 días: 7.4 + bloques de fin de semana |

Regla: los fines de semana o se planifican con tareas concretas (7.5) o no cuentan. No hay trabajo “si sobra tiempo”.

### 7.3 Escenario base: días hábiles con festivos trabajados, sin fines de semana

**Semana 1 · lun 2 – vie 6 nov · Spike y Fase 0**
| Fecha | A | B |
|---|---|---|
| Hasta el dom 1 (sin planificar) | — | — |
| Lun 2 (festivo) | **Spike:** prototipo del parser con chessops, métricas | **Spike:** arnés Web Speech, clips (incluidos silencio y ruido), whisper.cpp precompilado con `base`/`small` |
| Mar 3 | Cierre del spike → decisión, ADR 4 y ADR 5 | Cierre del spike → decisión, ADR 4 y ADR 5 |
| Mié 4 | **Fase 0:** monorepo pnpm, `shared/`, esqueleto Nest + `health` | **Fase 0:** shell estático, 3 proyectos Vite, `build:web` → `web/dist` |
| Jue 5 | Prisma/Neon (`games`), Mongoose/Atlas, `.env.example` · **juntos: contrato v0 de `shared/` firmado** | Live Server 5500, páginas standalone con contexto simulado · **juntos: contrato v0** |
| Vie 6 | Despliegue en Render, CORS | CI con lint + gitleaks |

**Hito vie 6:** `health` desplegado; shell con los 3 microfrontends vacíos; CI en verde; contrato v0 firmado.

**Semana 2 · lun 9 – vie 13 nov · Fase 1 (partida entre invitados) y local-agent**
| Fecha | A | B |
|---|---|---|
| Lun 9 – Mié 11 | **Fase 1:** auth de invitados + throttler, `GameRoom` + tests, gateway Socket.IO, `games` en Postgres, write-behind idempotente en Mongo | **Fase 1:** shell con sesión, router y socket único; `<mf-game>` (chessground viewOnly); adaptador de caja de texto → parser → `game:move` |
| Jue 12 – Vie 13 | **`local-agent` básico:** servicio HTTP que transcribe un WAV con whisper-server; CORS y acceso a red privada verificados desde 5500; ADR 6 | `<mf-history>` (lista de jugadas), eventos `cs:` de punta a punta, adaptador Web Speech |
| Toda la semana | Corpus v1: 40 frases | Corpus v1: 40 frases |

**Hito vie 13:** dos invitados juegan escribiendo jugadas, desplegado en la nube; `local-agent` transcribe un WAV; corpus v1 completo (80 frases).

**Semana 3 · lun 16 – vie 20 nov · Fase 2 (voz de punta a punta)**
| Fecha | A | B |
|---|---|---|
| Lun 16 (festivo) – Vie 20 | **Fase 2 del servidor (5 días):** reconexión y rehidratación, fin de partida (mate, ahogado, tablas, abandono), `voice-metrics` (ingesta de `voice_attempts` con `player` puesto por el servidor), endurecimiento de la validación | `<mf-voice-input>` (pulsar para hablar), confirmación explícita con flecha y sí/no/cancelar, telemetría vía shell, **adaptador Whisper en el navegador probado contra `local-agent`** (umbral de volumen y duración) |
| Mié 18 – Vie 20 | Revisión de los PR del parser | **Refinamiento del parser contra el corpus** (primera pasada; A revisa; ver objeción 2) |

**Hito vie 20:** partida completa por voz con Web Speech en la nube; una jugada por voz con Whisper local desde el navegador; la reconexión funciona.

**Semana 4 · lun 23 – vie 27 nov · Pulido y medición**
| Fecha | Juntos |
|---|---|
| Lun 23 – Mar 24 | Sesión de evaluación con el corpus (`expectedUci`), con los dos reconocedores → cifras reales en `docs/quality.md`; dependency-cruiser (3 reglas) en CI; corrección de errores. Opcionales solo si todo está en verde: autoconfirmación, pestaña Precisión, login/registro, speechSynthesis |
| Mié 25 | **Congelación de funcionalidades.** Ensayo de la demo con dos laptops y diademas, los dos hablando a la vez. **Grabación del video de respaldo de la demo** |
| Jue 26 | README e instrucciones del `local-agent`; repaso de los ADRs y de `quality.md`. Commit de entrega con `web/dist` y tag `v1.0` |
| Vie 27 | **Entrega y demo** (despertar Render antes de empezar) |

### 7.4 Si no se trabajan los festivos (17 días)
- **Lun 2:** el spike se reduce a 1 día (mar 3): Web Speech + chessops y una prueba corta del binario de Whisper. La decisión se toma el mar 3 por la tarde. La Fase 0 se queda en mié 4 – vie 6.
- **Lun 16:** la Fase 2 del servidor pasa a mar 17 – vie 20 + lun 23. La medición para `quality.md` se queda en el mar 24 y los opcionales salen del plan.

### 7.5 Si se trabajan los fines de semana (bloques fijos)
| Fin de semana | Tarea | Qué libera |
|---|---|---|
| Sáb 31 – Dom 1 | Spike días 1–2 | El lun 2 y el mar 3 quedan para cerrar el spike con calma y adelantar la Fase 0 |
| Sáb 7 – Dom 8 | Corpus v1 (40 frases cada uno) | Semana 2 sin tareas de corpus |
| Sáb 14 – Dom 15 | Refinamiento del parser (A) | Devuelve el parser a A y descarga a B en la semana 3 (resuelve la objeción 2) |
| Sáb 21 – Dom 22 | Primera sesión de evaluación con el corpus | La semana 4 gana un día de colchón |

### 7.6 Orden de recorte si hay retraso
1. speechSynthesis
2. Vercel
3. login/registro
4. alfabeto OTAN
5. autoconfirmación
6. pestaña Precisión
7. N-best

**No se recortan:** voz con confirmación, sockets, las 2 bases de datos, `local-agent` con Whisper, los microfrontends ni `quality.md` con cifras reales.

## 8. Riesgos
| Riesgo | Mitigación |
|---|---|
| En la demo, el micrófono capta al otro jugador (misma sala) | Pulsar para hablar, diademas de micrófono cercano, confirmación explícita, ensayo con los dos hablando |
| Falla la demo en vivo (red, Render, micrófono) | Video de respaldo grabado el mié 25 |
| Whisper transcribe algo con silencio o ruido | Umbral de volumen y duración; clips de silencio y ruido en el spike y en el corpus |
| Compilar whisper.cpp en Windows consume el spike | Binario precompilado y modelos descargados antes de empezar |
| `base` insuficiente en acierto | Probar `small` en el spike; medir su latencia en las laptops de la demo |
| Instancia gratuita de Render dormida | Despertarla antes de la demo; `health` como comprobación |
| El navegador bloquea las llamadas a 127.0.0.1 desde un origen público (Vercel) | La demo se hace desde Live Server (local → local); si se usa Vercel, ensayar el permiso de red local |
| Web Speech solo funciona bien en Chrome/Edge y usa la nube | Usar Chrome en la demo; Whisper local y la caja de texto como alternativas |
| Divergencia entre servidor y frontend | Contrato v0 de `shared/` firmado el jue 5; cambios solo por PR revisado por los dos |

## 9. Recomendaciones y objeciones
1. **El spike va primero y es lo más urgente.** Ya va atrasado. Hay que fijar los criterios y descargar el binario precompilado y los modelos hoy, antes de grabar nada.
2. **El refinamiento del parser choca con la Fase 2 del servidor en la semana 3.** A tiene los 5 días ocupados con el servidor. Sin fines de semana, la propuesta es que B haga la primera pasada del refinamiento (alias y tablas de normalización, guiado por el corpus) y A revise los PR. Esto rompe el reparto “A = parser”; si se trabaja el fin de semana del 14–15, el parser vuelve a A.
3. **El `local-agent` básico el jue 12 – vie 13 (A) es el punto de no retorno del módulo local.** Si ese viernes no transcribe un WAV desde el navegador, hay que escalarlo antes de la semana 3, no en la semana 4.
4. **Colchón real casi nulo en el escenario base.** La semana 4 es pulido y medición, pero también el único margen. Si algo de la semana 3 se retrasa, se aplica el orden de recorte sin discutir.
5. **`quality.md` necesita la sesión de evaluación.** Sin `expectedUci` no hay cifras de acierto. Protege el lun 23 – mar 24 para medir.
6. **Renombrar la carpeta local `ChesssPeak` a `ChessSpeak`** antes de `git init`.
7. **No dar por hecho que el N-best ayuda:** solo se adopta si el spike lo demuestra con el criterio fijado.
8. **Confirmar la fecha de entrega cuanto antes:** todo el calendario cuelga del vie 27. Si se adelanta, se aplica el orden de recorte desde ya.

## 10. Preguntas abiertas
**Resueltas con el profesor:**
- ✅ El agente Whisper en localhost **cuenta como módulo local**.
- ✅ Es aceptable que el reconocedor por defecto (Web Speech) use la nube de Google, por ser lo más viable. Whisper local queda como alternativa y como módulo local.

**Pendientes para el profesor:**
1. ¿Hay que poder abrir el proyecto con Live Server sin compilar? (Hoy el plan sirve `web/dist`, ya compilado. Si la respuesta es sí, `web/dist` tendría que estar en el repo desde antes.)
2. ¿Cuál es la fecha real de entrega y el formato de la demo?

**Para el equipo:** variante exacta del español para Web Speech (¿`es-CO`?); qué escenario de capacidad aplica (¿festivos? ¿fines de semana?).
