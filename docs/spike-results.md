# Spike de voz — resultados (Web Speech + parser)

**Estado: spike medido (corrida A y corrida B, 1 y 2 de noviembre de 2026); decisión tomada abajo.** El bloque automático de abajo es de la **corrida A**. La corrida B y Whisper se resumen en «Resumen de la corrida B y de Whisper». Este archivo se rellena con `pnpm metrics --write-results` a partir de los archivos de resultados reales exportados por el arnés (`spike/results/`). Ningún número se escribe a mano. El script se niega a escribir aquí si algún archivo es sintético (`*.fake.json`, `meta.fake`, o sesión que empieza por `fake`).

Criterios y definiciones: [spike-criteria.md](spike-criteria.md) (v1, fijados antes de medir).

> **Aviso: todas las mediciones de Web Speech de este documento se hicieron en Microsoft Edge 156.0.0.0** (reconocedor de Microsoft), no en Chrome. El plan (PLAN.md) asumía Chrome (reconocedor de Google). **Chrome no se midió.** Por tanto, estos resultados valen para Edge y no se pueden dar por válidos para Chrome. PLAN.md no se ha modificado; se revisará después de la decisión.

## Resultados

<!-- results:start -->

_Generado por `pnpm metrics --write-results` el 2026-11-01T06:20:29.886Z._

Split evaluado: **test**. Modo elegido: **solo la primera alternativa**.

**Archivos de resultados usados**

| Archivo | Sesión | Idioma | Intentos |
| --- | --- | --- | --- |
| 2026-11-01-webspeech-ambientetranquiloreal.json | 2026-11-01T06-02-20-146Z | es-CO | 48 |
| 2026-11-01-webspeech-ruido.json | 2026-11-01T06-08-55-433Z | es-CO | 48 |
| 2026-11-01-webspeech-silencio.json | 2026-11-01T06-15-31-865Z | es-CO | 10 |
| 2026-11-01-webspeech-sinhablarruido.json | 2026-11-01T06-17-00-070Z | es-CO | 10 |

Parámetros del parser: {"threshold":1,"margin":0.25,"rankPenalty":0.3,"nato":false}. Intentos válidos (V): 78.

**Criterios** (ver [spike-criteria.md](spike-criteria.md))

| Métrica | Umbral | Medido | Estado |
| --- | --- | --- | --- |
| Acierto top-1 | ≥ 85 % | 56.4 % (44/78; IC95 45–67 %) | no cumple |
| Aceptación errónea | ≤ 2 % | 1.3 % (1/78; IC95 0–7 %) | cumple |
| Ambigüedad | ≤ 10 % | 10.3 % (8/78; IC95 5–19 %) | no cumple |
| Latencia p50 | ≤ 1,5 s | 0.18 s (n=78) | cumple |
| Latencia p95 | ≤ 3 s | 0.25 s (n=78) | cumple |
| Silencio / ruido | 0 aceptadas | 0/38 | cumple |

**Comparación del N-best**

| Modo | Acierto top-1 | Aceptación errónea | Ambigüedad | Nomatch |
| --- | --- | --- | --- | --- |
| Solo primera alternativa | 56.4 % (44/78; IC95 45–67 %) | 1.3 % (1/78; IC95 0–7 %) | 10.3 % (8/78; IC95 5–19 %) | 32.1 % (25/78; IC95 23–43 %) |
| N-best (hasta 5) | 56.4 % (44/78; IC95 45–67 %) | 1.3 % (1/78; IC95 0–7 %) | 10.3 % (8/78; IC95 5–19 %) | 32.1 % (25/78; IC95 23–43 %) |

Ganancia del N-best: 0.0 puntos. No se adopta: el acierto sube menos de 5 puntos.

**Por condición** (informativo; no decide por separado)

| Condición | Intentos V | Acierto top-1 | Aceptación errónea | Ambigüedad | Nomatch |
| --- | --- | --- | --- | --- | --- |
| quiet | 39 | 64.1 % (25/39; IC95 48–77 %) | 0.0 % (0/39; IC95 0–9 %) | 10.3 % (4/39; IC95 4–24 %) | 25.6 % (10/39; IC95 15–41 %) |
| noisy | 39 | 48.7 % (19/39; IC95 34–64 %) | 2.6 % (1/39; IC95 0–13 %) | 10.3 % (4/39; IC95 4–24 %) | 38.5 % (15/39; IC95 25–54 %) |

Comandos reconocidos (informativo): n/d.

**Decisión según la regla del spike:** Acierto top-1 < 70 %: revisar el enfoque (Whisper por defecto o modo coordenadas/OTAN) y registrar un ADR.

<!-- results:end -->

## Resultados de Whisper local

Se rellena con `benchmark --write-results` (`spike/whisper-local`) a partir de los clips WAV reales del arnés. Se niega a escribir con clips o archivos sintéticos (`*.fake.*`) o con un split distinto de `test`.

<!-- whisper:start -->

_Sin mediciones._

<!-- whisper:end -->

## Frases improvisadas (informativo, fuera de los criterios)

**Esta sección no decide nada y no se mezcla con las métricas de `test`.** Son 10 frases que el hablante inventó en el momento, en el «Modo improvisado» del arnés, y luego indicó qué jugada quería decir. Los intentos tienen `split: null`, por eso `pnpm metrics --split test` no los cuenta (comprobado: con y sin este archivo, V = 78 y el acierto de `test` sigue en 56,4 %). Archivo: `spike/results/2026-11-01-improvised-2026.json`.

- Ambiente tranquilo, 1 de noviembre de 2026, es-CO, parámetros del parser por defecto (los mismos congelados). No se grabó audio.
- **Todas están en una sola posición (`p05`)**, no repartidas entre `p05`, `p08` y `p09`. Con 10 intentos los intervalos son muy anchos.
- Datos tomados del archivo; el parser es el congelado (`spike-parser-freeze`).

| Métrica | Resultado | IC95 |
|---|---|---|
| Acierto top-1 | 100 % (10/10) | 72–100 % |
| Aceptación errónea | 0 % (0/10) | 0–28 % |
| Ambigüedad | 0 % (0/10) | 0–28 % |
| Nomatch | 0 % (0/10) | 0–28 % |
| Latencia (soltar → propuesta) | 154–229 ms (mediana 187 ms) | n/d |
| N-best frente a primera alternativa | sin diferencia (10/10 en ambos) | n/d |

| # | Lo que quise decir | Lo que reconoció Web Speech (1ª) | Lo que resolvió el parser | ms |
|---|---|---|---|---|
| imp:1 | O-O (e8g8) | «En Roque corto.» | jugada O-O ✓ | 212 |
| imp:2 | O-O-O (e8c8) | «En Roque largo.» | jugada O-O-O ✓ | 158 |
| imp:3 | Rg8 (h8g8) | «Torre g 8.» | jugada Rg8 ✓ | 192 |
| imp:4 | Qf5 (d7f5) | «Dama F 5.» | jugada Qf5 ✓ | 229 |
| imp:5 | a6 (a7a6) | «Peón a 6.» | jugada a6 ✓ | 184 |
| imp:6 | Nd4 (c6d4) | «Caballo d cuatro.» | jugada Nd4 ✓ | 190 |
| imp:7 | Nh5 (f6h5) | «Caballo h 5.» | jugada Nh5 ✓ | 154 |
| imp:8 | Kf8 (e8f8) | «Rey F 8.» | jugada Kf8 ✓ | 162 |
| imp:9 | Nb4 (c6b4) | «Caballo b cuatro.» | jugada Nb4 ✓ | 185 |
| imp:10 | Bxf3 (g4f3) | «Alfil toma F 3.» | jugada Bxf3 ✓ | 162 |

Lectura prudente: con una sola posición y 10 frases, este resultado no dice que el acierto real sea alto. Solo muestra que, en esa posición y en ambiente tranquilo, las frases improvisadas se reconocieron bien, a diferencia de las frases del corpus con las mismas piezas. No hay datos para explicar la diferencia.

## Resumen de la corrida B y de Whisper

Informe completo, con las tres tablas y las salvedades: [spike-run-b.md](spike-run-b.md#resultados-de-la-corrida-b). A y B no se promedian.

| | Acierto top-1 | Aceptación errónea | Ambigüedad | Latencia p50 / p95 | Truncados | Cumple |
|---|---|---|---|---|---|---|
| A (Web Speech, Edge, sin retardo) | 56,4 % (44/78) | 1,3 % | 10,3 % | 0,18 / 0,25 s | 6 de 78 | no |
| B (Web Speech, Edge, retardo 400 ms) | 87,2 % (68/78; IC95 78–93 %) | 0,0 % | 0,0 % | 0,57 / 0,62 s | 0 de 78 | sí |
| Whisper `small` + prompt de ajedrez | 89,7 % (70/78; IC95 81–95 %) | 0,0 % | 7,7 % | 2,91 / 3,06 s (solo inferencia) | — | no: latencia |

Whisper `base` (74,4 % con prompt, 61,5 % sin él) y `small` sin prompt (61,5 %) no cumplen el acierto. Silencio y ruido: 0 jugadas aceptadas en todas las configuraciones.

**Lectura de la regla:** B cuenta para la decisión (cumple todos los umbrales y tiene 0 truncados, máximo 2). A queda como línea base. **Salvedades principales:** el control no respalda atribuir la mejora solo al retardo (20 fallos no truncados con ruido en A contra 6 en B); posible efecto de práctica y ruido no idéntico; una sola voz y una sola corrida B; el límite inferior del IC95 de B es 78 %, por debajo del 85 %; todo en Edge 156; la latencia de Whisper es solo inferencia; y hay sesgo de selección entre las 4 configuraciones de Whisper.

El bloque «Resultados de Whisper local» de arriba (`whisper:start`/`whisper:end`) no se rellenó con `benchmark --write-results`: las cifras de Whisper están en el informe de la corrida B y en los cuatro `spike/results/2026-11-02-whisper-*.json`.

## Regla de decisión

Se evalúa con las métricas agregadas del split `test` (`quiet` + `noisy`):

1. **Se cumplen todos los umbrales** → se sigue con Web Speech por defecto.
2. **Acierto top-1 entre 70 % y 85 %** → se refuerzan los alias y el modo coordenadas, y se vuelve a medir con un `test` nuevo.
3. **Acierto top-1 menor a 70 %** → se revisa el enfoque (Whisper por defecto o modo coordenadas/OTAN) y se registra en un ADR.
4. **Acierto ≥ 85 % pero falla otro umbral** → no se da por cumplido; se corrige la causa y se vuelve a medir con un `test` nuevo.
5. La falsa aceptación distinta de cero nunca se compensa con otras métricas.

## Decisión

**Fecha: 2 de noviembre de 2026.** Aplicando la regla de decisión con la corrida B (la que cuenta según [spike-run-b.md](spike-run-b.md)): se cumplen todos los umbrales, así que se sigue con Web Speech por defecto. Las decisiones, con los ADR [4](adr/0004-resolucion-contra-jugadas-legales.md) y [5](adr/0005-strategy-y-reconocedor-por-defecto.md):

1. **Reconocedor por defecto: Web Speech en Edge, con un retardo de 400 ms entre soltar el botón y llamar a `stop()`.** Ese retardo **es un requisito del producto**, no un parámetro de prueba: la corrida A, sin él, no cumple los umbrales.
2. **Whisper local, modelo `small` con prompt de ajedrez, como alternativa seleccionable y módulo local.** Su latencia se declara tal cual: p50 2,91 s y p95 3,06 s, solo inferencia, por encima de los umbrales de 1,5 s y 3 s. No es el reconocedor por defecto.
3. **Confirmación explícita obligatoria** antes de enviar cualquier jugada, sea cual sea el reconocedor.
4. **El N-best no se adopta** (ganancia 0,0 puntos en A, B y Whisper).
5. **Resolución contra jugadas legales** (ADR 4): confirmada con los datos medidos.

**Lo que esta decisión no resuelve** (se mide después, ver las consecuencias de los ADR): que la mejora de B se deba al retardo no está demostrado (el control no la respalda por sí solo); falta validar con otra voz, con frases nuevas y con el equipo de la demo (sesión de evaluación de la semana 4); no se ha probado en Chrome (PLAN.md sigue asumiendo Chrome y no se ha modificado); y queda por probar, como corrida nueva declarada, un modelo `small` cuantizado para bajar la latencia de Whisper.

## Notas de la medición

- **Fecha:** 1 de noviembre de 2026. Idioma `es-CO`, 5 alternativas, un solo hablante (campo «Hablante» sin rellenar).
- **Navegador (campo `userAgent` de cada archivo):** los seis archivos son de **Microsoft Edge 156.0.0.0** (Chromium 156), Windows 10 de 64 bits. **No se usó Chrome**, que es lo que pedía la guía.

  | Archivo | Intentos | Navegador | Exportado (UTC) |
  |---|---|---|---|
  | `2026-11-01-webspeech-dev.json` | 28 | Edge 156.0.0.0 | 05:42 |
  | `2026-11-01-webspeech-ambientetranquiloreal.json` | 48 | Edge 156.0.0.0 | 06:02 |
  | `2026-11-01-webspeech-ruido.json` | 48 | Edge 156.0.0.0 | 06:08 |
  | `2026-11-01-webspeech-silencio.json` | 10 | Edge 156.0.0.0 | 06:15 |
  | `2026-11-01-webspeech-sinhablarruido.json` | 10 | Edge 156.0.0.0 | 06:17 |
  | `2026-11-01-improvised-2026.json` | 10 | Edge 156.0.0.0 | 06:36 |

  Consecuencia: el resultado de Web Speech es **para Edge (reconocedor de Microsoft)**. El plan asumía **Chrome (reconocedor de Google)** y **Chrome no se midió**. No se sabe si las cifras en Chrome serían mejores, iguales o peores, y la afirmación de que Edge usa el servicio de Microsoft no se comprobó dentro del spike (viene de lo indicado por quien midió). Cualquier decisión sobre «Chrome en la demo» necesita una medición en Chrome con un `test` nuevo si hubiera que cambiar el parser.
- **Micrófono y ruido usado (corrida A, según quien midió):** micrófono = HyperX amp chat; ruido de fondo = TikToks y música de fondo.
- **Parámetros del parser:** los de por defecto, sin cambios tras `dev`: `threshold` 1, `margin` 0,25, `rankPenalty` 0,3, `nato` falso (coinciden en los 5 archivos).
- **Congelación del parser:** commit `291c84f3e674867c28aca759516d8a281fde3601`, etiqueta `spike-parser-freeze`.
  - **Se hizo después de medir `test`, no antes** como pedía el procedimiento. Se hizo al verificar los datos.
  - Evidencia de que no hubo cambios: `git diff HEAD -- packages` vacío; los archivos de `packages/` tienen fecha del clon (00:04), anterior a la medición de `dev` (00:50) y de `test` (01:05–01:17); y los cinco archivos de resultados guardan los mismos parámetros por defecto.
  - Esa evidencia es indirecta (fechas y diff), no el orden de los commits.
- **Archivos usados:** `2026-11-01-webspeech-ambientetranquiloreal.json` (48), `…-ruido.json` (48), `…-silencio.json` (10), `…-sinhablarruido.json` (10). `dev`: `2026-11-01-webspeech-dev.json` (28). Sin duplicados ni archivos sintéticos.
- **Incidencias:** ningún intento de `test` tiene WAV (solo existe `p05-01_quiet_r1.wav`, de la comprobación previa, sin intento asociado). Las 10 frases improvisadas de arriba están en `2026-11-01-improvised-2026.json`; `2026-11-02-webspeech-improvised-20.json` es la misma sesión re-exportada con 20 intentos (los 10 extra no se analizaron). En silencio y solo ruido, Web Speech devolvió texto vacío en 19 de 20 intentos y «CHA.» en uno.
