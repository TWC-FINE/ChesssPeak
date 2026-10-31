# Spike de voz — notas

Observaciones que **no** son resultados ni cambian los criterios ([spike-criteria.md](spike-criteria.md), v1). Nada de lo que está aquí se ha arreglado: el parser (`packages/voice-parser`) y el corpus están **congelados** mientras se mide.

## 1. Límites de la medición de Whisper

1. **La latencia de Whisper del benchmark es optimista.** El benchmark manda clips ya grabados a `whisper-server` y mide solo la inferencia (ida y vuelta al servidor local) más el parser. **Excluye** la grabación del audio y el transporte HTTP desde el navegador al agente (`POST /transcribe`), que en uso real se suman. No es comparable 1 a 1 con la latencia de Web Speech (que mide desde que se suelta el botón hasta el resultado). Para la decisión sobre latencia hay que medir también de punta a punta (navegador → agente → Whisper) antes de dar por buena una cifra.
2. **No se prueba el acceso desde un origen público** (por ejemplo, la web en Vercel llamando a `http://127.0.0.1:8765`). Eso depende del permiso de red local de Chrome (Private Network Access / «Local Network Access»), que concede la persona usuaria en el navegador y cambia entre versiones. Lo único verificado es `http://127.0.0.1:5500` y `http://localhost:5500` → `http://127.0.0.1:8765`, con Chrome sin interfaz en esta máquina. El agente ya responde `Access-Control-Allow-Private-Network: true` al preflight que lo pide, pero **no se ha probado con un origen público real**. La demo debe hacerse desde Live Server; si se quiere servir desde Vercel, hay que ensayarlo antes.
3. La compatibilidad de **grabar el WAV a la vez que Web Speech** en el Chrome de la persona que mide sigue sin verificarse (depende de su equipo). Ver `spike/README.md`, sección 2.

## 2. Puerta de volumen y duración

Fijada **antes** de medir: duración ≥ 300 ms y volumen RMS ≥ -50 dBFS (RMS de todo el clip). **No se cambia.** Si no funciona (por ejemplo, frena habla real por quedar muy bajo, o deja pasar ruido que Whisper convierte en texto), se anota aquí con los datos, sin tocar los valores:

_Sin observaciones todavía._

## 3. Fallos del parser anotados (no arreglados)

Descubiertos al pasar texto de Whisper por el parser congelado, con voz sintética de Windows (Helena, es-ES), **no** con voz real; son una pista de qué mirar, no una medición.

| Texto de Whisper | Resultado del parser (posición inicial) | Qué esperaba |
|---|---|---|
| `Peone, cuatro.` / `peone 4` | `ambiguous`: a4 / b4 / c4 | `e2e4`. Whisper fundió «peón» y «e» en una sola palabra («peone»); el parser la trata como «peón» mal dicho y ya no ve la columna |
| `Caballó F3.` | `move g1f3` ✔ | — |
| `[Música]`, `[SILENCIO]` | `nomatch` ✔ | — |

Notas:
- Whisper escribe etiquetas como `[Música]` o `[SILENCIO]` para el ruido; el parser las rechaza bien.
- Posible causa a revisar **después de la decisión**: una palabra desconocida pegada a «peón» podría ser «peón + letra». No se toca ahora.

## 4. Observaciones informales (no son evidencia)

Hechas con **clips sintéticos** (voz de Windows y ruido generado, archivos `*.fake.*`, fuera de `spike/recordings/`) solo para comprobar el flujo; no cuentan para ninguna decisión.

- **Latencia de inferencia, orden de magnitud en esta laptop (CPU, clips de ~2 s):** `base` ≈ 1,1–1,3 s; `small` ≈ 3,8–4,5 s. Si esto se confirma con clips reales, `small` no cumpliría p50 ≤ 1,5 s en esta máquina aunque acierte más. Se decide con las mediciones reales.
- El clip de **silencio digital** lo frena la puerta (`too-quiet`). El **ruido blanco** a bajo volumen pasa la puerta y llega a Whisper, que respondió `[Música]` / `[SILENCIO]`; ninguna jugada fue aceptada.
- Con el prompt de ajedrez, Whisper escribió «Caballo efe tres» donde sin prompt escribió «Caballó F3»; con voz sintética y una sola frase, no se puede concluir nada.

## 5. Notas técnicas

- El zip oficial `whisper-bin-x64.zip` de la versión `b5454` **sí** incluye `whisper-server.exe` (en `Release/`, junto a sus DLL: hay que ejecutarlo con esa carpeta como directorio de trabajo). Los tags `v1.9.x` de whisper.cpp no traen binarios; están en los tags `bNNNN`.
- El `tar` de Git Bash (GNU) falla con rutas `D:\…`; el script de descarga usa el `tar.exe` de Windows.
- `whisper-server` recibe el prompt al arrancar (`--prompt`); el benchmark lanza un proceso por configuración (modelo × prompt) en vez de depender de un prompt por petición.
