# Próximos pasos

Dónde quedó el trabajo y cómo seguir desde otro equipo. Escrito el 5 de noviembre de 2026. Las fechas y el alcance vigentes están en [PLAN.md](../PLAN.md); aquí están lo pendiente, las ideas por aprobar y las preguntas para el profesor.

## Cómo retomar
```bash
git fetch origin
git switch docs/delivery-nov-19   # esta replanificación; aún sin PR
pnpm install
```
- **Para programar:** crear una rama por tema desde `origin/feat/game-room`, que tiene el contrato y `GameRoom`. `main` aún no los tiene.
- **Fuera de git:** `.env` (`pnpm env:init`), Whisper y sus modelos (`pnpm --filter @chessspeak/spike-whisper-local download`) y los WAV del spike.

## Decisiones ya tomadas
- **Entrega:** jueves 19 de noviembre de 2026, con **demo en vivo**.
- **Documentación de arquitectura:** el profesor pide **C4**. Faltan los niveles y el formato.
- **Dominio:** el profesor pide obtenerlo con [DigitalPlat FreeDomain](https://github.com/DigitalPlatDev/FreeDomain).
- **Despliegue:** en espera. El profesor va a sugerir dónde y cómo, así que **no crear cuentas ni editar** `render.yaml`, `vercel.json` o `docs/deploy.md` hasta entonces. Los proveedores de PLAN.md son provisionales.

## Dominio
- **Elegido:** `chessspeak.dpdns.org`, estaba disponible al comprobarlo. Comprobar en el panel si el registro ya se completó.
- **Opciones del formulario:** **DigitalPlat DNS** y **cupo gratuito**. El cupo gratuito exige verificar la cuenta.
- **Límites:** hay un cupo gratuito por cuenta y el dominio tiene fecha de vencimiento.
- **Después:** los registros DNS se crean al definir el hosting. Habrá que añadir el dominio a `CORS_ORIGINS` y a `docs/deploy.md`.
- **Riesgo:** si la demo se abre desde el dominio, el navegador puede bloquear la llamada de la web a `127.0.0.1` (Whisper). Hay que ensayarlo en Edge.

## Propuesta para el balanceo: modo de dictado (sin aprobar)
**No construir ni añadir a SPEC.md hasta que el profesor la acepte.**

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
- **Dónde vive:** dentro de `<mf-voice-input>` o como cuarto microfrontend. Si necesita tipos nuevos en `shared/`, requiere la aprobación de los dos.
- **Calendario:** la versión mínima se estima en 2 o 3 días. Iría después del hito del vie 13, en el fin de semana 14–15 y el lun 16. Si el núcleo se retrasa, se recorta y queda la carga de prueba.

**Qué esperar.** Con las tasas medidas el 4 de noviembre (0,37 y 0,45 respuestas por segundo), balancear no crea CPU: el total para 80 medias jugadas pasaría de unos 216 s a unos 178 s. Es una estimación, porque el dictado real aún no se ha medido. El argumento más fuerte es la tolerancia a fallos: si un worker cae a mitad del dictado, los demás siguen.

**Comprobación pendiente:** el profesor pidió la prueba de carga en el equipo de menores prestaciones del grupo, y las corridas se hicieron en el equipo de desarrollo. Si la otra laptop es menos potente, hay que repetirla allí.

**Descartadas:** modo club con varios tableros (el micrófono no funciona por HTTP en la red local), Whisper central en la nube (sin CPU en el plan gratuito y se pierde el módulo local), balancear NestJS (exige Redis y sesiones pegajosas) y Stockfish (no pasó su prueba).

## Preguntas para el profesor
Si hay poco tiempo, priorizar la 1, la 2, la 7 y la 8.

**Para presentar la propuesta:**
> En una partida normal, el balanceador de Whisper solo recibe una petición a la vez porque los turnos alternan. Proponemos añadir un modo para dictar una planilla de torneo ya jugada. Al dictar a menos de 2 segundos por jugada, las peticiones llegan más rápido de lo que un Whisper puede procesarlas y se forma una cola real sobre el mismo módulo local. El tablero se actualiza conforme se transcriben las jugadas. Compararíamos un solo proceso contra la versión balanceada, y en la demo mataríamos un worker a mitad del dictado sin perder jugadas.

**Balanceo**
1. ¿Este modo cumple el requisito del balanceo?
2. Si no lo hiciéramos, ¿bastaría con Whisper y la carga de prueba que ya tenemos?
3. ¿Le parece bien que el modo exporte la partida a PGN, sin guardarla en las bases de datos?
4. ¿La prueba comparativa debe hacerse con dictado real, o sirve la que ya está hecha?
5. ¿Le basta con ver el balanceo en la demo, o quiere ejecutarlo él mismo?

**Microfrontends y Live Server**

6. ¿Cumplimos con 3 custom elements, cada uno en su propio proyecto y con su página independiente, que conviven en un mismo `index`, sin despliegues independientes ni Module Federation?
7. Cada microfrontend se compila y lo entregamos ya compilado en `web/dist`, para abrirlo con Live Server sin instalar nada. ¿Eso cumple lo que pide?

**Despliegue y dominio**

8. ¿Dónde y cómo sugiere desplegar? (Si no lo dijo ya en clase.)
9. ¿El dominio debe apuntar a la web, al backend o a ambos?
10. ¿La demo tiene que abrirse desde el dominio, o basta con que exista y funcione?

**Evaluación y demo**

11. ¿Hay rúbrica o criterios con peso?
12. ¿La demo es el mismo jueves 19, a qué hora y cuánto dura?
13. ¿Usamos nuestras laptops y hay internet fiable en la sala?
14. ¿Va a abrir el proyecto él mismo, o le basta la demo y el repo?

**Documentación**

15. ¿Qué niveles de C4 pide y en qué formato? ¿Espera también ADR o escenarios de calidad?

**Ya no hace falta preguntar:** si acepta procesos en la misma máquina. Según el ADR 10, ya lo aceptó; basta con mencionarlo.

## Lista de tareas
Ninguna de estas tareas depende de las respuestas del profesor, salvo las que lo indican.

**Preparación**
- [ ] 1. Abrir el PR de `docs/delivery-nov-19`.
- [ ] 2. Levantar el entorno local: `pnpm env:init` y `docker compose up -d`.

**Servidor**
- [ ] 3. Auth de invitados: `POST /auth/guest`, token firmado y throttler.
- [ ] 4. Partidas: `POST /games`, con guardado en la tabla `games`.
- [ ] 5. Gateway Socket.IO: `game:join`, `game:move` y `game:resign` sobre `GameRoom`.
- [ ] 6. Guardado de jugadas en Mongo con `appendMove`, y rehidratación desde ahí.
- [ ] 7. Reconexión y abandono, con plazo configurable (60 s por defecto, provisional).
- [ ] 8. Telemetría de voz: ingesta de `voice:attempt`; `player` lo pone el servidor.

**Web**
- [ ] 9. `<mf-history>`: lista de jugadas a partir de `cs:move-applied`.
- [ ] 10. Shell real: sesión y socket único, en lugar de `web/shell/src/mocks.ts`.
- [ ] 11. `<mf-game>`: tablero real, `game:state`, `game:moved` y flecha de confirmación.
- [ ] 12. `<mf-voice-input>`: caja de texto → `resolve()` del parser → `cs:move-candidate`.
- [ ] 13. Reconocedores: Web Speech con 400 ms, Whisper contra `/transcribe` y uno falso para tests.

**Documentos**
- [ ] 14. ADR 9 (licencia), y ADR 7 y 8 al terminar las tareas 3 y 6.
- [ ] 15. 20 frases de validación, en un archivo nuevo, sin editar el corpus v0.
- [ ] 16. Documentación de arquitectura con C4 (según la pregunta 15).

**Según las respuestas del profesor**
- [ ] 17. Terminar el registro del dominio y crear sus registros DNS (preguntas 8 a 10).
- [ ] 18. Desplegar el backend y las bases (pregunta 8). Hay que hacerlo antes del ensayo del mar 17.
- [ ] 19. Modo de dictado (preguntas 1 a 5).

**Meta para el mié 11:** dos pestañas de Edge jugando por texto contra el servidor; en local mientras no haya despliegue (tareas 3 a 6 y 10 a 12).

## Qué no tocar por ahora
- **`shared/`:** el contrato exige la aprobación de los dos. Si falta algo, se anota.
- **PR #3 y #10:** nadie aprueba su propio PR. Se trabaja encima de esas ramas sin fusionarlas.
- **Parser y spike:** `packages/voice-parser/`, su corpus, `docs/spike-criteria.md` y los resultados siguen congelados hasta el lote previo a la validación.
- **Balanceo:** no se amplía hasta tener respuesta.
- **`web/dist`:** solo en el commit de entrega.

**Espera a la otra persona:** la validación con otra voz, los ensayos con dos laptops y la firma del contrato.
