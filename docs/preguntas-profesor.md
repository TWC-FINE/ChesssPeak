# Preguntas al profesor (clase del martes 10 de noviembre de 2026)

**Borrador.** Cuatro puntos que hoy se resuelven con supuestos. Las respuestas se anotan aquí y después en el ADR o el documento que corresponda.

## 1. Balanceo de carga

**Situación.**
- **Hecho:** un pool de procesos de Whisper detrás del `local-agent` (ADR 10). Reparte cada transcripción, sondea la salud de cada proceso, relanza el que cae y tiene un dashboard con un botón para matar uno.
- **Medido:**
  - aguanta la caída de un proceso sin perder peticiones;
  - **no mejora el rendimiento;**
  - con una sola petición, que es el caso real de una partida, es más lento;
  - todo corre en una máquina.
- **Diseñado y no construido:** un pool que reparte el guardado de cada jugada en Mongo (ADR 11). Cada guardado es una escritura ligera.
- **De fondo:** el trabajo pesado de la aplicación, la voz, ocurre en el equipo del jugador o en la nube del navegador, no en nuestro servidor.

**Pregunta.** Con eso, ¿cómo ve el requisito? ¿Le basta el pool de Whisper presentado como tolerancia a fallos, o espera otra cosa?

| Si responde… | Qué haría falta | Coste aproximado |
|---|---|---|
| **Basta con el pool de Whisper** | Repetir la prueba de carga en el equipo más débil, ensayar la demo con 3 procesos y matar uno en vivo, y anotar su respuesta en el ADR 10 | Medio día |
| **Quiere el balanceo dentro de la partida, aunque sean procesos del mismo servidor** | Construir el pool de jugadas del ADR 11, con sus pruebas, su carga sintética y la caída de un proceso en la demo | Unos 2 días |
| **Tienen que ser servicios distintos por la red, no procesos de una máquina** | Whisper central en la red de la sala, o varias copias del servidor con Redis. Las dos cambian la arquitectura y ponen en riesgo la demo | Más de 3 días, con riesgo alto. Habría que proponerle reducir el alcance o declararlo sin cumplir |
| **Si no se puede, no es grave** | Dejar el pool de Whisper como está, documentarlo con sus límites y no construir el de jugadas | Ninguno |

## 2. Dominio (`chessspeak.dpdns.org`)

**Situación.** Está delegado a los servidores de nombres de su hosting, pero no resuelve: el 8 de noviembre la consulta DNS respondió `Server failed`. La web ya está publicada con HTTPS en <https://chessspeak.vercel.app>.

**Preguntas.**
- ¿Va a agregar el dominio en el hosting?
- ¿Ese hosting permite administrar registros DNS, o solo subir archivos?
- ¿Tiene HTTPS? Sin HTTPS, el navegador no da acceso al micrófono.
- Si no está a tiempo, ¿le vale la URL `vercel.app`?

## 3. La demo

**Situación.** Se supone que es el 19 de noviembre, en vivo. El montaje previsto: dos laptops con Edge, la web servida en local y el backend en Render.

**Preguntas.**
- ¿Hora y duración?
- ¿Abrirá él el proyecto por su cuenta, o solo verá la demo?
- ¿Habrá red en la sala?
- ¿Algo que quiera ver en concreto?

## 4. Live Server

**Situación.** La web se compila con `pnpm build:web` y se sirve con `pnpm serve:web`, o con Live Server sobre la carpeta compilada. Hoy esa carpeta no está en el repositorio.

**Pregunta.** ¿El proyecto tiene que poder abrirse con Live Server sin compilar nada?

- **Si responde que sí:** el commit de entrega incluye `web/dist`.
- **Si responde que no:** basta con el README.
