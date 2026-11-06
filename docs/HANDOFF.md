# ChessSpeak: estado para el relevo

**Estado a 2026-11-06, 05:22 (UTC−5).** Reconstruido desde git, los PR, la CI y los documentos. Este documento no actualiza nada: si contradice a `git` o a GitHub, manda lo segundo.

**En resumen:** dos invitados pueden jugar una partida completa escribiendo, en Edge, con servidor local. Casi todo eso está en 6 PR apilados sin revisar, así que `main` todavía no lo tiene. Faltan la voz en el producto, el despliegue, la validación y los ensayos. Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).

**Equipo (decisión del 6 de noviembre):** el responsable del repo trabaja solo, sin revisión del compañero, y es el único que aprueba. Por eso ya no se espera ninguna firma para el contrato (#3) ni para la cadena de PR.

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
| `docs/delivery-nov-19` | `2aba28e` más el commit de esta nota | `2aba28e` antes de subir esta nota | **Contiene supuestos por revisar (ADR 11) y se sube como trabajo en curso, sin PR** |

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
| **GitHub** | **Hecho y verificado** | Repo público, PR, CI y `LICENSE` GPL-3.0. Matices: el ADR 9 no está escrito y el repo se llama `ChesssPeak`, no `chessspeak` |
| **Microfrontends** | **Parcial.** Los 3 existen. `<mf-game>` y la caja de texto: hecho y verificado, solo en PR. `<mf-history>`: marcador de posición | Base en `main` (#2). Real en #14. `smoke:web` y `e2e:web` |
| **Balanceo** | **Whisper: hecho y verificado, cumplimiento sin confirmar. `move-workers`: no empezado** | Pool y dashboard en `main` (#6). La evidencia de carga y el ensayo con un worker muerto están solo en `docs/delivery-nov-19`. ADR 10 revisado y ADR 11 solo en esa rama. Del pool solo existe el puerto |
| **Dominio** | **Registrado y delegado; aún no funciona. En espera del profesor** | `chessspeak.dpdns.org` está delegado a `ns1` y `ns2.magicsolutions.co`, que rechazan las consultas (*lame delegation*, `REFUSED`, comprobado el 6 de noviembre). Mínimo garantizado: la URL `vercel.app`, que tampoco está publicada |

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
| **0. Fundaciones** | Monorepo, esqueletos, shell y 3 proyectos, `serve:web`, CI, esquemas, `/health`, archivos de despliegue | Contrato (#3), sin fusionar | Nada | Despliegue en Neon, Atlas, Render y Vercel; ADR 9 |
| **1. Partida entre invitados** | `local-agent` | `GameRoom` (#10), auth y ADR 8 (#11), `POST /games` (#12), gateway, guardado y ADR 7 (#13), shell, `<mf-game>` y caja de texto (#14) | Nada | Despliegue |
| **2. Voz de punta a punta** | Parser y corpus v0 | Fin de partida y reconexión (#13); confirmación con flecha, por texto (#14) | Nada | Web Speech en el producto, adaptador Whisper, `voice-metrics`, telemetría, `<mf-history>` real, aviso sin Web Speech, latencia declarada, ADR 6 |
| **3. Validación y entrega** | Nada | Nada | Kit para la otra laptop (sin resultados) | `docs/quality.md`, 40 frases, validación, ensayos, clon nuevo, video, `web/dist` en la entrega, tag `v1.0` |

**Solo en `docs/delivery-nov-19`:** ADR 11, revisión del ADR 10 y ADR 1, supuestos, evidencia de carga, kit y este archivo. **Pool de `move-workers`:** no existe.

## 3. Qué falta, por prioridad

| # | Tarea | Responsable |
|---|---|---|
| 1 | Sin definir: hora y duración de la demo, y si el profesor abrirá el proyecto él mismo | Responsable del repo |
| 2 | Revisar #3 y #10 a #14, incluidos los códigos de error provisionales | Responsable del repo |
| 3 | Añadir la excepción de commits de fusión a `CONTRIBUTING.md` | Responsable del repo |
| 4 | Fusionar la cadena en orden; cada fusión necesita aprobación expresa | Responsable del repo |
| 5 | Crear las cuentas de Neon, Atlas, Render y Vercel, y desplegar con esas credenciales. Después, probar `trust proxy` | Responsable del repo |
| 6 | Lote del parser: fuera del plan, se queda `spike-parser-freeze` | Responsable del repo |
| 7 | Dar el OK explícito antes de empezar el pool de `move-workers` | Responsable del repo |
| 8 | Web Speech, pulsar para hablar y confirmación por voz | Claude, tras el OK del responsable |
| 9 | `voice-metrics` y telemetría | Claude, tras el OK del responsable |
| 10 | Adaptador Whisper en el navegador, probado en Edge | Claude, tras el OK del responsable |
| 11 | `<mf-history>` real | Claude, tras el OK del responsable |
| 12 | Pool de `move-workers`, tras el OK explícito | Claude, tras el OK del responsable |
| 13 | ADR 9, ADR 6, C4 y poner al día los documentos | Claude, tras el OK del responsable |
| 14 | 40 frases de validación | Responsable del repo |
| 15 | Medir los dos equipos con el kit y repetir la carga de Whisper en el más débil | Responsable del repo |
| 16 | Medir en Chrome, si no se recorta | Responsable del repo (voz real) |
| 17 | Validación con otra voz y `quality.md`. **Sin definir quién aporta la otra voz** | Responsable del repo |
| 18 | Ensayos con dos laptops, clon nuevo y video de respaldo. **Sin definir la segunda laptop** | Responsable del repo |
| 19 | Commit de entrega con `web/dist` y tag `v1.0`. Antes, llevar `docs/delivery-nov-19` a `main` con un PR: la rama ya está subida como trabajo en curso, sin PR | Responsable del repo decide; Claude lo prepara |
| 20 | Dominio: esperar a que el profesor lo agregue en el hosting y, cuando deje de rechazar consultas, conectarlo. No registrar otro ni cambiar los nameservers | Responsable del repo |
| 21 | Borrar las 2 partidas de prueba de la base local (comandos en `proximos-pasos.md`) | Responsable del repo |

**Antes de cualquier medición, hay que apagar Docker y registrar su estado.** Claude no empieza una medición sin avisar. **Al actualizar este documento, Docker no respondía y parecía apagado: hay que comprobarlo antes de medir.**

**Regla de PARA:** ante cualquier fallo, incluidos los errores del propio script de Claude, se para, se muestra la salida y se espera la decisión del responsable del repo. No se reintenta ni se corrige por cuenta propia.

**Carpetas privadas:** `evidencia-web/` y `privado/` viven **fuera del repo**, porque git no las ignora y el repo es público. **Nunca usar `git add .` ni `git add -A`: los archivos se añaden por nombre.** `E2E_OUT` debe apuntar fuera del repo.

**Clon limpio sin probar:** el equipo donde se retomó el trabajo el 6 de noviembre reutiliza su `.env` y su `node_modules`, así que lo que corra ahí no demuestra que el proyecto funcione en un clon limpio.

**Instalación y pruebas:** se hicieron el 6 de noviembre en el equipo de escritorio (ver las notas siguientes). En el otro equipo no se llegó a instalar: `pnpm verify`, Docker y los demás comandos siguen sin ejecutarse allí.

### Notas para el README (hallazgos del 6 de noviembre)
- **Espacio en disco:** `pnpm install --frozen-lockfile` falló con `Espacio en disco insuficiente` (`os error 112`) al escribir en la caché de pnpm. El lockfile era correcto. El README debe avisar del espacio necesario, que aún no se ha medido. Tras un fallo así, `node_modules` puede quedar incompleto y no sirve para probar nada.
- **Orden en un equipo con `node_modules` viejo:** primero `pnpm install` y luego `pnpm env:init`. Si no, pnpm intenta instalar antes de ejecutar el script y puede avisar de que `node_modules` no coincide con el lockfile.
- **`.env.example` es distinto entre ramas:** por ejemplo, `feat/web-game` trae `GUEST_AUTH_LIMIT_PER_MINUTE` y `ABANDON_TIMEOUT_MS`, y `docs/delivery-nov-19` trae `MOVE_WORKERS_KILL_SECRET`. El `.env` hay que generarlo en la rama que se va a ejecutar, y unificarlo al fusionar.
- **Un `.env` viejo no se actualiza solo:** `pnpm env:init` no lo sobrescribe y sale con código 1. Hay que respaldarlo en una ruta externa al repo, regenerarlo y restaurar a mano las variables de Whisper.
- **`pnpm test:integration` puede engañar:** sin `DATABASE_URL_TEST` ni `MONGO_URI_TEST` dice «omitido» y, fuera de CI, sale con código 0. Hay que comprobar que los tests corrieron.
- **Migración:** `pnpm prisma:migrate` no existe en la raíz. El comando es `pnpm --filter @chessspeak/server prisma:migrate`.
- **`cp` frente a `pnpm env:init`:** el README de `feat/web-game` da las dos instrucciones (líneas 55 y 68). Con `cp .env.example .env`, `GUEST_TOKEN_SECRET` queda vacío y las contraseñas se quedan en su valor de ejemplo. El README debe dejar solo `pnpm env:init`.
- **Contraseñas con volúmenes existentes:** Postgres y Mongo solo aplican las credenciales iniciales cuando el volumen está vacío. Si se regenera `.env` con volúmenes ya creados, las contraseñas nuevas no se aplican a esas bases. No se probó el fallo: se restauraron del respaldo las credenciales de las bases y la integración pasó.
- **Nombres de volúmenes:** Compose antepone el proyecto, así que en `docker volume ls` aparecen `chessspeak_chessspeak_pg` y `chessspeak_chessspeak_mongo`, no `chessspeak_pg` y `chessspeak_mongo`.
- **Arranque automático:** con `restart: unless-stopped`, los contenedores se vieron en marcha antes de ejecutar `docker compose up -d`. La causa probable, no comprobada, es que arrancan al abrir Docker Desktop. `docker compose up -d` no los recreó.
- **Estado previo reutilizado:** en el equipo de escritorio, sobre `cbe8abb`, `pnpm verify` pasó con 485 tests y `pnpm test:integration` ejecutó 6 suites y 33 tests, sin «omitido». Pero `pnpm install --frozen-lockfile` reutilizó `node_modules` (199 ms) y la migración respondió `No pending migrations to apply`, porque ya estaban aplicadas. Esto no prueba ni una instalación limpia ni las migraciones sobre una base vacía: sigue pendiente el clon nuevo.

### Orden de trabajo
**Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).** La prioridad es este orden, no un calendario por días.

1. **Fusionar la cadena** #3 y #10 a #14, y después el PR de `docs/delivery-nov-19`, antes del despliegue.
2. **Despliegue** en Render, Neon, Atlas y Vercel, con las cuentas del responsable del repo.
3. **Voz de punta a punta:** Web Speech `es-CO` con 400 ms, `voice:attempt` y `voice_attempts`, y `<mf-history>` real.
4. **Adaptador de Whisper local.**
5. **Pool de `move-workers`** (ADR 11), con OK explícito del responsable del repo antes de empezar.
6. **Cierre:** validación con otra voz (sin otra voz, con la del responsable del repo, declarado en `docs/quality.md`), C4 niveles 1 y 2, README probado en máquina limpia, ensayo y tag.

**Nunca se recorta:** voz, despliegue y README probado.

**Si algo se atrasa, se avisa al responsable del repo** y se recorta primero, en este orden:
1. Dashboard integrado: no se hace; queda `/lb/dashboard` de `local-agent` para la demo.
2. Medición en Chrome (la demo usa Edge; el README recomienda Edge y dice que Chrome no se midió).
3. Repetición de la carga de Whisper.

El lote del parser queda fuera (`spike-parser-freeze`). **Consecuencias, si se llegara a recortar:**
- **Si se recorta el pool de `move-workers`:** el balanceo queda solo en Whisper, riesgo asumido. Si el balanceo es obligatorio, el pool no es recortable.
- **Si se recorta el adaptador de Whisper:** queda sin cumplir el criterio 2 de `SPEC.md`, se pone en duda R2 y suma 1,0 día neto frente a recortar el pool (estimación).

**Sin definir:** quién aporta la otra voz, de dónde sale la segunda laptop, cuál es la máquina limpia del README, hora y duración de la demo, y si el profesor abrirá el proyecto él mismo.

**Windows Sandbox para la máquina limpia: opción sin probar, sin ejecutar.** Límites previstos, todavía sin comprobar:
- Docker probablemente no corre dentro, así que la sección de bases locales del README quedaría sin probar y la prueba iría contra el backend desplegado.
- Comparte el hardware del equipo que lo ejecuta: valida la instalación, pero no sirve para medir latencia.
- Al cerrarlo se borra todo: lo que falle se anota fuera, y Whisper habría que descargarlo en cada intento.

**La segunda laptop y la máquina limpia son cosas distintas.** La máquina limpia prueba el README. La segunda laptop sigue pendiente aparte, para medir la latencia de Whisper y para los ensayos.

### Plan de despliegue aprobado (Paso C), sin implementar
**Es solo un plan: nada de esto está hecho.** Se hace después de fusionar la cadena, con ramas desde `main`, un PR por tema y *squash*. Las cuentas y credenciales las pone el responsable del repo en cada panel, nunca en el repo.

- **`/health/live`:** ruta sin bases para el sondeo de Render. `/health` conserva el detalle con `HEALTH_PROBE_TIMEOUT_MS`. No se presenta como beneficio que Render deje de despertar a Neon: es una suposición.
- **`build-web.mjs`:** falla sin `PUBLIC_API_URL` solo en despliegue, con una condición explícita (por ejemplo, `VERCEL=1`). Hay que probar los dos casos y que CI siga pasando.
- **`render.yaml`:** versión exacta de Node (hay que confirmar que Render la soporta), `MOVE_WORKERS=0` y tiempo de sondeo declarados.
- **`docs/deploy.md`:** lista de cuentas (Neon, Atlas, Render y Vercel) y orden: backend, compilar la web con su URL, subir la web y añadir el origen a `CORS_ORIGINS`.
- **Dominio en `docs/deploy.md`:** su conexión queda como supuesto, según qué sea el hosting.
- **Riesgos en `docs/deploy.md`:** HTTPS obligatorio para el micrófono; web pública que llama a `127.0.0.1` (Whisper local), con la prueba en la consola de Edge; y `0.0.0.0/0` en Atlas como riesgo aceptado, con contraseña larga y aleatoria.

## 4. Avance estimado

**Es una estimación, no una medida.** El plan no trae días-persona por bloque: los pesos salen de su calendario anterior, de 18 días-persona. El reparto dentro de cada fila es una suposición de este documento.

| Bloque | Peso | Hecho en `main` | Hecho contando PR | Restante contando PR |
|---|---|---:|---:|---:|
| Spike, Fase 0 y `local-agent` * | 5,00 | 5,00 | 5,00 | 0,00 |
| Contrato y `GameRoom` (#3, #10) | 1,00 | 0 | 1,00 | 0,00 |
| Auth y límite (#11) | 0,50 | 0 | 0,50 | 0,00 |
| Despliegue | 0,40 | 0 | 0 | 0,40 |
| ADR 9 | 0,10 | 0 | 0 | 0,10 |
| Fusión e instalación | 1,00 | 0 | 0 | 1,00 |
| `POST /games` (#12) | 0,50 | 0 | 0,50 | 0,00 |
| Gateway, guardado y ADR 7 (#13) | 2,00 | 0 | 2,00 | 0,00 |
| Shell, `<mf-game>` y caja de texto (#14) | 2,50 | 0 | 2,50 | 0,00 |
| Fin de partida y reconexión (#13) | 1,25 | 0 | 1,25 | 0,00 |
| `voice-metrics` | 0,75 | 0 | 0 | 0,75 |
| Confirmación con flecha, por texto (#14) | 0,25 | 0 | 0,25 | 0,00 |
| Web Speech y pulsar para hablar | 1,00 | 0 | 0 | 1,00 |
| `<mf-history>` real | 0,50 | 0 | 0 | 0,50 |
| Telemetría por el shell | 0,25 | 0 | 0 | 0,25 |
| Endurecimiento y ADR 6 (el lote del parser queda fuera) | 1,00 | 0 | 0 | 1,00 |
| Adaptador Whisper, latencia y aviso | 1,00 | 0 | 0 | 1,00 |
| Validación y `quality.md` | 1,00 | 0 | 0 | 1,00 |
| Primer ensayo y clon nuevo | 1,00 | 0 | 0 | 1,00 |
| Correcciones, ensayo, video y tag | 2,00 | 0 | 0 | 2,00 |
| Pool de `move-workers` y pruebas ** | 2,00 | 0 | 0 | 2,00 |
| 40 frases de validación ** | 0,50 | 0 | 0 | 0,50 |
| Documentación C4 ** | 0,50 | 0 | 0 | 0,50 |
| Repetir la carga de Whisper ** | 0,50 | 0 | 0 | 0,50 |
| **Total** | **26,50** | **5,00** | **13,00** | **13,50** |

\* No estaba en el calendario anterior: su peso son los 5 días con commits en `main`. \*\* No estaba en las 18 jornadas del calendario anterior: su peso es una estimación de este documento.

| Medida | Solo `main` | Contando PR abiertos |
|---|---:|---:|
| **Proyecto completo (26,5)** | **18,9 %** | **49,1 %** |
| Solo trabajo desde el 5 de noviembre (21,5) | 0,0 % | 37,2 % |

**Supuestos y límites:**
- **«Hecho» significa verificado con CI y pruebas.** Nada de lo contado como PR tiene revisión de otra persona, y puede cambiar con el contrato.
- **Se cuenta entero un bloque verificado en local,** aunque aún no se haya probado en la nube.
- **Los pesos no miden esfuerzo real:** los 8 días-persona contados en PR se escribieron en muy poco tiempo y sin revisión. Lo que falta depende más de personas, voz real y laptops, así que no se puede extrapolar ese ritmo.

## 5. Riesgos abiertos

| Riesgo | Estado |
|---|---|
| **`smoke` inestable en CI** | **Abierto, sin causa conocida.** Falló 3 de 3 en `fa5c168` y pasó 3 de 3 en `cbe8abb`. Mismo error antes en `main` (`2d287ea`). Con `continue-on-error`, el resultado global puede decir verde aunque falle |
| **Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor)** | **Sin definir:** hora y duración de la demo, y si el profesor abrirá el proyecto él mismo. |
| **Dominio** | **En espera del profesor; mínimo garantizado: la URL `vercel.app`.** Delegado a `ns1` y `ns2.magicsolutions.co`, que rechazan las consultas (*lame delegation*). No se sabe qué hosting es, qué permite alojar ni si tiene HTTPS, que es obligatorio para el micrófono |
| **Cadena de 6 PR sin fusionar** | **Abierto y creciendo en importancia.** Nada del núcleo está en `main`, y `render.yaml` despliega desde `main`. El *squash* rompe la cadena según una simulación local; los commits de fusión funcionaron, pero falta añadir la excepción y probarlo en GitHub |
| **Pérdida de jugadas si el servidor muere** | **Aceptado y documentado (ADR 7), sin prueba.** Las jugadas pendientes de guardar se pierden. Los jugadores pueden haberlas visto |
| **Fase 0 sin desplegar** | **Abierto.** Es el paso 2 del orden de trabajo. Depende de crear las cuentas. `trust proxy`, CORS y la memoria en Render siguen sin probar |
| **Chrome sin medir** | **Abierto, recortable.** Si la entrega la abre otra persona, puede ser en Chrome |
| **Balanceo sin aceptación** | **Abierto.** Whisper quedó en duda por ser local, y el ADR 11 se apoya en dos supuestos débiles. Tampoco se demostró mejora de rendimiento: el beneficio medido es la tolerancia a fallos |
| **`POST /games` sin límite** | **Conocido (ADR 8).** |
| **Sin revisión independiente** | **Aceptado.** El responsable del repo trabaja solo. `main` no tiene protección: exigir PR depende de activarla en Settings |
| **Correo institucional en `main`** | **Conocido; no se reescribe.** Lo lleva como autor `24d4321` (el *squash* de #15) y los 33 commits de la cadena lo llevarán al fusionarse. Quitarlo exigiría `--force`. Los commits nuevos usan la dirección `noreply` de GitHub, y las fusiones, `--author-email` |
| **Documentos desactualizados** | **Abierto.** `README.md`, `ARCHITECTURE.md` y `docs/CONTEXT.md` siguen describiendo el estado del 5 de noviembre |
| **Nombre del anexo en la historia pública** | **Abierto; quitarlo exigiría `--force`.** El nombre del archivo del anexo de la transcripción aparece en un enlace antiguo de 4 commits de `docs/delivery-nov-19`: `8246b8c`, `c703ae7`, `e6cd3c7` y `c62712f`. El archivo nunca se subió y la punta de la rama no lo nombra |
| **Reflog pendiente de limpiar** | **Abierto; espera el OK del responsable del repo.** El anexo y la historia anterior a parafrasear las citas siguen en el `.git` local de este equipo, fuera de cualquier rama. Esa carpeta `.git` no debe copiarse a otro equipo antes de limpiarlo |

## 6. Qué no se pudo verificar

**Desde este estado no se ejecutó ninguna prueba:** todo sale de lecturas de git, GitHub y documentos, y de una consulta DNS.

- **Cuentas y despliegue:** no se tiene acceso a Neon, Atlas, Render, Vercel ni DigitalPlat. Se sabe que el repo no tiene URL reales, no si ya existen cuentas.
- **Dominio:** solo hay consultas DNS públicas; no se vio el panel de registro ni el hosting.
- **`pnpm e2e:web` sobre el último commit:** los 22 de 22 son de la noche del 5 de noviembre, antes de `227c729`. Después solo cambiaron comentarios, el README y `smoke-web.mjs`. Las capturas están fuera del repo.
- **Edge con ventana visible:** corrió sin interfaz, con pestañas en un solo equipo. Tampoco se probó con dos laptops, red real, móvil ni Live Server.
- **Voz real en el producto:** no existe. Las cifras de voz son del spike, con una sola voz.
- **Causa del fallo de `smoke`.**
- **Pérdida de jugadas con escrituras pendientes,** porque ninguna prueba cubre ese caso.
- **Estrategia de fusión en GitHub:** solo se simuló con git local, sobre una versión anterior de `feat/web-game`.
- **Commits intermedios de cada PR:** se verificó la punta de cada rama.
- **Pasos manuales de `web/README.md`** tal como están escritos.
- **Equipo más débil:** no se sabe cuál es, ni la situación de la otra laptop.
- **Si el profesor aceptará los supuestos.**
- **Copia de respaldo de `docs/delivery-nov-19`:** hay un *bundle* local, fuera del repo, con el estado anterior a parafrasear las citas. Solo se comprobó con `git bundle verify`.
