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

**Corrección del guardado de audio (2 de noviembre de 2026, antes de medir B).** El arnés perdía la carpeta de los WAV al recargar la página y no avisaba cuando un WAV no se guardaba. Se corrigió: la carpeta se recuerda, los fallos de guardado se muestran en pantalla y el nombre del WAV incluye la corrida (`..._runB.wav`). No cambia nada de lo declarado aquí: condiciones, bloques, criterios, reglas de lectura, parser y corpus siguen igual.

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
   - **Definición:** un intento es *truncado* si la primera alternativa del reconocedor, normalizada con la misma normalización del parser (`tokenize`, que unifica letras, números y alias), es un **prefijo propio** de la frase esperada normalizada (menos palabras que la esperada y todas iguales a las primeras de ella). Se admite que la última palabra reconocida esté **incompleta** (por ejemplo «cu» por «cuatro», «Tor» por «torre») siempre que sea prefijo propio de la palabra esperada **en esa misma posición** de la frase, no de cualquier palabra de la frase. Se cuenta sobre los 78 intentos válidos del bloque tranquilo y del bloque con ruido, **acierten o no**.
   - _La precisión «en esa misma posición» se hizo al escribir el script `count-truncated` (`spike/web-speech/src/truncated.ts`), antes de cualquier medición de B; con ella la corrida A sigue dando los mismos 6 de 78._
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

## Resultados de la corrida B

Medida el **2 de noviembre de 2026** con las condiciones declaradas arriba (retardo de 400 ms, WAV en paralelo, Edge 156, `es-CO`, 5 alternativas, parser congelado). Las cifras salen de `pnpm metrics` y del `benchmark` de Whisper sobre los archivos de `spike/results/`; no se escribió ninguna a mano. A y B se muestran por separado. Los WAV de B son 116 archivos `*_runB.wav` (10 774 256 bytes) en `spike/recordings/`, fuera de git.

Archivos de B: `webspeech-runB-2026-11-02T17-24-51-178Z.json` (tranquilo, 48), `webspeech-runB-2026-11-02T17-35-17-848Z.json` (ruido, 48), `…Zsilencio.json` (10) y `…Zsinhablarruido.json` (10). Archivos de Whisper: `2026-11-02-whisper-{base,small}-{prompt,noprompt}.json`.

### Corrida A (línea base)

| Métrica | Umbral | A | Estado |
|---|---|---|---|
| Acierto top-1 | ≥ 85 % | 56,4 % (44/78; IC95 45–67 %) | no cumple |
| Aceptación errónea | ≤ 2 % | 1,3 % (1/78; IC95 0–7 %) | cumple |
| Ambigüedad | ≤ 10 % | 10,3 % (8/78; IC95 5–19 %) | no cumple |
| Latencia p50 / p95 | ≤ 1,5 s / ≤ 3 s | 0,18 s / 0,25 s | cumple |
| Silencio / ruido | 0 aceptadas | 0/38 | cumple |
| Truncados | (≤ 2 en B) | 6 de 78 | — |
| Control: fallos con ruido no truncados | — | 20 | — |

### Corrida B

| Métrica | Umbral | B | Estado |
|---|---|---|---|
| Acierto top-1 | ≥ 85 % | 87,2 % (68/78; IC95 78–93 %) | cumple |
| Aceptación errónea | ≤ 2 % | 0,0 % (0/78; IC95 0–5 %) | cumple |
| Ambigüedad | ≤ 10 % | 0,0 % (0/78; IC95 0–5 %) | cumple |
| Latencia p50 / p95 | ≤ 1,5 s / ≤ 3 s | 0,57 s / 0,62 s | cumple |
| Silencio / ruido | 0 aceptadas | 0/38 | cumple |
| Truncados | ≤ 2 de 78 | 0 de 78 | cumple |
| Control: fallos con ruido no truncados | — | 6 | — |

Por condición: tranquilo 89,7 % (35/39) y ruido 84,6 % (33/39). El N-best no aporta nada (+0,0 puntos), igual que en A.

### Whisper (whisper.cpp b5454) sobre los clips de B

Puerta fija (≥ 300 ms y ≥ −50 dBFS) y las mismas métricas y umbrales. La puerta frenó 10 de los 20 clips de silencio y ruido; ningún clip sin habla acabó en jugada aceptada (0/38 en las cuatro configuraciones).

| Configuración | Acierto top-1 | Aceptación errónea | Ambigüedad | Latencia p50 / p95 | Cumple |
|---|---|---|---|---|---|
| base · con prompt de ajedrez | 74,4 % (58/78) | 0,0 % | 11,5 % | 0,83 / 0,92 s | no: acierto y ambigüedad |
| base · sin prompt | 61,5 % (48/78) | 0,0 % | 9,0 % | 0,74 / 0,82 s | no: acierto |
| **small · con prompt de ajedrez** | **89,7 % (70/78; IC95 81–95 %)** | 0,0 % | 7,7 % | **2,91 / 3,06 s** | **no: latencia p50 y p95** |
| small · sin prompt | 61,5 % (48/78) | 0,0 % | 6,4 % | 2,61 / 2,79 s | no: acierto y p50 |

### Lectura según la regla (puntos 3 a 6)

- **B cuenta para la decisión.** Cumple (i) todos los umbrales de `spike-criteria.md` y (ii) tiene 0 truncados, por debajo del máximo de 2.
- **A queda como línea base** (falla acierto y ambigüedad). No se promedia con B.
- **Punto 6 (B frente a Whisper):** el orden de desempate solo se aplica si los dos cumplen los umbrales. Whisper `small` con prompt acierta más (89,7 % frente a 87,2 %) pero no cumple la latencia; las otras tres configuraciones no cumplen el acierto. No se activa el desempate.

### Salvedades

1. **El control no respalda atribuir la mejora solo al retardo.** Los fallos con ruido no truncados bajaron de 20 en A a 6 en B. La regla decía que el retardo no debería cambiarlos mucho; cambiaron mucho. Los truncados bajaron (6 → 0), pero el resto de la mejora no se explica por el retardo.
2. **Posible efecto de práctica y ruido no idéntico.** Es la segunda vez que el hablante dice las frases y el ruido de fondo no fue el mismo audio exacto en las dos corridas. No se puede separar de la grabación en paralelo, que también cambió.
3. **Una sola voz y una sola corrida B.** No hay otro hablante ni repetición de B (la regla no admite una corrida C).
4. **El límite inferior del IC95 de B es 78 %, por debajo del 85 %.** El 87,2 % cumple el umbral como punto estimado, pero la muestra (78 intentos) no excluye que el acierto real sea menor.
5. **Todo se midió en Edge 156** (reconocedor de Microsoft), no en Chrome.
6. **La latencia de B incluye los 400 ms de espera** y no es comparable 1 a 1 con la de A.
7. **La latencia de Whisper es solo inferencia** del clip ya grabado más el parser: excluye grabación y transporte HTTP (ver `spike-notes.md`). La latencia real de extremo a extremo sería mayor.
8. **Sesgo de selección entre las 4 configuraciones de Whisper.** Que `small` con prompt destaque entre cuatro candidatas puede sobreestimar su acierto; no se midió con un `test` nuevo.
9. **Las 10 improvisadas adicionales** (sesión re-exportada con 20 intentos en `2026-11-02-webspeech-improvised-20.json`) no se analizaron ni entran en ninguna cifra.
