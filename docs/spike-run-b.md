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

## Limitaciones

- **Efecto de práctica.** Es la segunda vez que el hablante dice estas mismas frases: puede hablar más claro o más seguro que en la corrida A. Una mejora en B no se puede atribuir por sí sola al retardo.
- **Dos cambios a la vez.** El retardo (a) y la grabación en paralelo (b) cambian juntos. La grabación abre un segundo flujo del micrófono y podría afectar al reconocimiento por sí misma. No se podrá separar el efecto de cada uno.
- **El retardo suma a la latencia medida.** La latencia se cuenta desde que se suelta el botón, y los 400 ms se esperan después de soltar. La latencia de B no es comparable 1 a 1 con la de A.
- **Mismo navegador, otro día.** Edge, no Chrome (ver `spike-results.md`): lo que se aprenda vale para Edge.
- La muestra sigue siendo de 78 intentos válidos por corrida; los intervalos de confianza siguen siendo anchos.
