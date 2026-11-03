# Spike de voz: comprobación de portabilidad en Chrome

- Fecha de este documento: **2 de noviembre de 2026**, escrito y commiteado **antes** de medir en Chrome.
- Criterios y umbrales: los de [spike-criteria.md](spike-criteria.md) (v1). No cambian.
- Corrida B: la medición ya hecha en Edge 156 (informe en [spike-run-b.md](spike-run-b.md)). Queda intacta.

## Qué es y qué no es

- **Es** una comprobación de portabilidad con **un factor nuevo: el navegador** (Chrome en vez de Edge 156). El proyecto se presentará terminado y puede abrirse en Edge o en Chrome; esto responde si el producto funciona igual de bien en Chrome.
- **No es una repetición de la corrida B** ni una **corrida C** para buscar un mejor resultado. [spike-run-b.md](spike-run-b.md) fijó que solo hay una corrida B y que no habrá C; esa regla no se toca. Aquí no se mide para mejorar la cifra de B, sino para saber si el resultado se mantiene al cambiar de navegador.
- **No cambia la decisión del ADR 5.** El reconocedor por defecto y el retardo de 400 ms se siguen basando en la corrida B, medida en Edge. Esta comprobación no la sustituye ni la corrige, sea cual sea el resultado.

## Condiciones

Las de la corrida B, salvo el navegador:

- **Navegador: Google Chrome** (la versión se comprobará en el `userAgent` de cada archivo; no debe contener `Edg/`). Es el único factor que cambia.
- Retardo entre soltar y llamar a `stop()`: **400 ms**. Corrida del arnés: **B**.
- Grabación de WAV en paralelo activada.
- Mismo parser (etiqueta `spike-parser-freeze`), mismo corpus v0, mismos parámetros del parser (`threshold` 1, `margin` 0,25, `rankPenalty` 0,3, `nato` falso), idioma `es-CO`, 5 alternativas.
- Mismo hablante, mismo micrófono, mismo equipo y mismo ambiente tranquilo (sin ruido de fondo añadido).
- Mismos umbrales de [spike-criteria.md](spike-criteria.md).

## Qué se mide

Solo dos bloques; **no se mide** el bloque con ruido ni el de solo ruido, y no se repite `dev`:

| Bloque | Intentos |
|---|---|
| Test · ambiente tranquilo | 48 |
| Silencio | 10 |

Los 48 del bloque tranquilo incluyen 39 frases de jugada (el conjunto V de [spike-criteria.md](spike-criteria.md) en esta condición) y 9 frases que no son jugada.

## Cómo se decide que «cumple»

Los umbrales de [spike-criteria.md](spike-criteria.md), calculados solo sobre estos bloques (V = las 39 frases de jugada del bloque tranquilo). Escrito antes de medir, con los conteos que equivalen a cada umbral:

| Métrica | Umbral | Equivale a (sobre 39) |
|---|---|---|
| Acierto top-1 | ≥ 85 % | al menos 34 de 39 |
| Aceptación errónea | ≤ 2 % | 0 de 39 (1 de 39 ya es 2,6 %) |
| Ambigüedad | ≤ 10 % | como máximo 3 de 39 |
| Latencia p50 / p95 | ≤ 1,5 s / ≤ 3 s | — |
| Silencio / ruido | 0 aceptadas | 0 de las 9 frases que no son jugada y de los 10 de silencio |

Para referencia, la corrida B en Edge dio 35 de 39 en el bloque tranquilo (89,7 %). Chrome se compara con los umbrales, no con ese número.

## Qué responde y qué no

- **Responde solo una pregunta:** si el producto funciona igual de bien en Chrome, es decir, si cumple los umbrales con estas condiciones y esta voz.
- **No responde:** si Chrome es mejor o peor que Edge (con 39 frases la diferencia no se puede medir); si funciona con ruido de fondo (no se mide); si funciona con otra voz u otro micrófono; ni si el retardo de 400 ms es la causa de la mejora de B (ese control ya quedó sin respaldar en [spike-run-b.md](spike-run-b.md)).

## Consecuencias

- **Si cumple todos los umbrales:** el producto es **compatible con Chrome y con Edge** (con las limitaciones de abajo). No se cambia nada.
- **Si no cumple alguno:** se **recomienda Edge** y la aplicación **avisa** en Chrome de que el reconocimiento puede ser peor y sugiere Edge, Whisper local o la caja de texto. No se toca el parser, no se repite la medición para intentar mejorarla y no se cambia el ADR 5: el reconocedor por defecto sigue siendo Web Speech en Edge.
- En ninguno de los dos casos se cambian el parser, el corpus ni los criterios. El resultado se reporta tal cual, **una sola vez y por separado**; no se promedia ni se mezcla con A ni con B.

## Cómo se reporta

- Los archivos de Chrome **no se mezclan** con los de B en Edge: se pasan a `check-results`, `count-truncated` y `pnpm metrics` en invocaciones separadas, y sin `--write-results`.
- El informe se escribe en este documento, en una sección «Resultados», sin tocar el bloque automático de `spike-results.md`.

## Limitaciones

- **Una voz.** El mismo hablante de A y B.
- **48 intentos** (39 de jugada): los intervalos de confianza son anchos (del orden de ±12 puntos); «cumple» no prueba que el acierto real sea ≥ 85 %.
- **Efecto de práctica.** Es la tercera vez que el hablante dice estas frases; puede hablar con más soltura que en A y B.
- **Sin ruido.** El bloque con ruido no se mide, así que la portabilidad con ruido de fondo queda sin comprobar.
- **Un equipo y una versión de Chrome.** Lo que se aprenda vale para esa combinación; Chrome usa el reconocedor de Google y puede cambiar entre versiones.
