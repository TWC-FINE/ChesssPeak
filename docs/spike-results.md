# Spike de voz — resultados (Web Speech + parser)

**Estado: sin mediciones.** Este archivo se rellena con `pnpm metrics --write-results` a partir de los archivos de resultados reales exportados por el arnés (`spike/results/`). Ningún número se escribe a mano. El script se niega a escribir aquí si algún archivo es sintético (`*.fake.json`, `meta.fake`, o sesión que empieza por `fake`).

Criterios y definiciones: [spike-criteria.md](spike-criteria.md) (v1, fijados antes de medir).

## Resultados

<!-- results:start -->

| Métrica | Umbral | Medido | Estado |
|---|---|---|---|
| Acierto top-1 | ≥ 85 % | — | sin datos |
| Aceptación errónea | ≤ 2 % | — | sin datos |
| Ambigüedad | ≤ 10 % | — | sin datos |
| Latencia p50 | ≤ 1,5 s | — | sin datos |
| Latencia p95 | ≤ 3 s | — | sin datos |
| Silencio / ruido | 0 aceptadas | — | sin datos |
| N-best | +5 puntos sin subir la aceptación errónea | — | sin datos |

<!-- results:end -->

## Resultados de Whisper local

Se rellena con `benchmark --write-results` (`spike/whisper-local`) a partir de los clips WAV reales del arnés. Se niega a escribir con clips o archivos sintéticos (`*.fake.*`) o con un split distinto de `test`.

<!-- whisper:start -->

_Sin mediciones._

<!-- whisper:end -->

## Regla de decisión

Se evalúa con las métricas agregadas del split `test` (`quiet` + `noisy`):

1. **Se cumplen todos los umbrales** → se sigue con Web Speech por defecto.
2. **Acierto top-1 entre 70 % y 85 %** → se refuerzan los alias y el modo coordenadas, y se vuelve a medir con un `test` nuevo.
3. **Acierto top-1 menor a 70 %** → se revisa el enfoque (Whisper por defecto o modo coordenadas/OTAN) y se registra en un ADR.
4. **Acierto ≥ 85 % pero falla otro umbral** → no se da por cumplido; se corrige la causa y se vuelve a medir con un `test` nuevo.
5. La falsa aceptación distinta de cero nunca se compensa con otras métricas.

## Decisión

_Pendiente de las mediciones._

## Notas de la medición

_Se anotan aquí: fecha, micrófono, ambiente, parámetros del parser fijados con `dev`, y cualquier incidencia (por ejemplo, intentos descartados)._
