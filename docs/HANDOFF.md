# ChessSpeak: estado para el relevo

**Estado a 2026-11-06, 00:20 (UTC−5).** Reconstruido desde git, los PR, la CI y los documentos. Este documento no actualiza nada: si contradice a `git` o a GitHub, manda lo segundo.

**En resumen:** dos invitados pueden jugar una partida completa escribiendo, en Edge, con servidor local. Casi todo eso está en 6 PR apilados sin revisar, así que `main` todavía no lo tiene. Faltan la voz en el producto, el despliegue, la validación y los ensayos. La entrega sigue sin fecha confirmada.

## Ramas y hashes

| Rama | Local | Remoto | Situación |
|---|---|---|---|
| `main` | `cfe954a` | `cfe954a` | Sin protección de rama |
| `feat/contract-v0` | `75c82f9` | `75c82f9` | PR #3, borrador |
| `feat/game-room` | `9cf9cad` | `9cf9cad` | PR #10 |
| `feat/guest-auth` | `05d9b73` | `05d9b73` | PR #11 |
| `feat/create-game` | `3c3367f` | `3c3367f` | PR #12 |
| `feat/game-gateway` | `90ab665` | `90ab665` | PR #13; incluye el puerto `MovePersistence` |
| `feat/web-game` | `cbe8abb` | `cbe8abb` | PR #14 |
| `feat/move-persistence` | `813b8a3` | No existe | Solo local; sus commits ya están dentro de #13 |
| `docs/delivery-nov-19` | `3b51a11` más los commits de este archivo | `d728be5` | **No se sube todavía:** tiene historia reescrita y supuestos por revisar |

Cadena: `main` ← #3 ← #10 ← #11 ← #12 ← #13 ← #14. Ningún PR tiene revisión.

**CI por trabajo:** `verify`, `integration`, `secrets` y `smoke` están en verde en la última ejecución de `main` y de los 6 PR. En #14 (`cbe8abb`): servidor 198 tests, integración 33, `local-agent` 46, `voice-parser` 84, web 66 y `smoke` 13 comprobaciones. **Hay que mirar cada trabajo por separado:** ver el riesgo de `smoke`.

## 1. Estado por requisito del profesor

| Requisito | Estado | Evidencia |
|---|---|---|
| **Nube** | **No empezado.** Solo está preparado | `render.yaml`, `vercel.json` y `docs/deploy.md` en `main` (#8). No hay ninguna URL real en el repo |
| **Módulo local** | **Agente: hecho y verificado. Desde el navegador: no empezado** | `local-agent` en `main` (#6), con CI y corridas de carga. El adaptador del navegador no existe |
| **Sockets** | **Hecho y verificado, solo en PR** | #13 y #14: integración con bases reales (`game-flow.int-spec.ts`) y `pnpm e2e:web`, 22 de 22 en Edge. Solo en local, sin nube |
| **Micrófono** | **No empezado en el producto** | Solo existe el arnés del spike (`spike/web-speech`). La rama `feat/web-game` no usa `SpeechRecognition`, `getUserMedia` ni `MediaRecorder` |
| **Dos bases de datos** | **Parcial.** Partidas y jugadas: hecho y verificado, solo en PR y en local. `voice_attempts`: no empezado | Esquemas en `main` (#4). Escrituras en #12 y #13, con integración real. El módulo `voice-metrics` está vacío. Neon y Atlas: no existen |
| **GitHub** | **Hecho y verificado** | Repo público, PR, CI y `LICENSE` GPL-3.0. Matices: la API de GitHub no detecta la licencia, el ADR 9 no está escrito y el repo se llama `ChesssPeak`, no `chessspeak` |
| **Microfrontends** | **Parcial.** Los 3 existen. `<mf-game>` y la caja de texto: hecho y verificado, solo en PR. `<mf-history>`: marcador de posición | Base en `main` (#2). Real en #14. `smoke:web` y `e2e:web` |
| **Balanceo** | **Whisper: hecho y verificado, cumplimiento sin confirmar. `move-workers`: no empezado** | Pool y dashboard en `main` (#6). La evidencia de carga y el ensayo con un worker muerto están solo en `docs/delivery-nov-19`. ADR 10 revisado y ADR 11 solo en esa rama. Del pool solo existe el puerto |
| **Dominio** | **No empezado.** Riesgo asumido | `chessspeak.dpdns.org` no resolvió con `nslookup` (`Server failed`). El mínimo acordado es la web en Vercel, que tampoco está publicada |

**Criterios de aceptación de `SPEC.md` §6:**

| # | Criterio | Estado |
|---|---|---|
| 1 | Partida completa por voz con Web Speech | No empezado; existe por texto |
| 2 | Una jugada por voz con Whisper desde el navegador | No empezado |
| 3 | Desconexión y reconexión | Verificado en PR, en local |
| 4 | Una frase ambigua o ilegible no mueve piezas | Verificado por texto, sin voz |
| 5 | `voice_attempts`, `game_moves` y Postgres | `game_moves` y Postgres verificados en PR; `voice_attempts`, no |
| 6 | Backend en la nube, repo público y CI en verde | Falta el backend en la nube |
| 7 | `quality.md`, ADR y README probado con un clon nuevo | No empezado; hay ADR parciales |

## 2. Estado por fase del `PLAN.md`

| Fase | En `main` | Solo en PR abiertos | Solo en local | No existe |
|---|---|---|---|---|
| **0. Fundaciones** | Monorepo, esqueletos, shell y 3 proyectos, `serve:web`, CI, esquemas, `/health`, archivos de despliegue | Contrato (#3), sin firmar | Nada | Despliegue en Neon, Atlas, Render y Vercel; firma del contrato; ADR 9 |
| **1. Partida entre invitados** | `local-agent` | `GameRoom` (#10), auth y ADR 8 (#11), `POST /games` (#12), gateway, guardado y ADR 7 (#13), shell, `<mf-game>` y caja de texto (#14) | Nada | Despliegue |
| **2. Voz de punta a punta** | Parser y corpus v0 | Fin de partida y reconexión (#13); confirmación con flecha, por texto (#14) | Nada | Web Speech en el producto, adaptador Whisper, `voice-metrics`, telemetría, `<mf-history>` real, aviso sin Web Speech, latencia declarada, ADR 6, lote del parser |
| **3. Validación y entrega** | Nada | Nada | Kit para la otra laptop (sin resultados) | `docs/quality.md`, 40 frases, validación, ensayos, clon nuevo, video, `web/dist` en la entrega, tag `v1.0` |

**Solo en `docs/delivery-nov-19`:** ADR 11, revisión del ADR 10 y ADR 1, supuestos, evidencia de carga, kit y este archivo. **Pool de `move-workers`:** no existe.

## 3. Qué falta, por prioridad

| # | Tarea | Responsable |
|---|---|---|
| 1 | Confirmar la fecha de entrega | Responsable del repo |
| 2 | Firmar #3 y revisar #10 a #14, incluidos los códigos de error provisionales | Responsable del repo y compañero |
| 3 | Acordar la excepción de commits de fusión en `CONTRIBUTING.md` | Responsable del repo y compañero |
| 4 | Fusionar la cadena en orden; cada fusión necesita aprobación expresa | Responsable del repo y compañero |
| 5 | Crear las cuentas de Neon, Atlas, Render y Vercel, y desplegar con esas credenciales. Después, probar `trust proxy` | Responsable del repo |
| 6 | Asignar roles A y B y el responsable del parser; decidir si se trabaja el 14–15 y el 16 | Responsable del repo y compañero |
| 7 | Decidir cuándo sigue la voz, porque ahora no se abren ramas nuevas sin OK del responsable | Responsable del repo |
| 8 | Web Speech, pulsar para hablar y confirmación por voz | Claude o rol B, tras el OK del responsable |
| 9 | `voice-metrics` y telemetría | Claude o rol A, tras el OK del responsable |
| 10 | Adaptador Whisper en el navegador, probado en Edge | Claude o rol B, tras el OK del responsable |
| 11 | `<mf-history>` real | Claude o rol B, tras el OK del responsable |
| 12 | Pool de `move-workers`: no antes del jueves 12 y con OK explícito | Claude, tras el OK del responsable |
| 13 | ADR 9, ADR 6, C4 y poner al día los documentos | Claude, tras el OK del responsable |
| 14 | 40 frases de validación (20 cada persona) | Responsable del repo y compañero |
| 15 | Medir los dos equipos con el kit y repetir la carga de Whisper en el más débil | Responsable del repo o compañero |
| 16 | Medir en Chrome antes del 16 de noviembre, si aplica | Responsable del repo (voz real) |
| 17 | Validación con otra voz y `quality.md` | Responsable del repo y compañero |
| 18 | Ensayos con dos laptops, clon nuevo y video de respaldo | Responsable del repo y compañero |
| 19 | Commit de entrega con `web/dist`, tag `v1.0` y publicación de `docs/delivery-nov-19` | Responsable del repo decide; Claude lo prepara |
| 20 | Registrar el dominio, si sobra tiempo | Responsable del repo |
| 21 | Borrar las 2 partidas de prueba de la base local (comandos en `proximos-pasos.md`) | Responsable del repo |

**Antes de cualquier medición, hay que apagar Docker y registrar su estado.** Claude no empieza una medición sin avisar. **Ahora mismo Docker está encendido.**

## 4. Avance estimado

**Es una estimación, no una medida.** El plan no trae días-persona por bloque: trae un calendario de 18 días-persona entre el 5 y el 18 de noviembre. El reparto dentro de cada fila es una suposición de este documento.

| Bloque | Peso | Hecho en `main` | Hecho contando PR | Restante contando PR |
|---|---|---:|---:|---:|
| Spike, Fase 0 y `local-agent` * | 5,00 | 5,00 | 5,00 | 0,00 |
| Contrato y `GameRoom` (#3, #10) | 1,00 | 0 | 1,00 | 0,00 |
| Auth y límite (#11) | 0,50 | 0 | 0,50 | 0,00 |
| Despliegue | 0,40 | 0 | 0 | 0,40 |
| ADR 9 | 0,10 | 0 | 0 | 0,10 |
| Firma, fusión, roles e instalación | 1,00 | 0 | 0 | 1,00 |
| `POST /games` (#12) | 0,50 | 0 | 0,50 | 0,00 |
| Gateway, guardado y ADR 7 (#13) | 2,00 | 0 | 2,00 | 0,00 |
| Shell, `<mf-game>` y caja de texto (#14) | 2,50 | 0 | 2,50 | 0,00 |
| Fin de partida y reconexión (#13) | 1,25 | 0 | 1,25 | 0,00 |
| `voice-metrics` | 0,75 | 0 | 0 | 0,75 |
| Confirmación con flecha, por texto (#14) | 0,25 | 0 | 0,25 | 0,00 |
| Web Speech y pulsar para hablar | 1,00 | 0 | 0 | 1,00 |
| `<mf-history>` real | 0,50 | 0 | 0 | 0,50 |
| Telemetría por el shell | 0,25 | 0 | 0 | 0,25 |
| Endurecimiento, ADR 6 y lote del parser | 1,00 | 0 | 0 | 1,00 |
| Adaptador Whisper, latencia y aviso | 1,00 | 0 | 0 | 1,00 |
| Validación y `quality.md` | 1,00 | 0 | 0 | 1,00 |
| Primer ensayo y clon nuevo | 1,00 | 0 | 0 | 1,00 |
| Correcciones, ensayo, video y tag | 2,00 | 0 | 0 | 2,00 |
| Pool de `move-workers` y pruebas ** | 2,00 | 0 | 0 | 2,00 |
| 40 frases de validación ** | 0,50 | 0 | 0 | 0,50 |
| Documentación C4 ** | 0,50 | 0 | 0 | 0,50 |
| Repetir la carga de Whisper ** | 0,50 | 0 | 0 | 0,50 |
| **Total** | **26,50** | **5,00** | **13,00** | **13,50** |

\* No está en el calendario: su peso son los 5 días con commits en `main`. \*\* No está en las 18 jornadas del calendario: su peso es una estimación de este documento.

| Medida | Solo `main` | Contando PR abiertos |
|---|---:|---:|
| **Proyecto completo (26,5)** | **18,9 %** | **49,1 %** |
| Solo trabajo desde el 5 de noviembre (21,5) | 0,0 % | 37,2 % |

**Supuestos y límites:**
- **«Hecho» significa verificado con CI y pruebas.** Nada de lo contado como PR tiene revisión de otra persona, y puede cambiar con el contrato.
- **Se cuenta entero un bloque verificado en local,** aunque aún no se haya probado en la nube.
- **Los pesos no miden esfuerzo real:** los 8 días-persona contados en PR se escribieron en muy poco tiempo y sin revisión. Lo que falta depende más de personas, voz real y laptops, así que no se puede extrapolar ese ritmo.
- **Capacidad restante del plan:** 17 días-persona, contando festivo y sin fines de semana, frente a 13,5 restantes. La revisión de la cadena no está incluida.

## 5. Riesgos abiertos

| Riesgo | Estado |
|---|---|
| **`smoke` inestable en CI** | **Abierto, sin causa conocida.** Falló 3 de 3 en `fa5c168` y pasó 3 de 3 en `cbe8abb`. Mismo error antes en `main` (`2d287ea`). Con `continue-on-error`, el resultado global puede decir verde aunque falle |
| **Fecha de entrega sin confirmar** | **Abierto.** Margen interno del equipo 19 de noviembre; tentativa 27 de noviembre. El calendario usa el 19 |
| **Dominio** | **Riesgo asumido.** El plan registra que el profesor lo pidió. Si sobra tiempo, solo la web en Vercel. Registro sin completar, hasta donde se pudo comprobar |
| **Cadena de 6 PR sin fusionar** | **Abierto y creciendo en importancia.** Nada del núcleo está en `main`, y `render.yaml` despliega desde `main`. El *squash* rompe la cadena según una simulación local; los commits de fusión funcionaron, pero falta acordar la excepción y probarlo en GitHub |
| **Pérdida de jugadas si el servidor muere** | **Aceptado y documentado (ADR 7), sin prueba.** Las jugadas pendientes de guardar se pierden. Los jugadores pueden haberlas visto |
| **Fase 0 sin desplegar** | **Abierto y vencido hoy según el plan.** Depende de crear las cuentas. `trust proxy`, CORS y la memoria en Render siguen sin probar |
| **Chrome sin medir** | **Abierto, como recorte.** Medir antes del 16 de noviembre si la entrega la abre otra persona |
| **Balanceo sin aceptación** | **Abierto.** Whisper quedó en duda por ser local, y el ADR 11 se apoya en dos supuestos débiles. Tampoco se demostró mejora de rendimiento: el beneficio medido es la tolerancia a fallos |
| **`POST /games` sin límite** | **Conocido (ADR 8).** |
| **Sin revisión independiente** | **Abierto.** `main` no tiene protección: que nadie fusione sin aprobación depende solo de la convención |
| **Documentos desactualizados** | **Abierto.** La lista de tareas de `proximos-pasos.md` no refleja lo hecho, y el ADR 11 dice «aún no hay código» y que el hosting espera una sugerencia del profesor |

## 6. Qué no se pudo verificar

**Desde este estado no se ejecutó ninguna prueba:** todo sale de lecturas de git, GitHub y documentos, y de una consulta DNS.

- **Cuentas y despliegue:** no se tiene acceso a Neon, Atlas, Render, Vercel ni DigitalPlat. Se sabe que el repo no tiene URL reales, no si ya existen cuentas.
- **Dominio:** solo hay un `nslookup` fallido; no se vio el panel de registro.
- **`pnpm e2e:web` sobre el último commit:** los 22 de 22 son de la noche del 5 de noviembre, antes de `227c729`. Después solo cambiaron comentarios, el README y `smoke-web.mjs`. Las capturas están fuera del repo.
- **Edge con ventana visible:** corrió sin interfaz, con pestañas en un solo equipo. Tampoco se probó con dos laptops, red real, móvil ni Live Server.
- **Voz real en el producto:** no existe. Las cifras de voz son del spike, con una sola voz.
- **Causa del fallo de `smoke`.**
- **Pérdida de jugadas con escrituras pendientes,** porque ninguna prueba cubre ese caso.
- **Estrategia de fusión en GitHub:** solo se simuló con git local, sobre una versión anterior de `feat/web-game`.
- **Commits intermedios de cada PR:** se verificó la punta de cada rama.
- **Pasos manuales de `web/README.md`** tal como están escritos.
- **Equipo más débil:** no se sabe cuál es, ni la situación de la otra laptop.
- **Disponibilidad del compañero** y si el profesor aceptará los supuestos.
- **Copia de respaldo de `docs/delivery-nov-19`:** no se comprobó, y una copia anterior no incluiría los últimos commits.
