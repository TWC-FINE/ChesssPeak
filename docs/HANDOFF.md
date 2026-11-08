# ChessSpeak: estado para el relevo

**Estado a 2026-11-06, 05:22 (UTC−5).** Reconstruido desde git, los PR, la CI y los documentos. Este documento no actualiza nada: si contradice a `git` o a GitHub, manda lo segundo.

**Añadido el 7 de noviembre:** el responsable del repo hizo a mano la prueba de voz con Web Speech `es-CO` en Edge, con el servidor local. Dictó los dos lados desde dos pestañas y jugó una partida completa sin fallos: se aplicaron las jugadas legales, se rechazaron las ilegales y se detectó el mate. Hubo una sola voz, la suya, así que **no sustituye la validación con otra persona.** La prueba corrió sobre `5ed174b`. Desde entonces #28 y #29 cambiaron `<mf-voice-input>`, así que el responsable del repo repetirá una pasada corta de Web Speech sobre el código actual, junto con la prueba de Whisper. También se cambió el puerto de Postgres en el `.env` local (ver «Notas para el README»). El resto del documento sigue con su estado del 6 de noviembre.

**Añadido el 8 de noviembre:** el despliegue existe, y se verificó desde fuera ese mismo día (ver «Verificación del despliegue»). **El límite de `/auth/guest` fallaba en Render;** se corrigió en #37 y se probó el mismo día (ver «Verificación del despliegue»). Falta probarlo desde otra red.

**Prueba de voz del 8 de noviembre, con una sola voz (la del responsable del repo):**
1. **Web Speech `es-CO`,** en <https://chessspeak.vercel.app> y en la web local: partida con dos pestañas, por voz y por texto, con confirmación y recarga a mitad de partida. Todo correcto.
2. **Whisper local,** en la web local y en la pública, con el agente en `127.0.0.1:8765` y la URL de Vercel en `AGENT_ALLOWED_ORIGINS`: funciona. El dashboard mostró 24 peticiones con 200 y sin errores, por ejemplo de 1,87 a 1,97 s por transcripción en el equipo del responsable del repo. Esos tiempos son orientativos, no una medición formal, y se tomaron con Docker encendido.
3. **Se nota más retraso con Whisper** que con Web Speech, como se esperaba.
4. **Permiso de red local de Edge:** no consta si apareció el aviso.

**Sigue sin probar:** la validación con otra voz, el dominio propio, Chrome y el límite por IP desde otra red. `trust proxy` falló, y #37 lo corrigió (ver «Verificación del despliegue»).

**En resumen:** dos invitados pueden jugar una partida completa escribiendo, en Edge, con servidor local. Eso ya está en `main`, tras fusionar la cadena de PR. La voz también funciona, pero **solo se ha probado con un reconocedor y un agente falsos**. Faltan la prueba con voz real, el Whisper real, el despliegue, la validación y los ensayos. Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).

**Equipo (decisión del 6 de noviembre):** el responsable del repo trabaja solo, sin revisión del compañero, y es el único que aprueba. Por eso ya no se espera ninguna firma para el contrato (#3) ni para la cadena de PR.

## Ramas y hashes

| Rama | Local | Remoto | Situación |
|---|---|---|---|
| `main` | `9567ca5` | `9567ca5` | Antes de este PR. Contiene la cadena, `docs/delivery-nov-19` y #18 a #30. La protección de rama la activa el responsable del repo en Settings |
| `feat/contract-v0` | `75c82f9` | `75c82f9` | PR #3, fusionado en `9a566aa` |
| `feat/game-room` | `9cf9cad` | `9cf9cad` | PR #10, fusionado en `8f32cfc` |
| `feat/guest-auth` | `05d9b73` | `05d9b73` | PR #11, fusionado en `05fd7a6` |
| `feat/create-game` | `3c3367f` | `3c3367f` | PR #12, fusionado en `9d1bb44` |
| `feat/game-gateway` | `90ab665` | `90ab665` | PR #13, fusionado en `de79815`; incluye el puerto `MovePersistence` |
| `feat/web-game` | `cbe8abb` | `cbe8abb` | PR #14, fusionado en `311c0fa` |
| `feat/move-persistence` | `813b8a3` | No existe | Solo local; sus commits ya están dentro de #13 |
| `docs/delivery-nov-19` | `2a34557` | `2a34557` | PR #16, fusionado con *squash* en `af163bd` |
| `docs/handoff-merged-chain` | `2559af5` | `2559af5` | PR #17, fusionado con *squash* en `76b0dfe` |
| `fix/smoke-browser-wait` | `53ebc2f` | `53ebc2f` | PR #18, fusionado con *squash* en `9db85f6` |
| `docs/handoff-smoke-sample` | `5e5229b` | `5e5229b` | PR #19, fusionado con *squash* en `23e4bcc` |
| `feat/health-live` | `738906b` | `738906b` | PR #20, fusionado con *squash* en `cd68b5a` |
| `fix/build-web-requires-api-url` | `f165ebc` | `f165ebc` | PR #21, fusionado con *squash* en `579e14e` |
| `chore/render-exact-node` | `77c29fa` | `77c29fa` | PR #22, fusionado con *squash* en `86044bc` |
| `docs/deploy-checklist` | `a3f9daf` | `a3f9daf` | PR #23, fusionado con *squash* en `76c4e04` |
| `docs/handoff-deploy-prs` | `dfb400e` | `dfb400e` | PR #24, fusionado con *squash* en `12d39a1` |
| `feat/voice-metrics` | `6afb43f` | `6afb43f` | PR #25, fusionado con *squash* en `ad1b178` |
| `feat/push-to-talk` | `37885f2` | `37885f2` | PR #26, fusionado con *squash* en `7471bf3` |
| `feat/web-speech` | `f6fef93` | `f6fef93` | PR #27, fusionado con *squash* en `5ed174b` |
| `feat/mf-history` | `66984ca` | `66984ca` | PR #28, fusionado con *squash* en `c91e51b` |
| `feat/whisper-adapter` | `d9f6e22` | `d9f6e22` | PR #29, fusionado con *squash* en `ea21e65` |
| `docs/voice-status` | `4108f53` | `4108f53` | PR #30, fusionado con *squash* en `9567ca5` |

Cadena fusionada en `main`, en este orden: #15 con *squash* (`24d4321`), y con commit de fusión #3 (`9a566aa`), #10 (`8f32cfc`), #11 (`05fd7a6`), #12 (`9d1bb44`), #13 (`de79815`) y #14 (`311c0fa`). El diff de cada PR de la cadena fue igual a su línea base, y su CI se revisó por trabajo con la base en `main`.

**Ramas remotas borradas el 6 de noviembre**, tras comprobar con `git branch -r --merged origin/main` que `main` contiene sus puntas: `feat/contract-v0` (`75c82f9`), `feat/game-room` (`9cf9cad`), `feat/guest-auth` (`05d9b73`), `feat/create-game` (`3c3367f`), `feat/game-gateway` (`90ab665`) y `feat/web-game` (`cbe8abb`). También `docs/contributing-solo` (`f68bb97`): se fusionó con *squash*, así que no aparece en esa comprobación, y se borró tras verificar que `main` conserva la excepción de `CONTRIBUTING.md`. Tras anotar aquí sus hashes, se borran también `docs/delivery-nov-19` (`2a34557`) y `docs/handoff-merged-chain` (`2559af5`), cuyos árboles coinciden con sus *squash* (`af163bd` y `76b0dfe`). También se borraron las ramas de #18 a #30 listadas en la tabla, tras comprobar que el cambio de cada una coincide con su *squash*.

**CI por trabajo:** `verify`, `integration`, `secrets` y `smoke` están en verde en la última ejecución de `main` y de los 6 PR. En #14 (`cbe8abb`): servidor 198 tests, integración 33, `local-agent` 46, `voice-parser` 84, web 66 y `smoke` 13 comprobaciones. **Hay que mirar cada trabajo por separado:** ver el riesgo de `smoke`.

## Verificación del despliegue (8 de noviembre)

Hecha desde fuera, sin acceso a los paneles ni a las bases, sobre `2c48755`. Según GitHub, Render terminó su despliegue de ese commit a las 06:40 UTC y Vercel también lo marcó como desplegado. Docker estaba apagado.

| Comprobación | Resultado |
|---|---|
| `/health/live` y `/health` | Primera respuesta tras dormir: 52,5 s; la segunda vez, 63,7 s. `/health`: `status: ok`, `postgres: up`, `mongo: up` |
| HTTPS | Certificados válidos en las dos URL. HTTP redirige a HTTPS, y Vercel envía `Strict-Transport-Security` |
| CORS | El preflight de `/auth/guest` y `/games` devuelve `access-control-allow-origin` para el origen de Vercel, y no para otro origen |
| Partida por la API | Script desde fuera: dos `POST /auth/guest` (201), `POST /games` (201) y dos clientes Socket.IO por `wss`. Cuatro jugadas llegaron a los dos lados con el mismo FEN |
| Persistencia | Con Render dormido y despertado, un proceso nuevo reconstruyó la partida al volver a entrar: las jugadas, que salen de Mongo, y los asientos y el resultado por abandono, que salen de Postgres. No se consultaron las bases |
| Web publicada | 200. Carga sus scripts y los tres microfrontends desde el mismo origen. Apunta a la API de Render. En Edge sin interfaz, sin pedir nada a otros hosts, entra como invitado y conecta por `wss`. Único error: `favicon.ico` da 404 |
| Límite de `/auth/guest` (`trust proxy`) | **Falló con `trust proxy = 1`:** desde una misma IP, sin cabeceras, el contador fue 9, 8, 9, 7, alternando entre dos claves, así que el servidor no veía la IP del cliente. Con `X-Forwarded-For: 198.51.100.7, 1.2.3.4`, el contador también empezó de nuevo |
| Límite de `/auth/guest` tras #37 | Corregido en #37 (`e06ecbc`). Probado el 8 de noviembre a las 20:29 UTC, desde una misma IP: cuatro peticiones sin cabeceras dieron 9, 8, 7 y 6, y una con `X-Forwarded-For: 198.51.100.7, 1.2.3.4` dio 5. Una con `CF-Connecting-IP: 198.51.100.8` recibió 403 de Cloudflare (`error code: 1000`, sin cabeceras de Render): no llega al servidor. Eso no prueba que el contador ignore esa cabecera, solo que no pasa. **Sin probar desde otra red** |

**Sin probar en esta verificación:** voz real y Whisper sobre la URL pública (los probó después a mano el responsable del repo; ver arriba), el dominio propio, una partida con dos navegadores reales contra la nube y el límite desde otra red. **No es posible sin modificar el repo:** `smoke:web` y `e2e:web` contra la URL pública, porque levantan su propio servidor en `127.0.0.1`.

**Observación sin efecto conocido:** `config.js` publicado incluye `PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG`, una variable de sistema de Vercel. Llega porque `scripts/build-web.mjs` copia toda variable `PUBLIC_*`. La web no la usa.

## 1. Estado por requisito del profesor

**Nota:** donde las tablas de las secciones 1 y 2 dicen «solo en PR», «en PR» o «solo en `docs/delivery-nov-19`», ese trabajo ya está en `main`.

| Requisito | Estado | Evidencia |
|---|---|---|
| **Nube** | **Desplegado el 8 de noviembre y verificado desde fuera,** salvo el límite de `/auth/guest` | Web en <https://chessspeak.vercel.app> y API en <https://chessspeak-server.onrender.com>. Ver «Verificación del despliegue» |
| **Módulo local** | **Agente: hecho y verificado. Desde el navegador: probado a mano con el Whisper real el 8 de noviembre,** en la web local y en la pública, con una sola voz | `local-agent` en `main` (#6). Adaptador y selector en #29. ADR 6 |
| **Sockets** | **Hecho y verificado, solo en PR** | #13 y #14: integración con bases reales (`game-flow.int-spec.ts`) y `pnpm e2e:web`, 22 de 22 en Edge. Solo en local, sin nube |
| **Micrófono** | **Hecho. Probado a mano con voz real, Web Speech el 7 y el 8 de noviembre y Whisper el 8,** con una sola voz | Web Speech en #27 y captura de audio en #29. El e2e usa un `SpeechRecognition` falso y el micrófono falso del navegador |
| **Dos bases de datos** | **Hecho en local; Neon y Atlas, desplegados el 8 de noviembre** y en `up` según `/health` | Partidas y jugadas en #12 y #13. `voice_attempts` en #25, con integración contra Mongo real |
| **GitHub** | **Hecho y verificado** | Repo público, PR, CI y `LICENSE` GPL-3.0. Matices: el ADR 9 no está escrito y el repo se llama `ChesssPeak`, no `chessspeak` |
| **Microfrontends** | **Hecho en local** | Los 3 son reales: `<mf-game>` (#14), `<mf-voice-input>` (#26, #27 y #29) y `<mf-history>` (#28). `smoke:web` y `e2e:web` |
| **Balanceo** | **Whisper: hecho y verificado, cumplimiento sin confirmar. `move-workers`: no empezado** | Pool y dashboard en `main` (#6). La evidencia de carga y el ensayo con un worker muerto están solo en `docs/delivery-nov-19`. ADR 10 revisado y ADR 11 solo en esa rama. Del pool solo existe el puerto |
| **Dominio** | **Registrado y delegado; aún no funciona. En espera del profesor** | `chessspeak.dpdns.org` está delegado a `ns1` y `ns2.magicsolutions.co`, que rechazan las consultas (*lame delegation*, `REFUSED`, comprobado el 6 de noviembre). Mínimo garantizado: la URL `vercel.app`, publicada desde el 8 de noviembre |

**Criterios de aceptación de `SPEC.md` §6:**

| # | Criterio | Estado |
|---|---|---|
| 1 | Partida completa por voz con Web Speech | Verificado con un `SpeechRecognition` falso, y a mano con voz real el 7 de noviembre (local) y el 8 (local y URL pública), con una sola voz. **Falta la validación con otra persona** |
| 2 | Una jugada por voz con Whisper desde el navegador | Verificado con un agente falso, y a mano con el Whisper real el 8 de noviembre, en local y en la URL pública, con una sola voz |
| 3 | Desconexión y reconexión | Verificado en PR, en local |
| 4 | Una frase ambigua o ilegible no mueve piezas | Verificado por texto y con reconocedor falso; **falta con voz real** |
| 5 | `voice_attempts`, `game_moves` y Postgres | Verificado en local, con bases reales |
| 6 | Backend en la nube, repo público y CI en verde | Backend en Render desde el 8 de noviembre, sobre `2c48755`, cuya CI quedó en verde por trabajo. Falta corregir el límite de `/auth/guest` |
| 7 | `quality.md`, ADR y README probado con un clon nuevo | No empezado; hay ADR parciales |

## 2. Estado por fase del `PLAN.md`

| Fase | En `main` | Solo en PR abiertos | Solo en local | No existe |
|---|---|---|---|---|
| **0. Fundaciones** | Monorepo, esqueletos, shell y 3 proyectos, `serve:web`, CI, esquemas, `/health`, archivos de despliegue | Contrato (#3), sin fusionar | Nada | Despliegue en Neon, Atlas, Render y Vercel; ADR 9 |
| **1. Partida entre invitados** | `local-agent` | `GameRoom` (#10), auth y ADR 8 (#11), `POST /games` (#12), gateway, guardado y ADR 7 (#13), shell, `<mf-game>` y caja de texto (#14) | Nada | Despliegue |
| **2. Voz de punta a punta** | Parser, fin de partida, reconexión, Web Speech, adaptador Whisper, `voice-metrics`, telemetría, `<mf-history>` real, aviso sin Web Speech, latencia declarada y ADR 6 | Nada | Nada | Prueba con voz real |
| **3. Validación y entrega** | Nada | Nada | Kit para la otra laptop (sin resultados) | `docs/quality.md`, 40 frases, validación, ensayos, clon nuevo, video, `web/dist` en la entrega, tag `v1.0` |

**Llegó a `main` con #16:** ADR 11, revisión del ADR 10 y ADR 1, supuestos, evidencia de carga, kit y este archivo. **Pool de `move-workers`:** no existe.

## 3. Qué falta, por prioridad

| # | Tarea | Responsable |
|---|---|---|
| 1 | Sin definir: hora y duración de la demo, y si el profesor abrirá el proyecto él mismo | Responsable del repo |
| 2 | Revisar lo fusionado de #3 y #10 a #14, incluidos los códigos de error provisionales | Responsable del repo |
| 3 | Hecho: excepción de commits de fusión en `CONTRIBUTING.md` (#15) | Responsable del repo |
| 4 | Hecho: cadena fusionada en orden | Responsable del repo |
| 5 | Hecho: cuentas y despliegue (8 de noviembre). `trust proxy` falló y se corrigió en #37 (`e06ecbc`), probado el mismo día. Pendiente: probar el límite desde otra red | Responsable del repo |
| 6 | Lote del parser: fuera del plan, se queda `spike-parser-freeze` | Responsable del repo |
| 7 | Decidir el pool de `move-workers` tras las pruebas de voz y el despliegue, y dar el OK explícito antes de empezar. Hasta entonces se considera no recortable | Responsable del repo |
| 8 | Hecho: Web Speech, pulsar para hablar y confirmación por voz (#26 y #27). Pruebas manuales con voz real el 7 y el 8 de noviembre, con una sola voz | Responsable del repo (voz real) |
| 9 | Hecho: `voice-metrics` y telemetría (#25 y #26) | Claude |
| 10 | Hecho: adaptador Whisper y selector (#29). Prueba manual con el Whisper real el 8 de noviembre, con una sola voz | Responsable del repo (voz real) y Claude |
| 11 | Hecho: `<mf-history>` real (#28) | Claude |
| 12 | Pool de `move-workers`, tras el OK explícito | Claude, tras el OK del responsable |
| 13 | ADR 9 y C4. El ADR 6, `ARCHITECTURE.md` y `docs/CONTEXT.md` ya están | Claude, tras el OK del responsable |
| 14 | 40 frases de validación | Responsable del repo |
| 15 | Medir los dos equipos con el kit y repetir la carga de Whisper en el más débil | Responsable del repo |
| 16 | Medir en Chrome, si no se recorta | Responsable del repo (voz real) |
| 17 | Validación con otra voz y `quality.md`. **Sin definir quién aporta la otra voz** | Responsable del repo |
| 18 | Ensayos con dos laptops, clon nuevo y video de respaldo. **Sin definir la segunda laptop** | Responsable del repo |
| 19 | Commit de entrega con `web/dist` y tag `v1.0` | Responsable del repo decide; Claude lo prepara |
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
- **Puerto de Postgres en el equipo de escritorio (7 de noviembre):** su `.env` local usa el puerto 15432 en lugar del 55432. Windows reservó el rango 55400–55499 y Docker arrancó Postgres sin publicar el 55432, así que `/health` lo daba por caído. La contraseña, el usuario y la base estaban bien. Desde #33, el valor por defecto del repo también es 15432; un `.env` anterior conserva el 55432 hasta cambiarlo a mano (README, «Problema conocido: Postgres caído en Windows»).
- **Arranque automático:** con `restart: unless-stopped`, los contenedores se vieron en marcha antes de ejecutar `docker compose up -d`. La causa probable, no comprobada, es que arrancan al abrir Docker Desktop. `docker compose up -d` no los recreó.
- **Estado previo reutilizado:** en el equipo de escritorio, sobre `cbe8abb`, `pnpm verify` pasó con 485 tests y `pnpm test:integration` ejecutó 6 suites y 33 tests, sin «omitido». Pero `pnpm install --frozen-lockfile` reutilizó `node_modules` (199 ms) y la migración respondió `No pending migrations to apply`, porque ya estaban aplicadas. Esto no prueba ni una instalación limpia ni las migraciones sobre una base vacía: sigue pendiente el clon nuevo.

### Orden de trabajo
**Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).** La prioridad es este orden, no un calendario por días.

1. **Fusionar la cadena** #3 y #10 a #14 y el PR de `docs/delivery-nov-19` ✅, antes del despliegue.
2. **Despliegue** en Render, Neon, Atlas y Vercel, con las cuentas del responsable del repo.
3. **Voz de punta a punta:** Web Speech `es-CO` con 400 ms, `voice:attempt` y `voice_attempts`, y `<mf-history>` real.
4. **Adaptador de Whisper local.**
5. **Pool de `move-workers`** (ADR 11), con OK explícito del responsable del repo antes de empezar. Se decide tras las pruebas de voz y el despliegue. **Hasta entonces se considera no recortable.**
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

### Plan de despliegue aprobado (Paso C)
**El código y los documentos están en `main` (#20 a #23), pero aún no se ha desplegado:** faltan las cuentas, y `render.yaml` y `docs/deploy.md` no se han probado contra los servicios reales. Las cuentas y credenciales las pone el responsable del repo en cada panel, nunca en el repo.

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
| **`smoke` inestable en CI** | **Abierto, sin causa conocida.** Falló 3 de 3 en `fa5c168` y pasó 3 de 3 en `cbe8abb`. Mismo error antes en `main` (`2d287ea`). También falló en #13 (`90ab665`, con la base en `main`, ejecución 42315165037), con el texto `✗ la prueba terminó sin errores — tiempo agotado esperando: el navegador`; con un único relanzamiento pasó y la fusión siguió. Igual en #16 (`2a34557`, ejecución 42318700978): mismo texto y, con un único relanzamiento, pasó. Ese registro añade `estado del navegador: sigue en marcha` y errores de `dbus` en la salida del navegador, que no se dan por causa. Son 2 fallos en las 15 primeras ejecuciones del 6 de noviembre anteriores a fusionar #16. La causa sigue sin determinar. Hipótesis sin confirmar: un arranque lento del navegador, porque en el registro de #16 no aparecen ni `DevTools listening` ni un error de puerto. `scripts/smoke-web.mjs` espera ahora hasta 30 s (antes, 10 s) y registra cuánto tarda el navegador; en un fallo, también si anunció su puerto. Tiempo de arranque del navegador en CI, que `scripts/smoke-web.mjs` registra en cada ejecución: 8755, 10 960, 977, 9347, 700, 6010, 827, 935, 661, 982, 11 448, 6138, 8899, 7611, 11 487, 6612 y 7241 ms, frente a unos 900 a 1200 ms en local. Tres de esas ejecuciones superaron el antiguo límite de 10 s, y pasaron por la espera de 30 s. **El 7 de noviembre, en #32 (`ae8fb88`, ejecución 42427125756), tardó 14 836 ms, el arranque más lento registrado:** pasó, pero ya está a la mitad de la espera de 30 s. **El 8 de noviembre, las tres ejecuciones pasaron:** 793 ms en #34 (`dc93030`, ejecución 42505751119), 7331 ms en `main` (`3b4299d`, ejecución 42507024317) y 9884 ms en #35 (`f6fdc15`, ejecución 42507207248). Parece haber dos grupos, de menos de 1 s y de 6 a 11 s. Sigue siendo una hipótesis, y el riesgo sigue abierto. Una espera mayor podría ocultar el problema sin demostrar la causa: no se da por arreglado sin varias ejecuciones seguidas en verde, y no bloquea el despliegue. Con `continue-on-error`, el resultado global puede decir verde aunque falle |
| **Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor)** | **Sin definir:** hora y duración de la demo, y si el profesor abrirá el proyecto él mismo. |
| **Dominio** | **En espera del profesor; mínimo garantizado: la URL `vercel.app`.** Delegado a `ns1` y `ns2.magicsolutions.co`, que rechazan las consultas (*lame delegation*). No se sabe qué hosting es, qué permite alojar ni si tiene HTTPS, que es obligatorio para el micrófono |
| **Cadena de 6 PR** | **Cerrado.** Fusionada en orden con commits de fusión; los hashes están en «Ramas y hashes» |
| **Pérdida de jugadas si el servidor muere** | **Aceptado y documentado (ADR 7), sin prueba.** Las jugadas pendientes de guardar se pierden. Los jugadores pueden haberlas visto |
| **Fase 0 sin desplegar** | **Cerrado el 8 de noviembre:** desplegado. CORS, verificado. El límite de `/auth/guest`, corregido en #37. La memoria en Render sigue sin medir |
| **Límite de `/auth/guest` en Render** | **Corregido en #37; falta la prueba desde otra red.** Depende del supuesto de que Cloudflare siga delante de Render (ADR 8). Ver «Verificación del despliegue» |
| **Render gratuito dormido** | **Abierto, aceptado.** La primera respuesta tras dormir tardó 52,5 s el 8 de noviembre. Hay que despertarlo antes de evaluar |
| **Postgres 18 en Neon sin CI** | **Abierto.** Según el responsable del repo, Neon corre Postgres 18 y tiene aplicadas las dos migraciones; la CI y Docker usan `postgres:17`. La partida de prueba del 8 de noviembre funcionó contra Neon, pero ninguna prueba automática corre contra 18 |
| **`0.0.0.0/0` en Atlas** | **Aceptado** (`docs/deploy.md`, «Riesgos»): Render gratuito no tiene IP fija |
| **Chrome sin medir** | **Abierto, recortable.** Si la entrega la abre otra persona, puede ser en Chrome |
| **Balanceo sin aceptación** | **Abierto.** Whisper quedó en duda por ser local, y el ADR 11 se apoya en dos supuestos débiles. Tampoco se demostró mejora de rendimiento: el beneficio medido es la tolerancia a fallos |
| **`POST /games` sin límite** | **Conocido (ADR 8).** |
| **Sin revisión independiente** | **Aceptado.** El responsable del repo trabaja solo. `main` no tiene protección: exigir PR depende de activarla en Settings |
| **Correo institucional en `main`** | **Conocido; no se reescribe.** Lo llevan como autor `24d4321` (el *squash* de #15), las 6 fusiones de la cadena (`9a566aa`, `8f32cfc`, `05fd7a6`, `9d1bb44`, `de79815` y `311c0fa`), los *squash* de #16 (`af163bd`), #17 (`76b0dfe`), #18 (`9db85f6`), #19 (`23e4bcc`), #20 (`cd68b5a`), #21 (`579e14e`), #22 (`86044bc`), #23 (`76c4e04`), #24 (`12d39a1`), #25 (`ad1b178`), #26 (`7471bf3`), #27 (`5ed174b`), #28 (`c91e51b`), #29 (`ea21e65`) y #30 (`9567ca5`), y los 33 commits de la cadena. Quitarlo exigiría `--force`. Los commits nuevos hechos en local usan la dirección `noreply` de GitHub. **Resultado de la prueba con #3:** `gh pr merge --author-email` con la dirección `noreply` responde `Invalid email address`, y sin esa opción la fusión lleva el correo institucional, aunque el correo privado esté activo en la cuenta. Se aceptó así para las 5 fusiones restantes, y los *squash* hechos con `gh` también lo llevan |
| **Voz real con una sola voz** | **Abierto: falta la validación con otra persona.** Web Speech y Whisper se probaron a mano el 8 de noviembre, en local y en la URL pública, con la voz del responsable del repo (Web Speech también el 7). Los tiempos de Whisper de esa prueba son orientativos, con Docker encendido. Las cifras del spike no son cifras del producto |
| **Entrada bloqueada tras terminar una partida** | **Corregido en #27 (`5ed174b`).** `<mf-voice-input>` nunca reiniciaba `ended`, así que la partida siguiente en la misma pestaña quedaba bloqueada hasta recargar, también en la caja de texto. Ya estaba en `main`. Se encontró leyendo el código para el e2e, no por un fallo |
| **Nombre del anexo en la historia pública** | **Abierto; quitarlo exigiría `--force`.** El nombre del archivo del anexo de la transcripción aparece en un enlace antiguo de 4 commits de `docs/delivery-nov-19`: `8246b8c`, `c703ae7`, `e6cd3c7` y `c62712f`. El archivo nunca se subió y la punta de la rama no lo nombra |
| **Reflog pendiente de limpiar** | **Abierto; espera el OK del responsable del repo.** El anexo y la historia anterior a parafrasear las citas siguen en el `.git` local de este equipo, fuera de cualquier rama. Esa carpeta `.git` no debe copiarse a otro equipo antes de limpiarlo |

## 6. Qué no se pudo verificar

**Desde este estado no se ejecutó ninguna prueba:** todo sale de lecturas de git, GitHub y documentos, y de una consulta DNS.

- **Cuentas y despliegue:** no se tiene acceso a Neon, Atlas, Render, Vercel ni DigitalPlat. Se sabe que el repo no tiene URL reales, no si ya existen cuentas.
- **Dominio:** solo hay consultas DNS públicas; no se vio el panel de registro ni el hosting.
- **`pnpm e2e:web`:** 57 de 57 en Edge 156 sobre #29. No corre en CI, y usa un reconocedor, un agente y un micrófono falsos.
- **Edge con ventana visible:** corrió sin interfaz, con pestañas en un solo equipo. Tampoco se probó con dos laptops, red real, móvil ni Live Server.
- **Voz real en el producto:** pruebas manuales con una sola voz, Web Speech el 7 y el 8 de noviembre y Whisper el 8. Falta otra voz. Las cifras de voz son del spike, con una sola voz, salvo los tiempos orientativos de Whisper del 8 de noviembre.
- **Causa del fallo de `smoke`.**
- **Pérdida de jugadas con escrituras pendientes,** porque ninguna prueba cubre ese caso.
- **Estrategia de fusión en GitHub:** solo se simuló con git local, sobre una versión anterior de `feat/web-game`.
- **Commits intermedios de cada PR:** se verificó la punta de cada rama.
- **Pasos manuales de `web/README.md`** tal como están escritos.
- **Equipo más débil:** no se sabe cuál es, ni la situación de la otra laptop.
- **Si el profesor aceptará los supuestos.**
- **Copia de respaldo de `docs/delivery-nov-19`:** hay un *bundle* local, fuera del repo, con el estado anterior a parafrasear las citas. Solo se comprobó con `git bundle verify`.
