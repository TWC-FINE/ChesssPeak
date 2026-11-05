# Análisis post-partida — criterios de la prueba de viabilidad

Estos criterios se fijaron **antes de construir la herramienta de medición** y **no se cambian después de medir**. Si hay que cambiar algo, se registra como una versión nueva de este archivo (v2) con la fecha y el motivo, y las mediciones hechas con la versión anterior se descartan como evidencia de decisión.

- Versión: **v1**
- Fecha: 5 de noviembre de 2026

## 1. Qué se decide

Si vale la pena añadir a ChessSpeak un análisis post-partida con un pool de procesos Stockfish. La pregunta concreta es si, con la misma CPU, **varios procesos con pocos hilos** analizan una partida bastante más rápido que **un proceso con todos los hilos**, sin empeorar la evaluación.

Si la prueba no pasa, el análisis no se construye. El balanceo se queda en Whisper con `LB_WORKERS=1` por defecto y con una justificación franca.

## 2. Umbrales

Sea `T(c)` la mediana del tiempo total de las 3 repeticiones de la configuración `c`. El **mejor pool** es el de menor `T` entre C1 y C2. Solo se evalúa ese.

La prueba **pasa** si el mejor pool cumple las tres condiciones:

| Condición | Umbral |
|---|---|
| Reducción de tiempo | `(T(C0) − T(mejor)) / T(C0)` ≥ **30 %** |
| Sin solape | La repetición más lenta del mejor pool tarda menos que la más rápida de C0 |
| Calidad | Como máximo **5 %** de las posiciones comparables difieren en más de **50 centipeones** |

El 30 % se eligió para superar con claridad el ≈ 24 % que dio Whisper, medido con una sola corrida en [load-balancing.md](load-balancing.md).

## 3. Configuraciones

Las tres usan 12 hilos y 768 MB de hash en total.

| Id | Procesos | Hilos por proceso | Hash por proceso |
|---|---|---|---|
| C0 | 1 | 12 | 768 MB |
| C1 | 3 | 4 | 256 MB |
| C2 | 6 | 2 | 128 MB |

**Motor:** Stockfish `sf_19`, asset `stockfish-windows-x86-64-universal.zip`, SHA-256 `3c8bf1f9ea66a09350a40df4f632288285ac206d99f33ab5842c408fc30b48a7`.

## 4. Datos

- **Partida de medición:** Fischer–Spassky, Reikiavik 1972, partida 6. Son 81 medias jugadas y se analiza la posición tras cada una: 81 posiciones.
- **Partida de calibración:** D. Byrne–Fischer, Nueva York 1956. Solo sirve para elegir la profundidad y nunca se usa para medir.
- Las posiciones se generan con chessops a partir de los PGN de `spike/analysis-gate/fixtures/`.

## 5. Profundidad

La profundidad `D` se elige una sola vez, con C0 y la partida de calibración, y se escribe en los resultados antes de medir: se empieza en 14 y se sube de 2 en 2 hasta que el tiempo total sea **≥ 60 s**. La profundidad es la misma para todas las configuraciones.

## 6. Protocolo

- **Orden de las repeticiones:** `C0 C1 C2`, luego `C1 C2 C0`, luego `C2 C0 C1`. Hay 10 s de pausa entre corridas.
- **Procesos:** cada corrida lanza procesos nuevos, envía `setoption name Threads` y `setoption name Hash`, y espera a `readyok`. El arranque no cuenta en el tiempo.
- **Reparto:** una cola común en orden de jugada. Cada proceso toma la siguiente posición cuando queda libre. Es como funciona el pool del producto.
- **Búsqueda:** `position fen <FEN>` seguido de `go depth D`, sin `ucinewgame` entre posiciones, de modo que cada proceso conserva su hash durante la corrida.
- **Tiempo total:** desde el primer `go` hasta el último `bestmove`.
- **Registro por corrida:** tiempo total; p50 y p95 por posición; RSS por proceso, leída del sistema operativo al terminar; evaluación y mejor jugada por posición. Además, CPU, hilos, RAM total y libre, sistema operativo y versión de Node.
- **Condiciones:** mismo equipo, con el agente, el navegador y otros programas pesados cerrados.

## 7. Definiciones

- **Evaluación:** la `score` de la última línea `info` de profundidad `D` antes de `bestmove`, expresada desde el punto de vista de las blancas. Un mate cuenta como ±10 000.
- **Evaluación de una posición en una configuración:** la mediana de sus 3 repeticiones.
- **Posición comparable:** todas, salvo aquellas en las que **ambas** configuraciones dan una evaluación con valor absoluto ≥ 1000. Ahí la diferencia no cambia la lectura de la posición.

## 8. Reglas

- Una corrida solo se repite por **fallo técnico** (un proceso cae o termina sin resultado), nunca por su resultado. Se anota el motivo y se conserva el JSON de la corrida fallida.
- Los resultados se publican tal cual en `docs/analysis-gate.md`, con los JSON en `spike/analysis-gate/results/`.
- No se prueban más configuraciones, profundidades ni partidas para rescatar una prueba que no pasa.

## 9. Limitaciones conocidas de antemano

- Es una sola máquina (i5-12400F, 6 núcleos y 12 hilos), una partida y una profundidad. En otros equipos el resultado puede ser distinto.
- Escoger el mejor de dos pools por tiempo introduce un pequeño sesgo de selección a su favor.
- Con `position fen` el motor no conoce el historial de la partida, por lo que no detecta repeticiones. El producto funcionará igual.
- El 1×12 reparte su hash entre todas las posiciones, y los pools la dividen. Es parte de lo que se compara.
