# Spike de voz: Web Speech + parser

Pasos **exactos** para hacer las mediciones a mano. Las herramientas ya están construidas; los números salen solo de los archivos que tú exportes. Criterios y definiciones: [docs/spike-criteria.md](../docs/spike-criteria.md) (v1, fijados antes de medir).

Duración estimada: unos 40 minutos en total (144 intentos), mejor en dos o tres tandas.

## 0. Reglas que no se pueden romper

1. **Habla de forma natural, como en una partida.** No leas con pausas exageradas ni silabeando; di la frase como se la dirías a un rival.
2. **Un solo hablante** (tú), el mismo micrófono y el mismo equipo en todas las sesiones. Ideal: diadema con micrófono cercano.
3. **Primero `dev`, luego congelar el parser, y solo después `test`.** El parser se ajusta únicamente con `dev`. Si tocas el parser, el léxico o los umbrales después de haber medido `test`, esa medición deja de valer y hay que escribir un `test` nuevo (corpus v1).
4. **Descarta solo tropiezos tuyos** (tos, te equivocaste de frase, alguien te interrumpió, dijiste otra cosa). **Nunca** descartes porque el reconocedor entendió mal: ese error es justo lo que se mide.
5. No cambies el volumen del ruido de fondo ni la distancia al micrófono dentro de un mismo bloque.

## 1. Preparación (una vez)

Requisitos: Node, pnpm (`corepack enable`), VS Code con la extensión **Live Server**, Chrome o Edge.

```bash
pnpm install
pnpm test            # debe pasar todo
pnpm spike:build     # genera spike/web-speech/dist/bundle.js (no se sube a git)
```

Abre la carpeta raíz del repo en VS Code y arranca Live Server (puerto **5500**, ya configurado en `.vscode/settings.json`). Abre en **Chrome**:

> http://127.0.0.1:5500/spike/web-speech/index.html

Permite el micrófono cuando lo pida. Si cambias algo del parser, vuelve a ejecutar `pnpm spike:build` y recarga la página (la sesión en curso se conserva).

## 2. Comprobación previa (5 minutos)

1. Elige **Modo libre**, mantén **Espacio**, espera a ver «Escuchando… habla ahora» y di «caballo efe tres». Suelta. Debe aparecer el texto reconocido y la jugada propuesta.
2. Prueba de la **grabación en paralelo** (opcional pero recomendada, sirve para Whisper después):
   - Pulsa **Elegir carpeta para los WAV…** y elige `spike/recordings/` (créala si no existe; está en `.gitignore`).
   - En **Modo corpus**, bloque `Dev`, di las dos primeras frases con «Grabar WAV en paralelo» activado.
   - Comprueba que en la carpeta aparecen `p01-01_quiet_r1.wav` y `p01-02_quiet_r1.wav`, y que el reconocimiento **siguió funcionando** (hay texto, el intento se guardó).
   - **Si Web Speech falla o no devuelve texto solo cuando la grabación está activa** (errores `audio-capture`, o siempre vacío), Chrome no permite usar los dos a la vez en tu equipo. Entonces: desactiva «Grabar WAV en paralelo», haz toda la medición sin audio, y graba los WAV después en un paso aparte con **«Solo grabar (sin Web Speech)»** (recorre las mismas frases y guarda solo el audio, sin crear intentos).
3. Pulsa **Empezar sesión nueva** para borrar estas pruebas antes de medir.

## 3. Medición con `dev` (calibración)

1. Modo corpus, bloque **Dev · ambiente tranquilo** (28 frases, **una vez cada una**). Lee en voz alta lo que aparece entre « » y mira el tablero si dudas de la posición.
2. Al terminar, **Exportar resultados (JSON)** y mueve el archivo a `spike/results/` con este nombre:
   `AAAA-MM-DD-webspeech-dev.json`
3. Mira cómo le fue al parser, **solo con dev**:
   ```bash
   pnpm metrics spike/results/AAAA-MM-DD-webspeech-dev.json --split dev
   ```
4. Si hay fallos, ajusta el parser (léxico, alias, costos, `threshold`, `margin`) **mirando únicamente esos intentos de `dev`**. Puedes recalcular sin volver a hablar, porque el archivo guarda el texto reconocido. Sin opciones, el script usa los parámetros guardados en el archivo; para probar otros, pásalos: `--threshold 0.9 --margin 0.3 --rank-penalty 0.3`. Los tests de `packages/voice-parser` deben seguir pasando.
5. Anota los valores finales de `threshold`, `margin` y la penalización del N-best. Si cambiaste los valores por defecto del código, vuelve a ejecutar `pnpm spike:build` para que la página los muestre; si solo probaste con opciones, escríbelos en los campos de Ajustes antes de la medición de `test`.

## 4. Congelar el parser

Antes de tocar `test`:

```bash
pnpm test
git add -A && git commit -m "chore(spike): freeze parser before measuring the test split"
```

Anota el hash del commit en `docs/spike-results.md` (sección «Notas de la medición»). Desde aquí **no se toca el parser** hasta tener la decisión.

Ejecuta `pnpm spike:build` una vez más y recarga la página. Pulsa **Empezar sesión nueva** (para que el archivo del test no mezcle intentos de dev).

## 5. Medición con `test`

Todos los bloques están en el selector; cada uno se completa solo y pasa a la siguiente frase.

| Bloque | Intentos | Cómo |
|---|---|---|
| **Test · ambiente tranquilo** | 48 (16 frases × 3 repeticiones) | Ambiente tranquilo. Las repeticiones van en rondas: no se repite la misma frase dos veces seguidas |
| **Test · con ruido de fondo** | 48 (16 frases × 3 repeticiones) | Pon ruido de fondo realista (TV, música o conversación) a un volumen constante y habla por encima, a volumen normal, sin gritar |
| **Silencio** | 10 | **No digas nada.** Mantén Espacio unos 2 segundos, ambiente tranquilo, y suelta |
| **Ruido** | 10 | **No hables.** Mantén Espacio unos 2 segundos con el ruido de fondo puesto, y suelta |

Notas:
- Las frases «de ruido» del corpus (por ejemplo «hola buenos días a todos») son habla normal que **no** es una jugada: léelas con naturalidad. Se espera que el parser las rechace.
- Puedes pausar y continuar otro día: el progreso se guarda en el navegador. Antes de cerrar la pestaña, exporta.
- Si exportas en varias tandas, guarda cada archivo en `spike/results/` con nombres como `AAAA-MM-DD-webspeech-test-quiet.json`, `…-test-noisy.json`, `…-nonspeech.json`. El script acepta varios archivos a la vez.
- Si ves «Intento NO guardado: error del reconocedor», revisa permiso del micrófono, internet (Web Speech usa la nube de Google) o el idioma, y repite ese intento.

## 6. Calcular y registrar los resultados

```bash
pnpm metrics spike/results/AAAA-MM-DD-webspeech-test-quiet.json spike/results/AAAA-MM-DD-webspeech-test-noisy.json spike/results/AAAA-MM-DD-webspeech-nonspeech.json
```

(Cámbialos por los nombres reales de tus archivos; en PowerShell no hay comodines que se expandan, escribe los nombres.)

Revisa la salida. Si todo está bien, escribe el informe en el documento:

```bash
pnpm metrics <los mismos archivos> --write-results
```

El script se niega a escribir en `docs/spike-results.md` datos sintéticos (`*.fake.json`) o con un split distinto de `test`. Después, a mano, completa en `docs/spike-results.md` la sección **Decisión** según la regla del documento y las **Notas de la medición** (fecha, micrófono, ruido usado, parámetros del parser, hash del commit congelado). Sube los archivos de `spike/results/` al repo: son la evidencia.

Si la decisión es «no cumple», no cambies los criterios: aplica la regla del documento (reforzar, volver a medir con un `test` nuevo, o revisar el enfoque con un ADR).

## 7. Si algo falla

| Síntoma | Qué hacer |
|---|---|
| «Este navegador no tiene Web Speech API» | Usa Chrome o Edge, en `http://127.0.0.1:5500`, no abriendo el archivo con doble clic |
| No aparece «Escuchando» | Permiso del micrófono bloqueado: candado de la barra de direcciones → permitir |
| Resultados siempre vacíos | Sin internet, o idioma no soportado; prueba `es-ES` o `es-MX` y **anótalo** (cambiar el idioma entre bloques invalida la comparación) |
| La página se recarga sola | Live Server vio un cambio de archivo; no guardes nada del repo durante la sesión (los WAV y `spike/results/` ya están ignorados) |
| Perdiste la pestaña | Reabre la página: la sesión se restaura desde el navegador |
| Te equivocaste de frase | **Descartar último intento** y repite |

## 8. Qué hay en cada archivo de resultados

`meta` (idioma, número de alternativas, parámetros del parser, navegador, hablante) y `attempts`: por intento, la frase esperada, el split, la condición (`quiet`, `noisy`, `silence`, `noise`), la repetición, las alternativas **crudas** del reconocedor con su confianza, el error si lo hubo, la latencia (`recognitionMs`, `resolveMs`, `totalMs`, medida desde que sueltas el botón) y el nombre del WAV si se grabó. No se guarda audio dentro del JSON.

## 9. Parte 2: Whisper local

Para comparar con Whisper (`base` y `small`) usando los mismos clips, y para el agente HTTP local con su prueba de CORS, sigue [spike/whisper-local/README.md](whisper-local/README.md). Notas y límites conocidos: [docs/spike-notes.md](../docs/spike-notes.md).
