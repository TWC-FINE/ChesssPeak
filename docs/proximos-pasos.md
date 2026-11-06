# Próximos pasos

Dónde quedó el trabajo y cómo seguir desde otro equipo. Escrito el 5 de noviembre de 2026. Las fechas y el alcance vigentes están en [PLAN.md](../PLAN.md); aquí están lo pendiente y los supuestos.

## Cómo retomar
```bash
git fetch origin
git switch docs/delivery-nov-19   # esta replanificación; aún sin PR
pnpm install
```
- **Para programar:** crear una rama por tema desde `origin/feat/game-room`, que tiene el contrato y `GameRoom`. `main` aún no los tiene.
- **Fuera de git:** `.env` (`pnpm env:init`), Whisper y sus modelos (`pnpm --filter @chessspeak/spike-whisper-local download`) y los WAV del spike.

## Decisiones ya tomadas
- **Fecha de entrega por confirmar: margen interno del equipo 19 de noviembre; tentativa 27 de noviembre.** Con **demo en vivo**.
- **Documentación de arquitectura:** el profesor pide **C4**. Los niveles y el formato son un supuesto.
- **Dominio:** el profesor pide obtenerlo con [DigitalPlat FreeDomain](https://github.com/DigitalPlatDev/FreeDomain). Supuesto: si sobra tiempo; es un riesgo asumido (ADR 11). Mínimo garantizado: la web publicada en Vercel con su URL `vercel.app`.
- **Despliegue:** supuesto Render, Neon y Atlas. Ya no se espera una sugerencia del profesor. Crear las cuentas y las credenciales queda en manos del equipo.

## Dominio
- **Prioridad:** si sobra tiempo. Si se hace, solo la web en Vercel. Mínimo garantizado: la web publicada en Vercel con su URL `vercel.app`.
- **Elegido:** `chessspeak.dpdns.org`, estaba disponible al comprobarlo. Comprobar en el panel si el registro ya se completó.
- **Opciones del formulario:** **DigitalPlat DNS** y **cupo gratuito**. El cupo gratuito exige verificar la cuenta.
- **Límites:** hay un cupo gratuito por cuenta y el dominio tiene fecha de vencimiento.
- **Después:** los registros DNS apuntan a la web en Vercel. Habrá que añadir el dominio a `CORS_ORIGINS` y a `docs/deploy.md`.
- **Riesgo:** si la demo se abre desde el dominio, el navegador puede bloquear la llamada de la web a `127.0.0.1` (Whisper). Hay que ensayarlo en Edge.

## Balanceo: pool de `move-workers` (ADR 11)
**Decisión del 5 de noviembre.** El profesor no aprobó el modo de dictado y habló de repartir las jugadas entre servicios camino a la base de datos. Su «Eso puede ser» se toma como aprobación tentativa, no como confirmación. El supuesto más débil, el diseño, los límites y el criterio de éxito están en el [ADR 11](adr/0011-balanceo-de-jugadas-con-move-workers.md). También cambió lo que se puede afirmar del pool de Whisper: ver la [revisión del ADR 10](adr/0010-balanceo-de-carga-en-local-agent.md#revisión-del-5-de-noviembre).

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
- **Dónde vive:** dentro de `<mf-voice-input>` o como cuarto microfrontend. Si necesita tipos nuevos en `shared/`, requiere la aprobación de los dos.
- **Calendario:** la versión mínima se estima en 2 o 3 días. Iría después del hito del vie 13, en el fin de semana 14–15 y el lun 16. Si el núcleo se retrasa, se recorta y queda la carga de prueba.

**Qué esperar.** Con las tasas medidas el 4 de noviembre (0,37 y 0,45 respuestas por segundo), balancear no crea CPU: el total para 80 medias jugadas pasaría de unos 216 s a unos 178 s. Es una estimación, porque el dictado real aún no se ha medido. El argumento más fuerte es la tolerancia a fallos: si un worker cae a mitad del dictado, los demás siguen. Esta estimación usa las tasas del 4 de noviembre, anteriores a las repeticiones del 5, y no se recalculó.

**Descartadas:** modo club con varios tableros (el micrófono no funciona por HTTP en la red local), Whisper central en la nube (sin CPU en el plan gratuito y se pierde el módulo local), balancear NestJS (exige Redis y sesiones pegajosas) y Stockfish (no pasó su prueba).

## Supuestos
**Ya no se le puede preguntar nada más al profesor. Ninguno de estos puntos está confirmado por él.** Si alguno cambia, se corrige aquí.

| Tema | Supuesto | Riesgo o pendiente |
|---|---|---|
| Entrega | Fecha de entrega por confirmar: margen interno del equipo 19 de noviembre; tentativa 27 de noviembre | No se presenta como confirmada. Se supone que la demo es ese mismo día |
| Despliegue | Render, Neon y Atlas, como en `render.yaml` y `docs/deploy.md`. `MOVE_WORKERS=0` en Render hasta medir la memoria | El profesor iba a sugerir dónde y cómo. Hay que crear las cuentas |
| Dominio | Si sobra tiempo. Si se hace, solo la web en Vercel. Mínimo garantizado: la web publicada en Vercel con su URL `vercel.app` | Riesgo asumido: el profesor pidió el dominio (ADR 11). Sin comprobar si el registro se completó |
| Microfrontends y Live Server | 3 custom elements sin Module Federation ni despliegues independientes (ADR 2). `web/dist` va en el commit de entrega, solo al congelar el código, y abre en `http://127.0.0.1:5500/web/dist/index.html` | Ensayar exactamente ese modo. La demo sigue usando `serve:web` |
| Chrome | Sigue como recorte. Si la entrega la abre otra persona puede ser en Chrome; medir antes del 16 de noviembre | La medición es con voz real |
| Rúbrica | No se conocen pesos: se cubren todos los requisitos de SPEC.md por igual | Podría pesar más algo que tratamos como secundario |
| Demo | Nuestras dos laptops, datos del celular y video de respaldo. Guion de unos 10 minutos (cifra de trabajo), con versión corta | No se conocen hora, duración ni la red de la sala |
| Quién abre el proyecto | Basta la demo y el repo; el README se prueba con un clon nuevo | Si lo abre él mismo, Whisper y las cuentas pesan más |
| C4 | Niveles 1 a 3 (contexto, contenedores y componentes del servidor) en Mermaid, más los ADR y los escenarios de calidad | Puede esperar otro formato |
| Balanceo | Ver el [ADR 11](adr/0011-balanceo-de-jugadas-con-move-workers.md) y la [revisión del ADR 10](adr/0010-balanceo-de-carga-en-local-agent.md#revisión-del-5-de-noviembre) | Procesos en la misma máquina: no se da por resuelto, y hay que decirlo al presentar |

## Lista de tareas
Las tareas que dependen de un supuesto lo indican.

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
- [ ] 16. Documentación de arquitectura con C4 (supuesto: niveles 1 a 3 en Mermaid).

**Según los supuestos**
- [ ] 17. Si sobra tiempo: terminar el registro del dominio y apuntarlo a la web en Vercel.
- [ ] 18. Desplegar el backend y las bases en Render, Neon y Atlas, y publicar la web en Vercel. Es de la Fase 0, necesita crear las cuentas y hay que hacerlo antes del ensayo del mar 17.

**Balanceo (ADR 11)**
- [ ] 19. Puerto `MovePersistence` con escritura directa, junto con la tarea 6. Es lo único de este bloque antes del mié 11.
- [ ] 20. Pool y `move-workers`, del jue 12 al dom 15. Se pausa si el hito del mié 11 se atrasa, y entonces queda solo el balanceo de Whisper.
- [ ] 21. Pruebas del ADR 11, con el criterio de éxito: matar un worker a mitad de partida sin perder ninguna jugada.
- [ ] 22. Medir los dos equipos el mismo día para saber cuál es el más débil, llevarle el WAV y repetir allí la prueba de carga de Whisper. Instrucciones: [docs/kit-equipo-debil/LEEME.txt](kit-equipo-debil/LEEME.txt). Si se puede, antes del lun 9.
- [ ] 23. Arrancar la demo de Whisper con `LB_WORKERS=3`.

**Meta para el mié 11:** dos pestañas de Edge jugando por texto contra el servidor; en local mientras no haya despliegue (tareas 3 a 6 y 10 a 12).

## Qué no tocar por ahora
- **`shared/`:** el contrato exige la aprobación de los dos. Si falta algo, se anota.
- **PR #3 y #10:** nadie aprueba su propio PR. Se trabaja encima de esas ramas sin fusionarlas. Nada se fusiona a `main` sin aprobación expresa.
- **Parser y spike:** `packages/voice-parser/`, su corpus, `docs/spike-criteria.md` y los resultados siguen congelados hasta el lote previo a la validación.
- **Balanceo:** solo lo que fija el ADR 11. `GameRoom` y la validación no se tocan.
- **`web/dist`:** solo en el commit de entrega, al congelar el código (supuesto).

**Espera a la otra persona:** la validación con otra voz, los ensayos con dos laptops y la firma del contrato.
