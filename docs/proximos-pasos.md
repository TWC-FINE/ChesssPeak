# Próximos pasos

Dónde quedó el trabajo y cómo seguir desde otro equipo. Escrito el 5 de noviembre de 2026. La fecha, el orden de trabajo y el alcance vigentes están en [PLAN.md](../PLAN.md); aquí están lo pendiente y los supuestos.

## Cómo retomar
```bash
git fetch origin
git switch main
pnpm install
```
- **Para programar:** crear una rama por tema desde `main`.
- **Fuera de git:** `.env` (`pnpm env:init`), Whisper y sus modelos (`pnpm --filter @chessspeak/spike-whisper-local download`) y los WAV del spike.

## Decisiones ya tomadas
- **Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor).** Con **demo en vivo**.
- **Documentación de arquitectura:** el profesor pide **C4**. Niveles 1 y 2; el formato es un supuesto.
- **Dominio:** obtenido con [DigitalPlat FreeDomain](https://github.com/DigitalPlatDev/FreeDomain), como pidió el profesor. **En espera del profesor.** Mínimo garantizado: la web publicada en Vercel con su URL `vercel.app`.
- **Despliegue:** supuesto Render, Neon y Atlas. Ya no se espera una sugerencia del profesor. Crear las cuentas y las credenciales queda en manos del equipo.

## Puntos abiertos
**Ninguno está resuelto.** Solo salen de aquí con evidencia o con una confirmación expresa.

- **`smoke` en CI falla sin causa conocida.**
  - **Qué pasó:** falló 3 de 3 en `fa5c168`, con `tiempo agotado esperando: el navegador`, y pasó 3 de 3 en `cbe8abb`. Entre ambos commits solo cambió que el script guarda la salida de error de Chrome en lugar de descartarla, y no se sabe si eso influye.
  - **Otros datos:** un control sobre `90ab665` pasó a la misma hora, y el mismo error ya apareció en `main` (`2d287ea`).
  - **Si vuelve a fallar:** el registro de CI muestra ahora el estado del navegador y su salida de error.
  - **Arranque más lento registrado:** 14 836 ms el 7 de noviembre, en #32 (ejecución 42427125756). Pasó por la espera de 30 s; sigue abierto.
- **El resultado global de CI puede decir verde aunque `smoke` falle,** porque `ci.yml` lo marca con `continue-on-error`. Ocurrió en `fa5c168`: la ejecución figuró como `success`. **Hay que mirar siempre cada trabajo por separado,** con `gh pr checks <número>`.
- **Sin definir:** hora y duración de la demo, y si el profesor abrirá el proyecto él mismo.

## Dominio
- **Prioridad:** en espera del profesor, que lo agregará en el hosting. Mínimo garantizado: la web publicada en Vercel con su URL `vercel.app`.
- **Estado (comprobado el 6 de noviembre):** `chessspeak.dpdns.org` está delegado a `ns1` y `ns2.magicsolutions.co`, y esos servidores rechazan las consultas (*lame delegation*, `REFUSED`). Por eso el nombre todavía no resuelve. No es un problema de propagación.
- **No usa DigitalPlat DNS:** usa nameservers externos. **No registrar otro dominio ni cambiar los nameservers.** Hay un cupo gratuito por cuenta y el dominio tiene fecha de vencimiento.
- **Cómo saber que ya funciona:** `nslookup -type=NS chessspeak.dpdns.org` deja de responder `Server failed`. También se puede revisar `whatsmydns.net`.
- **Sin saber todavía:** qué hosting es, qué permite alojar, si tiene HTTPS y si habrá acceso a un panel.
- **Después:** los registros DNS se administran en ese hosting, no en DigitalPlat. Habrá que añadir el dominio a `CORS_ORIGINS` y a `docs/deploy.md`.
- **Riesgos:** el micrófono exige HTTPS. Además, si la demo se abre desde el dominio, el navegador puede bloquear la llamada de la web a `127.0.0.1` (Whisper). Hay que ensayarlo en Edge.

## Antes de cualquier medición
Vale para la medición en Chrome, la laptop más débil y cualquier prueba de carga.

1. **Apagar Docker** primero. Las bases locales consumen CPU y RAM, y eso puede cambiar las cifras.
2. **Registrar si estaba encendido,** junto con los resultados. El comando está en [docs/kit-equipo-debil/LEEME.txt](kit-equipo-debil/LEEME.txt), paso 3.

## Limpiar las partidas de prueba
Una prueba del 5 de noviembre dejó 2 partidas en la base local de desarrollo. Se borran con Docker encendido, desde la raíz del repo:

```powershell
docker compose exec postgres psql -U chessspeak -d chessspeak -c "select id, status, white_name, black_name, created_at from games"
docker compose exec postgres psql -U chessspeak -d chessspeak -c "delete from games where id in ('04e554c8-d946-4ea4-88b9-e6bf352b1b99','eee3c41f-5fb2-46b6-8831-33e2a16e4f11')"
```

El primero las muestra; el segundo debe responder `DELETE 2`. Solo afecta a esa base local: no toca la de tests ni la nube.

## Balanceo: Whisper como servicio, por URLs (ADR 12)
**Decisión vigente desde el 14 de noviembre: [ADR 12](adr/0012-whisper-como-servicio-con-pool-por-urls.md).** Whisper se balancea como servicio HTTP desde el `local-agent`, en modo URLs.

- **Construido y medido:** el pool con 3 contenedores locales. La prueba de aislamiento no perdió ninguna petición en 3 de 3 repeticiones ([evidencia](evidence/url-pool-phase-c/README.md)).
- **AWS EC2 sigue sin probarse.**
- El pool de `move-workers` del ADR 11 no se construyó, y ese ADR quedó sustituido.

**Antecedente, decisión del 5 de noviembre (sustituida):** El profesor no aprobó el modo de dictado y habló de repartir las jugadas entre servicios camino a la base de datos. Su «Eso puede ser» se toma como aprobación tentativa, no como confirmación. El supuesto más débil, el diseño, los límites y el criterio de éxito están en el [ADR 11](adr/0011-balanceo-de-jugadas-con-move-workers.md). También cambió lo que se puede afirmar del pool de Whisper: ver la [revisión del ADR 10](adr/0010-balanceo-de-carga-en-local-agent.md#revisión-del-5-de-noviembre).

## Propuesta descartada: modo de dictado
**No se construye** (motivos en el ADR 11). Se conserva solo como registro.

**Problema.** En una partida, el balanceador de Whisper recibe una petición a la vez, porque los turnos alternan y cada jugador tiene su agente ([ADR 10](adr/0010-balanceo-de-carga-en-local-agent.md)). Toda la carga medida hasta ahora es sintética.

**Idea.** Un modo para una sola persona, que dicta de corrido una planilla de torneo ya jugada. Las peticiones llegan seguidas al mismo Whisper local y se forma una cola real.

**Cómo funciona:**
1. Cada jugada es un clip, con una pulsación por jugada. El audio se descarta tras transcribirlo; nunca se guarda.
2. Los clips se transcriben en paralelo, con un límite de envíos y reintentos desde el navegador.
3. El navegador reordena los resultados y resuelve en secuencia con `resolve()` de `voice-parser`, sin modificarlo.
4. **El tablero se actualiza en vivo**, con un contador como “Dichas: 40 · En el tablero: 31”.
5. Una jugada ambigua o sin coincidencia detiene el tablero y se marca. Se puede seguir dictando y corregirla después.
6. Al final se revisa y se aprueba la partida, y se exporta a **PGN**, sin tocar el servidor ni las bases.

**Qué decidir o cambiar si se aprueba:**
- **Confirmación:** se propone una revisión al final en lugar de confirmar cada jugada. Cambia SPEC.md y requiere un añadido al ADR 5.
- **Límites del agente:** hoy, con 15 s de espera y una cola de 12, fallarían peticiones.
- **Workers:** el modo necesita su propia configuración (por ejemplo, `LB_WORKERS=3`), porque con varios workers una sola petición es más lenta. Cada worker usa unos 580–700 MB de RAM.
- **Dónde vive:** dentro de `<mf-voice-input>` o como cuarto microfrontend. Si necesita tipos nuevos en `shared/`, van en un PR que aprueba el responsable del repo.
- **Esfuerzo:** la versión mínima se estima en 2 o 3 días. Si el núcleo se retrasa, se recorta y queda la carga de prueba.

**Qué esperar.** Con las tasas medidas el 4 de noviembre (0,37 y 0,45 respuestas por segundo), balancear no crea CPU: el total para 80 medias jugadas pasaría de unos 216 s a unos 178 s. Es una estimación, porque el dictado real aún no se ha medido. El argumento más fuerte es la tolerancia a fallos: si un worker cae a mitad del dictado, los demás siguen. Esta estimación usa las tasas del 4 de noviembre, anteriores a las repeticiones del 5, y no se recalculó.

**Descartadas:** modo club con varios tableros (el micrófono no funciona por HTTP en la red local), Whisper central en la nube (sin CPU en el plan gratuito y se pierde el módulo local), balancear NestJS (exige Redis y sesiones pegajosas) y Stockfish (no pasó su prueba).

## Supuestos
**Ya no se le puede preguntar nada más al profesor. Ninguno de estos puntos está confirmado por él.** Si alguno cambia, se corrige aquí.

| Tema | Supuesto | Riesgo o pendiente |
|---|---|---|
| Entrega | Fecha de entrega: 19 de noviembre de 2026 (indicada por el profesor) | Se supone que la demo es ese mismo día. Sin definir: hora y duración de la demo |
| Despliegue | Render, Neon y Atlas, como en `render.yaml` y `docs/deploy.md`. `MOVE_WORKERS=0` en Render hasta medir la memoria | El profesor iba a sugerir dónde y cómo. Hay que crear las cuentas |
| Dominio | En espera del profesor. Mínimo garantizado: la web publicada en Vercel con su URL `vercel.app` | Delegado a `ns1` y `ns2.magicsolutions.co`, que rechazan las consultas. No se sabe qué permite alojar ese hosting |
| Microfrontends y Live Server | 3 custom elements sin Module Federation ni despliegues independientes (ADR 2). `web/dist` va en el commit de entrega, solo al congelar el código, y abre en `http://127.0.0.1:5500/web/dist/index.html` | Ensayar exactamente ese modo. La demo sigue usando `serve:web` |
| Chrome | Sigue como recorte. Si la entrega la abre otra persona puede ser en Chrome | La medición es con voz real |
| Rúbrica | No se conocen pesos: se cubren todos los requisitos de SPEC.md por igual | Podría pesar más algo que tratamos como secundario |
| Demo | Dos laptops (la segunda, sin definir), datos del celular y video de respaldo. Guion de unos 10 minutos (cifra de trabajo), con versión corta | Sin definir: hora y duración. Tampoco se conoce la red de la sala |
| Quién abre el proyecto | Basta la demo y el repo; el README se prueba con un clon nuevo en una máquina limpia | Sin definir si lo abre él mismo. Si lo abre, Whisper y las cuentas pesan más |
| C4 | Niveles 1 y 2 (contexto y contenedores) en Mermaid, más los ADR y los escenarios de calidad | Puede esperar otro formato |
| Balanceo | Ver el [ADR 12](adr/0012-whisper-como-servicio-con-pool-por-urls.md), que sustituye al ADR 11, y la [revisión del ADR 10](adr/0010-balanceo-de-carga-en-local-agent.md#revisión-del-5-de-noviembre) | Lo medido son contenedores en una misma máquina: no se da por resuelto, y hay que decirlo al presentar. EC2 sin probar |

## Lista de tareas
Las tareas que dependen de un supuesto lo indican. **Marcado el 6 de noviembre:** `[x]` significa hecho; esos PR ya están fusionados en `main`.

**Preparación**
- [x] 1. Abrir el PR de `docs/delivery-nov-19`. (PR #16)
- [ ] 2. Levantar el entorno local: `pnpm env:init` y `docker compose up -d`.

**Servidor**
- [x] 3. Auth de invitados: `POST /auth/guest`, token firmado y throttler. (PR #11)
- [x] 4. Partidas: `POST /games`, con guardado en la tabla `games`. (PR #12)
- [x] 5. Gateway Socket.IO: `game:join`, `game:move` y `game:resign` sobre `GameRoom`. (PR #13)
- [x] 6. Guardado de jugadas en Mongo con `appendMove`, y rehidratación desde ahí. (PR #13)
- [x] 7. Reconexión y abandono, con plazo configurable (60 s por defecto, provisional). (PR #13)
- [x] 8. Telemetría de voz: ingesta de `voice:attempt`; `player` lo pone el servidor. (PR #25)

**Web**
- [x] 9. `<mf-history>`: lista de jugadas a partir de `cs:move-applied`. (PR #28)
- [x] 10. Shell real: sesión y socket único, en lugar de `web/shell/src/mocks.ts`. (PR #14)
- [x] 11. `<mf-game>`: tablero real, `game:state`, `game:moved` y flecha de confirmación. (PR #14)
- [x] 12. `<mf-voice-input>`: caja de texto → `resolve()` del parser → `cs:move-candidate`. (PR #14)
- [x] 13. Reconocedores: Web Speech con 400 ms, Whisper contra `/transcribe` y uno falso para tests. (PR #26, #27 y #29) **Falta la prueba con voz real y con el Whisper real.**

**Documentos**
- [ ] 14. ADR 9 (licencia), y ADR 7 y 8 al terminar las tareas 3 y 6. ADR 8 en el PR #11 y ADR 7 en el PR #13; falta el ADR 9.
- [ ] 15. 20 frases de validación, en un archivo nuevo, sin editar el corpus v0.
- [ ] 16. Documentación de arquitectura con C4 (niveles 1 y 2 en Mermaid).

**Según los supuestos**
- [ ] 17. Dominio: cuando el profesor lo agregue y deje de rechazar consultas, conectarlo según lo que permita el hosting.
- [ ] 18. Desplegar el backend y las bases en Render, Neon y Atlas, y publicar la web en Vercel. Es de la Fase 0, necesita crear las cuentas y es el paso 2 del orden de trabajo.

**Balanceo (ADR 12; el ADR 11 quedó sustituido)**
- [x] 19. Puerto `MovePersistence` con escritura directa, junto con la tarea 6. (PR #13)
- [ ] 20. ~~Pool y `move-workers`~~ **Recortada el 14 de noviembre:** la sustituye el ADR 12.
- [ ] 21. ~~Pruebas del ADR 11~~ **Recortada el 14 de noviembre**, con la tarea 20.
- [ ] 22. Medir los dos equipos el mismo día para saber cuál es el más débil, llevarle el WAV y repetir allí la prueba de carga de Whisper. Instrucciones: [docs/kit-equipo-debil/LEEME.txt](kit-equipo-debil/LEEME.txt).
- [ ] 23. Arrancar la demo de Whisper. Desde el ADR 12 se hace con los 3 contenedores y `WHISPER_URLS`, aislando y devolviendo desde el dashboard. `LB_WORKERS=3` queda como salida si falla Docker.
- [ ] 24. Medir la latencia de Whisper en la segunda laptop (sin definir de dónde sale). Es aparte de la máquina limpia, que solo prueba el README.
- [x] 25. Pool por URLs con aislar y devolver (#41), criterio de la fase C (#43) y su medición con 3 contenedores locales (#44).
- [ ] 26. Experimento con una instancia EC2 en `us-east-2`, según la adenda de [whisper-cloud-criteria.md](whisper-cloud-criteria.md). Antes de lanzarla se añaden los precios oficiales con su fecha. **Es lo primero que se recorta** si falta tiempo para el README probado, el ensayo y el tag.

## Pulido opcional
Solo si sobra tiempo al final. Ninguno bloquea la entrega.

- **Voz:** mensajes de error más claros, guías en pantalla y ejemplos de frases válidas.
- **`favicon.ico`:** la web publicada no tiene, y el navegador registra un 404 al cargarla (verificación del despliegue, 8 de noviembre).
- **Variables `PUBLIC_*` en `config.js`:** `scripts/build-web.mjs` copia cualquier variable `PUBLIC_*` del entorno. En Vercel coló `PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG`, que la web no usa y no es secreta. El pulido sería copiar solo las variables que la web lee.

## Qué no tocar por ahora
- **`shared/`:** el contrato lo aprueba el responsable del repo; cualquier cambio va en un PR y sube la versión. Si falta algo, se anota.
- **PR #3 y #10 a #14:** ya fusionados en `main`. Nada se fusiona a `main` sin aprobación expresa del responsable del repo.
- **Parser y spike:** `packages/voice-parser/`, su corpus, `docs/spike-criteria.md` y los resultados siguen congelados; el lote de mejoras queda fuera del plan.
- **Balanceo:** solo lo que fija el ADR 12. `GameRoom` y la validación no se tocan.
- **`web/dist`:** solo en el commit de entrega, al congelar el código (supuesto).

**Sin definir:** quién aporta la otra voz para la validación (sin otra voz, con la del responsable del repo, declarado en `docs/quality.md`), la segunda laptop de los ensayos y la máquina limpia del README.
