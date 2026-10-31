# Spike de voz — criterios de decisión

Estos criterios se fijaron **antes de construir cualquier herramienta de medición** y **no se cambian después de medir**. Si hay que cambiar algo, se registra como una versión nueva de este archivo (v2) con la fecha y el motivo, y las mediciones hechas con la versión anterior se descartan como evidencia de decisión.

- Versión: **v1**
- Fecha: 31 de octubre de 2026
- Origen de los umbrales: [PLAN.md](../PLAN.md), sección 6. Las definiciones de cada métrica y las reglas de medición son de este documento.
- Alcance de esta etapa: **Web Speech API + parser** (sesión 1 de 2). Whisper se mide en otra sesión con sus propios criterios, derivados de esta misma tabla.

## 1. Umbrales

| Métrica | Umbral para seguir con Web Speech por defecto |
|---|---|
| Acierto top-1 en frases válidas | ≥ 85 % |
| Aceptación errónea | ≤ 2 % |
| Ambigüedad | ≤ 10 % |
| Latencia (soltar el botón → propuesta) | p50 ≤ 1,5 s y p95 ≤ 3 s |
| Silencio / ruido | 0 jugadas aceptadas |
| N-best | Se adopta solo si sube el acierto ≥ 5 puntos porcentuales sin aumentar la aceptación errónea |

## 2. Definiciones

Un **intento** es una pulsación de “mantener para hablar” que termina en un resultado (o en un error del reconocedor). Cada intento tiene una **condición** y una **expectativa**.

**Condiciones**
- `quiet`: se dice la frase en un ambiente tranquilo.
- `noisy`: se dice la frase con ruido de fondo (voz de TV, música o conversación a volumen realista).
- `silence`: se mantiene el botón sin decir nada, en ambiente tranquilo.
- `noise`: se mantiene el botón con ruido de fondo y sin decir nada.

**Expectativas** (qué debería salir)
- `move`: una jugada concreta (`expectedUci`).
- `command`: un comando (sí / no / cancelar).
- `nomatch`: nada. Aplica a las frases de ruido del corpus (habla que no es una jugada) y a todos los intentos `silence` y `noise`.

**Resultado del parser** (`resolve`): `move`, `ambiguous`, `nomatch` o `command`. Si el reconocedor no devuelve ninguna alternativa (`no-speech`, error, vacío), el resultado es `nomatch`.

**Conjunto de frases válidas (V):** intentos con expectativa `move` y condición `quiet` o `noisy`. Los comandos no entran en V.

| Métrica | Definición |
|---|---|
| Acierto top-1 | intentos de V con resultado `move` y `uci == expectedUci`, dividido entre \|V\| |
| Aceptación errónea | intentos de V con resultado `move` y `uci ≠ expectedUci`, dividido entre \|V\| |
| Ambigüedad | intentos de V con resultado `ambiguous`, dividido entre \|V\| |
| Nomatch | intentos de V con resultado `nomatch`, dividido entre \|V\| |
| Otros | intentos de V con resultado `command`; se reporta aparte y cuenta como fallo |
| Falsa aceptación (silencio / ruido) | intentos con expectativa `nomatch` (frases de ruido, `silence`, `noise`) cuyo resultado es `move` o `command`. Debe ser **0** |
| Latencia | `totalMs` = desde que se suelta el botón hasta que la propuesta del parser está lista, solo en intentos de V con resultado del reconocedor. Percentiles p50 y p95 calculados en Node (método del rango más cercano) |

El acierto de los comandos se reporta aparte (informativo, no decide).

## 3. Reglas de medición

1. **Un solo hablante** (quien ejecuta el spike), con micrófono de diadema y el mismo equipo en todas las sesiones.
2. **Frases dichas de forma natural**, como en una partida, no leídas con pausas exageradas.
3. **Split dev / test por posición** (70 / 30). El parser se ajusta **solo con `dev`**. Las métricas que deciden se calculan **solo con `test`**.
4. **Repeticiones:** cada frase de `dev` una vez (`quiet`); cada frase de `test` tres veces en `quiet` y tres veces en `noisy`. Los intentos `silence` y `noise` van aparte (mínimo 10 de cada tipo).
5. **Los números salen de archivos de resultados reales** exportados por el arnés. Los archivos `*.fake.json` son datos sintéticos de prueba del script y nunca se usan como evidencia.
6. Las métricas decisivas son las **agregadas de `test`** (`quiet` + `noisy` juntos). Por condición se reporta también, pero no decide por separado.
7. **El conjunto `test` no se usa para ajustar nada.** Si después de ver resultados de `test` se cambia el parser, el léxico, los umbrales del parser o el corpus, esas mediciones ya no sirven como evidencia: hay que escribir un `test` nuevo (corpus v1) y medir de nuevo.
8. Los parámetros del parser (`threshold`, `margin`) se fijan con `dev` antes de la medición decisiva y se anotan en el archivo de resultados.

## 4. Comparación del N-best

Con los mismos intentos de `test`, el script calcula dos variantes:
- **Solo la primera alternativa** del reconocedor.
- **N-best:** hasta 5 alternativas (`maxAlternatives = 5`), con la penalización por posición definida en el parser.

Se adopta el N-best únicamente si: (acierto top-1 con N-best) − (acierto top-1 solo primera) ≥ 5 puntos porcentuales **y** la aceptación errónea con N-best no es mayor que la de solo la primera. En cualquier otro caso se usa solo la primera alternativa.

## 5. Regla de decisión

Se evalúa con las métricas agregadas de `test`:

1. **Se sigue con Web Speech por defecto** si se cumplen **todos** los umbrales de la sección 1.
2. Si el **acierto top-1 está entre 70 % y 85 %**: se refuerzan los alias y el modo coordenadas, se anota el cambio y se vuelve a medir con un `test` nuevo (regla 7).
3. Si el **acierto top-1 es menor a 70 %**: se revisa el enfoque (Whisper por defecto o modo coordenadas/OTAN) y se registra en un ADR.
4. Si el acierto es ≥ 85 % pero **falla otro umbral** (aceptación errónea, ambigüedad, latencia o falsa aceptación): no se da por cumplido; se corrige la causa y se vuelve a medir con un `test` nuevo.

La falsa aceptación distinta de cero **nunca** se compensa con otras métricas.

## 6. Tamaño de muestra (advertencia)

El corpus v0 tiene unas 40 frases; el split `test` tiene al menos 15 frases, cada una con 6 repeticiones (3 `quiet` + 3 `noisy`), es decir, unas 90 muestras. Es suficiente para decidir si seguir o no con el diseño, no para afirmar porcentajes finos: con 90 muestras, un solo fallo mueve el acierto aproximadamente 1 punto. Los intervalos de confianza se reportan junto a cada porcentaje.
