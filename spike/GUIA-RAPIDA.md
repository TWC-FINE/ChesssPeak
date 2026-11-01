# Guía rápida del spike de voz

Versión corta y paso a paso de [spike/README.md](README.md). Los criterios están en [docs/spike-criteria.md](../docs/spike-criteria.md) y no se tocan.

**Dos reglas que valen más que todo lo demás**

1. **Habla natural, como en una partida.** Sin pausas exageradas ni silabear. Como si se lo dijeras a un rival.
2. **Tú solo hablas, siempre con el mismo micrófono** (idealmente la diadema) y a la misma distancia. Solo descartas tropiezos tuyos (tos, te equivocaste de frase). **Nunca** descartes porque el reconocedor entendió mal: ese error es justo lo que se mide.

---

## 0. Antes de empezar (una sola vez)

Terminal en la carpeta del repo (la que tiene `.git` y `pnpm-workspace.yaml`):

```powershell
cd C:\Users\Coco\Desktop\ChesssPeak\ChesssPeak
pnpm install
pnpm spike:build
mkdir spike\recordings
```

(`mkdir` solo hace falta si la carpeta `spike\recordings` no existe. `pnpm install` puede terminar con un aviso de `esbuild`: es inofensivo, está anotado en `docs/spike-notes.md`.)

1. En VS Code: **Archivo → Abrir carpeta…** y elige `C:\Users\Coco\Desktop\ChesssPeak\ChesssPeak` (la interna). Ese tiene que ser el raíz, o la URL de abajo no funciona.
2. En el panel de archivos, clic derecho sobre `spike/web-speech/index.html` → **Open with Live Server**. El puerto ya está fijado en **5500** (`.vscode/settings.json`).
3. Abre **Chrome** (no Edge, no Firefox) en esta dirección exacta:

   `http://127.0.0.1:5500/spike/web-speech/index.html`

4. Cuando Chrome pida el micrófono, pulsa **Permitir**. Necesitas internet: Web Speech usa los servidores de Google.

Cada vez que **cambies código** del repo, repite `pnpm spike:build` y recarga la página (F5). La sesión se conserva.

> **Mientras mides, no guardes archivos del repo en VS Code:** Live Server recargaría la página en medio de un intento.

---

## 1. Comprobación previa (5 minutos)

Sirve para saber si tu equipo puede reconocer voz y grabar el WAV a la vez.

**a) Web Speech solo**

1. En la tarjeta de modos, marca **Modo libre (no se guarda)**.
2. Mantén pulsado **Espacio**. Espera a ver «Escuchando… habla ahora.» en el estado.
3. Di «caballo efe tres». Suelta.
4. Debe aparecer el texto reconocido y «Solo primera alternativa: jugada Nf3 …».

Si sale «Este navegador no tiene Web Speech API», no estás en Chrome o no abriste la dirección `127.0.0.1:5500`. Si nunca aparece «Escuchando», mira el candado de la barra de direcciones y permite el micrófono.

**b) Grabación en paralelo del WAV**

1. En **Ajustes**, pulsa **Elegir carpeta para los WAV…** y elige `spike\recordings`. Chrome pedirá permiso para editar archivos: acepta. Debe decir «Carpeta lista y micrófono de grabación activo.» y se marca solo **Grabar WAV en paralelo**.
2. Marca **Modo corpus**. En **Bloque** deja **Dev · ambiente tranquilo**. Di las dos primeras frases que te pida la pantalla, tal cual aparecen entre « ».
3. Comprueba en la carpeta `spike\recordings`:
   - Aparecen `p01-01_quiet_r1.wav` y `p01-02_quiet_r1.wav`.
   - El reconocimiento siguió funcionando (hay texto y la tabla de abajo tiene filas).

**Si fallan juntos** (error `audio-capture`, o Web Speech siempre vacío solo cuando graba): Chrome no los deja convivir en tu equipo. Entonces:

- Desmarca **Grabar WAV en paralelo** y mide todo sin audio.
- Los WAV los grabas después, en un paso aparte, con **Solo grabar (sin Web Speech)** (ver sección 9).

**c) Limpiar las pruebas:** pulsa **Empezar sesión nueva** (confirma). Las pruebas no deben ir al archivo real.

---

## 2. Cómo se usa la pantalla

- **Mantener para hablar (Espacio):** mantén Espacio, espera el «Escuchando… habla ahora.», habla, suelta. También vale mantener pulsado el botón con el mouse.
- La frase que debes decir sale en grande entre « ». Debajo del tablero ves la posición.
- Cada intento se completa solo y pasa al siguiente. Arriba ves «intento N de M».
- **Descartar último intento:** si te equivocaste de frase, tosiste o te interrumpieron. Después repite.
- Si sale «Intento NO guardado: error del reconocedor», revisa el micrófono o internet y repite ese intento.
- Si cierras la pestaña por accidente, vuelve a abrirla: la sesión se restaura. Aun así, **exporta al terminar cada tanda**.
- **No cambies Idioma (es-CO), Alternativas (5) ni Hablante entre tandas.** Escribe tu nombre en **Hablante** una vez.

---

## 3. Las tandas, en orden

Son 144 intentos con el corpus v0, más tus 10 improvisadas. Si te cansas, para por bloques (el avance se guarda), pero **exporta antes de cerrar**.

| # | Tanda | Bloque en la pantalla | Intentos | Archivo que exportas |
|---|---|---|---|---|
| 1 | Dev | **Dev · ambiente tranquilo** | 28 (28 frases, una vez) | `AAAA-MM-DD-webspeech-dev.json` |
| 2 | Congelar el parser | (lo hago yo, ver sección 5) | 0 | — |
| 3 | Test tranquilo | **Test · ambiente tranquilo** | 48 (16 frases × 3 rondas) | `AAAA-MM-DD-webspeech-test-quiet.json` |
| 4 | Test con ruido | **Test · con ruido de fondo** | 48 (16 frases × 3 rondas) | `AAAA-MM-DD-webspeech-test-noisy.json` |
| 5 | Silencio | **Silencio (sin hablar, ambiente tranquilo)** | 10 | `AAAA-MM-DD-webspeech-nonspeech.json` (junto con la 6) |
| 6 | Solo ruido | **Ruido (sin hablar, con ruido de fondo)** | 10 | (mismo archivo que la 5) |
| 7 | 10 frases improvisadas | **Modo improvisado (se guarda aparte)** | 10 | `AAAA-MM-DD-webspeech-improvised.json` |

Notas:

- De las 16 frases de test, 3 **no son jugadas** («mañana tengo examen de física», «hola buenos días a todos», «voy a pensar un momento»). Léelas natural; se espera que el parser las rechace. Entonces las frases que cuentan para acierto son 13 × 6 = 78 intentos, no 96. Un solo fallo mueve el acierto cerca de 1,3 puntos.
- De las 28 frases de dev, 2 son comandos («sí» y «cancelar») y 2 no son jugadas («hoy hace mucho calor», «no sé qué decir ahora»). Léelas igual.
- La repetición va en rondas: nunca te pide la misma frase dos veces seguidas.

### Después de cada tanda: exportar y empezar de cero

Este paso se repite en las tandas 1, 3, 4 y (5+6):

1. Pulsa **Exportar resultados (JSON)**. Chrome descarga `webspeech-….json` a Descargas.
2. Muévelo y renómbralo a `spike\results\` (cambia la fecha por la del día):

   ```powershell
   Get-ChildItem "$env:USERPROFILE\Downloads\webspeech-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Move-Item -Destination spike\results\2026-11-01-webspeech-dev.json
   ```

   (Cambia `-dev` por `-test-quiet`, `-test-noisy` o `-nonspeech` según la tanda.)
3. Pulsa **Empezar sesión nueva** y confirma. **Es obligatorio:** `pnpm metrics` no elimina duplicados entre archivos, y sin esto el siguiente archivo repetiría los intentos del anterior.
4. **Copia de seguridad:** copia las carpetas `spike\results\` y `spike\recordings\` a un lugar seguro fuera del repo (otra unidad, USB o la nube). Los `.wav` los ignora git (`recordings/` y `*.wav` están en `.gitignore`), y los JSON de resultados no se suben hasta que los commiteemos. Si pierdes el disco, se pierde la medición.

Las tandas 5 y 6 van al mismo archivo: haz el Silencio, luego **cambia el Bloque a Ruido** y haz los 10 de ruido **sin exportar entre medias**; exporta al final de los dos.

---

## 4. Tanda 1: Dev (calibración)

1. Marca **Modo corpus**. En **Bloque**, elige **Dev · ambiente tranquilo**.
2. Di las 28 frases, una vez cada una.
3. Exporta y empieza sesión nueva (sección 3).
4. Mira cómo le fue al parser, solo con `dev`:

   ```powershell
   pnpm metrics spike/results/2026-11-01-webspeech-dev.json --split dev
   ```

5. Si hay fallos, **dímelo y miramos juntos** qué ajustar. Solo se puede tocar el parser (léxico, alias, `threshold`, `margin`) mirando intentos de `dev`. Para probar otros parámetros sin volver a hablar:

   ```powershell
   pnpm metrics spike/results/2026-11-01-webspeech-dev.json --split dev --threshold 0.9 --margin 0.3 --rank-penalty 0.3
   ```

6. Cuando estés conforme, anota los valores finales de `threshold`, `margin` y la penalización del N-best.

---

## 5. Tanda 2: Congelar el parser

Cuando termines dev, **dime «terminé dev»**. Yo hago esto, tú no:

1. `pnpm test` (deben pasar todos).
2. Commit del arnés con el modo improvisado (`feat(spike): …`), si aún no está commiteado.
3. Commit de congelación (`chore(spike): freeze parser before measuring the test split`), sin push.
4. Etiqueta de git `spike-parser-freeze`.
5. Escribo el hash en `docs/spike-results.md`.

Desde ahí **nadie toca el parser ni el corpus ni los umbrales** hasta tener la decisión (si lo tocas después de ver `test`, esa medición ya no vale).

Luego, tú:

1. Si cambiaste valores por defecto del código, `pnpm spike:build` y F5. Si solo probaste con opciones, escribe `threshold`, `margin` y **Penalización N-best** en **Ajustes**.
2. Pulsa **Empezar sesión nueva** (para que el archivo de test no mezcle dev).

---

## 6. Tandas 3 y 4: Test

**Tanda 3, tranquilo** (48 intentos): ambiente tranquilo, bloque **Test · ambiente tranquilo**. Exporta como `test-quiet` y empieza sesión nueva.

**Tanda 4, con ruido** (48 intentos): pon ruido de fondo realista (TV, música o conversación) a **volumen constante**. Bloque **Test · con ruido de fondo**. Habla por encima del ruido, a volumen normal, **sin gritar**. No cambies el volumen del ruido ni tu distancia al micrófono durante el bloque. Exporta como `test-noisy` y empieza sesión nueva.

---

## 7. Tandas 5 y 6: Silencio y solo ruido

- **Silencio** (10 intentos): ambiente tranquilo, **no digas nada**. Mantén Espacio unos 2 segundos y suelta. Bloque **Silencio (sin hablar, ambiente tranquilo)**.
- **Solo ruido** (10 intentos): pon el **mismo ruido** de la tanda 4, **no hables**. Mantén Espacio unos 2 segundos y suelta. Bloque **Ruido (sin hablar, con ruido de fondo)**.

Exporta los dos juntos como `nonspeech` y empieza sesión nueva.

---

## 8. Tanda 7: 10 frases improvisadas

Son informativas: **no cuentan para la decisión**, van a un archivo aparte y la sesión nueva no las borra.

1. Marca **Modo improvisado (se guarda aparte)**.
2. Elige la **Posición** (solo salen las 3 de test: `p05`, `p08`, `p09`). Mira el tablero.
3. Mantén Espacio y di **una jugada legal como la dirías tú, improvisada** (no la leas de ningún sitio).
4. Al soltar, verás qué entendió el reconocedor. Abajo, en **Jugada que quise decir**, elige la jugada que querías decir.
5. Pulsa **Guardar intento improvisado** (o **Descartar este intento** si te equivocaste). El contador dice «N improvisadas guardadas».
6. Repite hasta 10. Reparte entre las tres posiciones.
7. Pulsa **Exportar improvisadas (JSON)**, y muévelo a `spike\results\2026-11-01-webspeech-improvised.json`:

   ```powershell
   Get-ChildItem "$env:USERPROFILE\Downloads\webspeech-improvised-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Move-Item -Destination spike\results\2026-11-01-webspeech-improvised.json
   ```

8. Copia de seguridad de `spike\results\` y `spike\recordings\`.

**Importante:** este archivo **no se pasa a `pnpm metrics` junto con los de test.** Los intentos improvisados no tienen WAV (no se graban). Los números salen luego de este archivo por separado, en el informe.

---

## 9. WAV para Whisper

El benchmark de Whisper (parte 2) usa los clips de **test**, **silencio** y **ruido**. Los de dev no hacen falta.

**Caso normal (la grabación en paralelo funcionó):** ya están en `spike\recordings\`, con el nombre que les puso el arnés. **No los renombres:** el nombre dice la frase, la condición y la repetición (`p05-01_quiet_r1.wav`, `p05-01_noisy_r2.wav`, `trial_silence_r3.wav`, `trial_noise_r3.wav`). Si Chrome los dejó en otra carpeta (Descargas), muévelos a `spike\recordings\` sin renombrar:

```powershell
Move-Item "$env:USERPROFILE\Downloads\*.wav" spike\recordings\
```

**Si Web Speech y la grabación no convivieron:** después de las tandas 3 a 6, haz este paso aparte:

1. Elige la carpeta con **Elegir carpeta para los WAV…** (`spike\recordings`). Deja marcado **Grabar WAV en paralelo**.
2. Marca **Solo grabar (sin Web Speech)**. Recorre los bloques **Test · ambiente tranquilo**, **Test · con ruido de fondo** (con el mismo ruido), **Silencio** y **Ruido** diciendo las mismas frases. Esto no crea intentos ni modifica los JSON.
3. Son 116 clips más (48 + 48 + 10 + 10).
4. Al terminar, desmarca **Solo grabar**.

(En este caso el audio no es el mismo que oyó Web Speech: Whisper se compara con las mismas frases, no con el mismo audio. Se anota en el informe.)

Cuando termines cualquiera de estos pasos, copia `spike\recordings\` a un lugar seguro.

---

## 10. Calcular los resultados (después de las tandas 3 a 6)

Cambia los nombres por los reales de tus archivos (en PowerShell los comodines no se expanden):

```powershell
pnpm metrics spike/results/2026-11-01-webspeech-test-quiet.json spike/results/2026-11-01-webspeech-test-noisy.json spike/results/2026-11-01-webspeech-nonspeech.json
```

Revisa la salida. Si todo está bien, el mismo comando con `--write-results` escribe el informe en `docs/spike-results.md`. Este paso lo hacemos juntos.

---

## 11. Si algo falla

| Síntoma | Qué hacer |
|---|---|
| «Este navegador no tiene Web Speech API» | Usa Chrome en `http://127.0.0.1:5500/spike/web-speech/index.html`, no abriendo el archivo con doble clic |
| No aparece «Escuchando» | Candado de la barra de direcciones → permitir micrófono |
| Resultados siempre vacíos | Sin internet, o idioma no soportado. Prueba `es-ES` o `es-MX` y **dímelo**: cambiar de idioma entre bloques invalida la comparación |
| La página se recarga sola | Live Server vio un cambio de archivo; no guardes nada del repo durante la sesión |
| Perdiste la pestaña | Reabre la dirección: la sesión se restaura desde el navegador |
| Te equivocaste de frase | **Descartar último intento** y repite |
| Chrome no deja elegir la carpeta | Evita elegir Escritorio, Documentos o Descargas directamente; usa la subcarpeta `spike\recordings` |
