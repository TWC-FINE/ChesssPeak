# ChessSpeak — Especificación

Qué vamos a construir y cuándo está terminado. El *cómo* está en [ARCHITECTURE.md](ARCHITECTURE.md) y el *cuándo* en [PLAN.md](PLAN.md). Si dudamos si algo entra o no, se decide aquí.

## 1. Problema y propuesta
Jugar ajedrez en línea exige el mouse. ChessSpeak permite jugar **diciendo las jugadas en voz alta** en español, con notación algebraica. Resolver contra las jugadas legales hace que el sistema sea tolerante a errores de reconocimiento sin aceptar jugadas incorrectas.

## 2. Usuarios
- **Jugador invitado:** entra sin registro, crea o se une a una partida y juega por voz o escribiendo.
- **Jugador registrado (opcional):** igual, con cuenta y partidas ligadas a su usuario.
- **Evaluadores (profesor):** revisan los requisitos de la materia en una **demo en vivo** que presentamos nosotros, en Edge.

## 3. Requisitos del curso (obligatorios)
| # | Requisito | Cómo se cumple |
|---|---|---|
| R1 | Desplegado en la nube | Backend en Render, Postgres en Neon, Mongo en Atlas; web estática en Vercel opcional (la demo la sirve en local) |
| R2 | Módulo local | `local-agent` con Whisper en `127.0.0.1:8765` (confirmado con el profesor) |
| R3 | Sockets | Socket.IO para la partida |
| R4 | Cámara o micrófono | Micrófono para la entrada de jugadas |
| R5 | Mínimo 2 bases de datos | Postgres + Mongo |
| R6 | 100% en GitHub | Repo público, PRs, CI |
| R7 | Microfrontends | 3 custom elements que conviven en un index (`pnpm serve:web`, Live Server o, si se despliega, Vercel) |
| R8 | Balanceo de carga sobre un proceso crítico | Pool de `whisper-server` en `local-agent`, con dashboard y prueba de carga ([ADR 10](docs/adr/0010-balanceo-de-carga-en-local-agent.md)), y pool de `move-workers` en el servidor ([ADR 11](docs/adr/0011-balanceo-de-jugadas-con-move-workers.md), aún sin código). Cumplimiento sin confirmar: aprobación tentativa del profesor |

## 4. Requisitos funcionales
**Núcleo (debe estar):**
- RF1. Entrar como invitado con identidad firmada por el servidor.
- RF2. Crear una partida y unirse a ella; dos jugadores juegan en tiempo real.
- RF3. El servidor valida cada jugada (UCI) y rechaza las ilegales o fuera de turno.
- RF4. Fin de partida: mate, ahogado, tablas y abandono.
- RF5. Reconexión: al volver, el jugador recupera la partida en curso sin perder jugadas.
- RF6. Entrada por voz: pulsar para hablar → retardo de 400 ms tras soltar (Web Speech) → reconocimiento → resolución → confirmación → jugada.
- RF7. Resultado de la resolución: `move`, `ambiguous`, `nomatch` o `command`; en ambigüedad o sin coincidencia se pide repetir.
- RF8. **Confirmación explícita obligatoria** con flecha en el tablero y comandos “sí”, “no”, “cancelar”, con cualquier reconocedor.
- RF9. Vocabulario en español: piezas, letras con alias (be/ve, ce/se, ge/je), coordenadas (“e2 e4”), “toma”, enroque corto/largo, “corona a dama”.
- RF10. Reconocedores intercambiables: Web Speech (por defecto, con retardo de 400 ms tras soltar), Whisper local (modelo `small` con prompt de ajedrez; alternativa seleccionable y módulo local, con su latencia declarada), caja de texto de respaldo.
- RF14. `pnpm serve:web` para servir la web en local sin VS Code.
- RF11. Historial de jugadas de la partida (`<mf-history>`).
- RF12. Telemetría de voz por intento (`voice_attempts`), sin audio.

**Opcionales (solo si todo lo anterior está en verde; primeros en recortarse, ver PLAN.md, 9.7):**
- RF13. Aviso en navegadores sin Web Speech (Firefox), con Whisper local o la caja de texto como alternativa.
- Web pública en Vercel.

**Fuera de alcance:** login/registro, pestaña “Precisión”, alfabeto OTAN, `speechSynthesis` (los cuatro, recortados por la entrega del 19 de noviembre); chat de voz entre jugadores (WebRTC/TURN), análisis con Stockfish, inglés, ranking/ELO, partidas contra computador. No hay autoconfirmación ni N-best (descartados por el spike).

## 5. Requisitos no funcionales
| Atributo | Requisito |
|---|---|
| Precisión de voz | Umbrales del spike: acierto top-1 ≥ 85 %; aceptación errónea ≤ 2 %; ambigüedad ≤ 10 %; 0 jugadas aceptadas con silencio o ruido. Web Speech con 400 ms los cumplió en el spike (87,2 %, Edge 156, una voz); la validación del 17 de noviembre los vuelve a medir con frases nuevas |
| Rendimiento (voz) | Soltar el botón → propuesta: p50 ≤ 1,5 s, p95 ≤ 3 s para Web Speech. Whisper `small` no los cumple (p50 2,91 s, p95 3,06 s solo de inferencia): se declara |
| Reproducibilidad | Un clon nuevo en la segunda laptop instala y abre la aplicación siguiendo solo el README |
| Parser | Las cifras del spike son de la versión `spike-parser-freeze`; el parser solo se modifica registrando la versión y re-midiendo en la validación del 17 de noviembre |
| Disponibilidad | Reconexión sin perder jugadas (objetivo: 0 perdidas) |
| Seguridad | Identidad decidida siempre por el servidor; rate limiting en auth; secretos solo en `.env`; sin audio almacenado |
| Modificabilidad | Añadir un reconocedor nuevo toca solo un adaptador |
| Privacidad | Web Speech envía audio a la nube del navegador (Google en Chrome, Microsoft en Edge; aceptado por el profesor); Whisper local no sale de la máquina |

Las cifras reales se registran en `docs/quality.md` tras la sesión de evaluación (17 de noviembre). No se inventan.

## 6. Criterios de aceptación (la demo en vivo)
1. Dos jugadores, en dos navegadores o equipos, juegan una partida completa **por voz** con Web Speech.
2. Al menos una jugada por voz usando Whisper local desde el navegador (con el agente instalado).
3. Un jugador se desconecta y reconecta a mitad de partida y la partida continúa.
4. Una frase ambigua o ilegible no mueve ninguna pieza.
5. Los intentos quedan en `voice_attempts` y las jugadas en `game_moves`; las partidas en Postgres.
6. Backend desplegado en la nube y repo público con CI en verde.
7. Existen `docs/quality.md` con cifras medidas (con el hash del parser usado), los ADRs y un README que permite instalar y abrir el proyecto sin ayuda, comprobado con un clon nuevo en la segunda laptop.

## 7. Supuestos y pendientes
- Entrega: **jueves 19 de noviembre de 2026**, con **demo en vivo** (se supone ese mismo día).
- Pendiente con el profesor: detalles de la demo y si hay que abrir el proyecto con Live Server sin compilar (PLAN.md, sección 12).
- Decidido por el spike: idioma `es-CO`; reconocedor por defecto Web Speech con retardo de 400 ms (ADR 5). La demo se hace en Edge; Chrome sigue sin medirse.
