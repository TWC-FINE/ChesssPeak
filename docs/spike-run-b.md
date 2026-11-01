# Spike de voz: corrida B (Web Speech)

- Fecha de este documento: **1 de noviembre de 2026**, escrito **antes** de medir la corrida B.
- Criterios y umbrales: los de [spike-criteria.md](spike-criteria.md) (v1). No cambian.
- Corrida A: la medición ya hecha (resultados en [spike-results.md](spike-results.md)). Queda intacta.

## Hipótesis

1. **Soltar el botón corta las últimas sílabas.** Al soltar, el arnés llama a `stop()` de inmediato y el reconocedor se queda con el audio capturado hasta ese instante. Eso explicaría varios textos cortados de la corrida A (por ejemplo `Caballo b cu.`, `Torre F.`, `En Roque cor.`).
2. **El inicio puede perderse mientras arranca el micrófono.** Entre pulsar y el evento `onstart` pasa un tiempo que la corrida A no midió. Si se empieza a hablar antes, se podría perder el comienzo de la frase.

Son hipótesis, no resultados: la corrida A no tiene datos para confirmarlas ni descartarlas.

## Qué cambia respecto a la corrida A

Solo dos cosas:

- **(a) Retardo entre soltar y llamar a `stop()`: 400 ms**, configurable en el arnés («Retardo al soltar (ms)»). En la corrida A fue 0.
- **(b) Grabación de WAV en paralelo activada** («Grabar WAV en paralelo»). En la corrida A no se grabó audio.

Además, el arnés pasa a **registrar** dos datos que no alteran el comportamiento: el tiempo entre pulsar y `onstart` en cada intento, y el retardo y la etiqueta de corrida en los metadatos de cada JSON. Es instrumentación, no una condición experimental.

Lo demás se mantiene igual que en la corrida A: mismo parser (etiqueta `spike-parser-freeze`), mismo corpus v0, mismos parámetros del parser (`threshold` 1, `margin` 0,25, `rankPenalty` 0,3, `nato` falso), idioma `es-CO`, 5 alternativas, mismo hablante, mismo micrófono, mismo tipo de ruido de fondo y el mismo navegador (Edge 156; se comprobará en el `userAgent` de cada archivo).

## Qué se mide

Se repiten los 4 bloques de `test` (el bloque `dev` no se repite):

| Bloque | Intentos |
|---|---|
| Test · ambiente tranquilo | 48 |
| Test · con ruido de fondo | 48 |
| Silencio | 10 |
| Solo ruido | 10 |

## Cómo se reporta

- **La corrida A queda intacta.** Sus archivos y su informe en `spike-results.md` no se tocan.
- **Ambas corridas se reportan por separado, sin promediar ni mezclar intentos.** Cada corrida tiene su propio informe; la de la corrida B se escribe en este documento, no en el bloque automático de `spike-results.md`.
- Las métricas, definiciones y umbrales son los de `spike-criteria.md`; el parser, el corpus y los criterios no se modifican.

## Regla de lectura de A y B

Escrita el **1 de noviembre de 2026, antes de medir la corrida B**. No se cambia después de ver los resultados de B.

1. **A y B se reportan por separado**, cada una con su intervalo de confianza al 95 %, sin promediar. **A queda como línea base.**
2. **Solo hay una corrida B.** No habrá corrida C.
3. **Comprobación del mecanismo (truncados).**
   - **Definición:** un intento es *truncado* si la primera alternativa del reconocedor, normalizada con la misma normalización del parser (`tokenize`, que unifica letras, números y alias), es un **prefijo propio** de la frase esperada normalizada (menos palabras que la esperada y todas iguales a las primeras de ella). Se admite que la última palabra reconocida esté **incompleta** (por ejemplo «cu» por «cuatro», «Tor» por «torre»). Se cuenta sobre los 78 intentos válidos del bloque tranquilo y del bloque con ruido, **acierten o no**.
   - **Corrida A, con esta definición: 6 de 78** (2 de ellos aciertos: «Torre FD.», que se resolvió bien; los otros 4 fueron fallos). Esta es la cifra de referencia. El «8» de `spike-notes.md` era una lectura manual que incluía casos que no son prefijos de la frase (por ejemplo «Torrea de.», «Alfilma.», «En Roque cor.»).
   - Se cuentan los truncados de B con la misma definición y se comparan con los de A. El conteo lo hace el script `count-truncated` (ver más abajo), que se escribió y se probó contra los archivos reales de la corrida A antes de medir B.
   - **Control (definición mecánica):** los fallos del bloque con ruido que **no** son truncados (en A, 20: texto sin relación con lo dicho, palabras mal oídas y palabras fundidas). El retardo al soltar no debería cambiarlos mucho; si cambian mucho, el cambio de B no se explica solo por el retardo.
4. **B cuenta para la decisión solo si** (i) pasa todos los umbrales de [spike-criteria.md](spike-criteria.md) **y** (ii) los truncados bajan de forma clara respecto a A. Si el acierto sube pero los truncados no bajan, la mejora se atribuye a práctica o azar y **no se usa para decidir**.
   - **«Bajan de forma clara» = la corrida B tiene como máximo 2 truncados de 78.**
   - **Razón:** si el retardo no tuviera ningún efecto y los truncados siguieran un promedio de 6 (distribución de Poisson con media 6), sacar 2 o menos por azar ocurriría en torno al 6 % de las veces (e⁻⁶ · (1 + 6 + 18) ≈ 6,2 %). Este conteo **no es la prueba principal**: es una comprobación de que la mejora no se atribuye al azar. La prueba principal sigue siendo (i), los umbrales de `spike-criteria.md`.
5. **Si B no mejora o empeora**, la hipótesis queda refutada: **vale A** y se aplica la regla de acierto < 70 % de `spike-criteria.md`.
6. **Si Web Speech (B) y Whisper cumplen los umbrales**, se elige por este orden: (i) acierto, (ii) aceptaciones erróneas, (iii) latencia. Como desempate, Whisper, porque no depende del navegador ni de un servicio externo.
7. **Whisper se evalúa sobre los clips de la corrida B** (la corrida A no tiene audio).
8. **Limitación declarada: efecto de práctica** (ver abajo). Una mejora de B sobre A puede deberse a que el hablante repite las mismas frases por segunda vez.

El parser, el corpus y los criterios no se modifican en ningún caso.

## Limitaciones

- **Efecto de práctica.** Es la segunda vez que el hablante dice estas mismas frases: puede hablar más claro o más seguro que en la corrida A. Una mejora en B no se puede atribuir por sí sola al retardo.
- **La definición de «truncado» se fijó viendo los datos de la corrida A.** Se eligió (tokenización del parser, última palabra incompleta permitida) después de comprobar qué contaba cada variante en A. Aplica igual a A y a B, pero no es una definición ciega: podría estar ajustada a los casos de A.
- **Dos cambios a la vez.** El retardo (a) y la grabación en paralelo (b) cambian juntos. La grabación abre un segundo flujo del micrófono y podría afectar al reconocimiento por sí misma. No se podrá separar el efecto de cada uno.
- **El retardo suma a la latencia medida.** La latencia se cuenta desde que se suelta el botón, y los 400 ms se esperan después de soltar. La latencia de B no es comparable 1 a 1 con la de A.
- **Mismo navegador, otro día.** Edge, no Chrome (ver `spike-results.md`): lo que se aprenda vale para Edge.
- La muestra sigue siendo de 78 intentos válidos por corrida; los intervalos de confianza siguen siendo anchos.
