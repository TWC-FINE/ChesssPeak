# ChessSpeak — Especificación

Qué vamos a construir y cuándo está terminado. El *cómo* está en [ARCHITECTURE.md](ARCHITECTURE.md) y el *cuándo* en [PLAN.md](PLAN.md). Si dudamos si algo entra o no, se decide aquí.

## 1. Problema y propuesta
Jugar ajedrez en línea exige el mouse. ChessSpeak permite jugar **diciendo las jugadas en voz alta** en español, con notación algebraica. Resolver contra las jugadas legales hace que el sistema sea tolerante a errores de reconocimiento sin aceptar jugadas incorrectas.

## 2. Usuarios
- **Jugador invitado:** entra sin registro, crea o se une a una partida y juega por voz o escribiendo.
- **Jugador registrado (opcional):** igual, con cuenta y partidas ligadas a su usuario.
- **Evaluadores (profesor):** revisan los requisitos de la materia en una demo con dos laptops.

## 3. Requisitos del curso (obligatorios)
| # | Requisito | Cómo se cumple |
|---|---|---|
| R1 | Desplegado en la nube | Backend en Render, Postgres en Neon, Mongo en Atlas |
| R2 | Módulo local | `local-agent` con Whisper en `127.0.0.1:8765` (confirmado con el profesor) |
| R3 | Sockets | Socket.IO para la partida |
| R4 | Cámara o micrófono | Micrófono para la entrada de jugadas |
| R5 | Mínimo 2 bases de datos | Postgres + Mongo |
| R6 | 100% en GitHub | Repo público, PRs, CI |
| R7 | Microfrontends | 3 custom elements que conviven en un index (Live Server) |

## 4. Requisitos funcionales
**Núcleo (debe estar):**
- RF1. Entrar como invitado con identidad firmada por el servidor.
- RF2. Crear una partida y unirse a ella; dos jugadores juegan en tiempo real.
- RF3. El servidor valida cada jugada (UCI) y rechaza las ilegales o fuera de turno.
- RF4. Fin de partida: mate, ahogado, tablas y abandono.
- RF5. Reconexión: al volver, el jugador recupera la partida en curso sin perder jugadas.
- RF6. Entrada por voz: pulsar para hablar → reconocimiento → resolución → confirmación → jugada.
- RF7. Resultado de la resolución: `move`, `ambiguous`, `nomatch` o `command`; en ambigüedad o sin coincidencia se pide repetir.
- RF8. Confirmación explícita con flecha en el tablero y comandos “sí”, “no”, “cancelar”.
- RF9. Vocabulario en español: piezas, letras con alias (be/ve, ce/se, ge/je), coordenadas (“e2 e4”), “toma”, enroque corto/largo, “corona a dama”.
- RF10. Reconocedores intercambiables: Web Speech (por defecto), Whisper local, caja de texto de respaldo.
- RF11. Historial de jugadas de la partida (`<mf-history>`).
- RF12. Telemetría de voz por intento (`voice_attempts`), sin audio.

**Opcionales (solo si todo lo anterior está en verde):** login/registro, autoconfirmación con confianza alta (cancelable), pestaña “Precisión” (tabla), alfabeto OTAN, anuncio de la jugada del rival con `speechSynthesis`, despliegue de la web en Vercel.

**Fuera de alcance:** chat de voz entre jugadores (WebRTC/TURN), análisis con Stockfish, inglés, ranking/ELO, partidas contra computador.

## 5. Requisitos no funcionales
| Atributo | Requisito |
|---|---|
| Precisión de voz | Metas del spike: acierto top-1 ≥ 85 %; aceptación errónea ≤ 2 %; ambigüedad ≤ 10 %; 0 jugadas aceptadas con silencio o ruido |
| Rendimiento (voz) | Soltar el botón → propuesta: p50 ≤ 1,5 s, p95 ≤ 3 s |
| Disponibilidad | Reconexión sin perder jugadas (objetivo: 0 perdidas) |
| Seguridad | Identidad decidida siempre por el servidor; rate limiting en auth; secretos solo en `.env`; sin audio almacenado |
| Modificabilidad | Añadir un reconocedor nuevo toca solo un adaptador |
| Privacidad | Web Speech envía audio a la nube de Google (aceptado por el profesor); Whisper local no sale de la máquina |

Las cifras reales se registran en `docs/quality.md` tras la sesión de evaluación (semana 4). No se inventan.

## 6. Criterios de aceptación (la demo)
1. Dos jugadores en dos laptops juegan una partida completa **por voz** con Web Speech.
2. Al menos una jugada por voz usando Whisper local desde el navegador.
3. Un jugador se desconecta y reconecta a mitad de partida y la partida continúa.
4. Una frase ambigua o ilegible no mueve ninguna pieza.
5. Los intentos quedan en `voice_attempts` y las jugadas en `game_moves`; las partidas en Postgres.
6. Backend desplegado en la nube y repo público con CI en verde.
7. Existen `docs/quality.md` con cifras medidas, los ADRs y un video de respaldo de la demo.

## 7. Supuestos y pendientes
- Entrega supuesta: viernes 27 de noviembre de 2026 (por confirmar).
- Pendiente con el profesor: ¿hay que abrir el proyecto con Live Server sin compilar?; formato de la demo.
- Pendiente del equipo: variante del español para Web Speech (¿`es-CO`?).
