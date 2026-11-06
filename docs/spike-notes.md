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

**Con voz real y Web Speech (medición de `test`, 1 nov 2026; nada se arregló).** Complemento de los 34 fallos de 78; lo que dijo el hablante → lo que escribió Web Speech → qué hizo el parser:

| Patrón | Casos | Ejemplo | ¿Podría ayudar el parser? |
|---|---|---|---|
| «toma» + letra fundidos en una palabra | 5 (todos en `p09`) | «be siete toma ce ocho corona a dama» → `B 7 tomase 8 corona a dama.` / `tomarse` / `thomase` → `nomatch` (d=1,30) | Sí: «tomase», «tomarse» = «toma» + «ce/se». Candidato a revisar después de la decisión |
| «alfil» partido en dos palabras | 2 | `Al fin toma F 3.`, `Al FIL tomarse 3.` | Posible (alias «al fin», «al fil») |
| Texto truncado al final | 8 | `Caballo b cu.`, `En Roque cor.`, `Torre F.`, `Torrea de.`, `…corona ator.` | No: falta información |
| Letra omitida o palabra mal oída | 4 | `Peon cuatro.` (sin la «e», 2 veces) → `ambiguous` a4/b4/g4; `Torre F t 1.`; `B 7 toma hace 8 corona torre.` | No |
| Texto sin relación con lo dicho (todos con ruido) | 12 | `Thor.`, `¿Dónde?` (3 de 3 en «peón de cinco» con ruido), `Zorra.`, `Jorge 1.` | No |
| Sin texto del reconocedor | 2 | `(vacío)` | No |
| **Aceptación errónea (1)** | 1 | «caballo be cuatro» (ruido) → `Caballo de cuatro.` → jugada `Nd4` (d=0,00) | «de» es un alias válido de la letra d; no es un error del parser |

- Con texto sin relación (`Thor.`, `¿Dónde?`), el parser devolvió `ambiguous` entre los dos enroques (O-O-O/O-O) en 3 casos. No se aceptó nada, pero conviene mirar por qué un texto así produce candidatos con margen pequeño.
- El N-best no cambió ningún resultado (ganancia 0,0 puntos).

Notas:
- Whisper escribe etiquetas como `[Música]` o `[SILENCIO]` para el ruido; el parser las rechaza bien.
- Posible causa a revisar **después de la decisión**: una palabra desconocida pegada a «peón» podría ser «peón + letra». No se toca ahora.

## 4. Observaciones informales (no son evidencia)

Hechas con **clips sintéticos** (voz de Windows y ruido generado, archivos `*.fake.*`, fuera de `spike/recordings/`) solo para comprobar el flujo; no cuentan para ninguna decisión.

- **Latencia de inferencia, orden de magnitud en esta laptop (CPU, clips de ~2 s):** `base` ≈ 1,1–1,3 s; `small` ≈ 3,8–4,5 s. Si esto se confirma con clips reales, `small` no cumpliría p50 ≤ 1,5 s en esta máquina aunque acierte más. Se decide con las mediciones reales.
- El clip de **silencio digital** lo frena la puerta (`too-quiet`). El **ruido blanco** a bajo volumen pasa la puerta y llega a Whisper, que respondió `[Música]` / `[SILENCIO]`; ninguna jugada fue aceptada.
- Con el prompt de ajedrez, Whisper escribió «Caballo efe tres» donde sin prompt escribió «Caballó F3»; con voz sintética y una sola frase, no se puede concluir nada.

## 4 bis. Navegador de las mediciones de Web Speech

- Todas las mediciones de Web Speech (dev, test tranquilo, test con ruido, silencio, solo ruido e improvisadas) se hicieron en **Microsoft Edge 156.0.0.0**, según el `userAgent` de los seis JSON. El reconocedor es el de Microsoft.
- **PLAN.md asume Chrome** (reconocedor de Google) para la demo y como reconocedor por defecto. **Chrome no se midió**, así que el resultado es válido para Edge y no se sabe si se repetiría en Chrome.
- La guía (`spike/GUIA-RAPIDA.md`) pedía Chrome; no se detectó hasta revisar los `userAgent`.
- Pendiente tras la decisión: decidir si se mide también en Chrome (con las mismas frases, si el parser no cambia) y actualizar PLAN.md. No se toca ahora.

## 5. Tareas para la Fase 0

- **Decidir qué builds se permiten en `pnpm-workspace.yaml` antes de montar el CI.** Al clonar el repo en un equipo nuevo (1 nov 2026, pnpm 12.16.1 instalado con `npm i -g`), `pnpm install` instala las 44 dependencias pero termina con código de salida 1 y `ERR_PNPM_IGNORED_BUILDS` (`esbuild@0.28.2`): pnpm 12 bloquea por defecto los scripts de instalación. No impidió nada (esbuild funciona sin su script; el build del spike y los 119 tests pasan), pero un CI que mire el código de salida fallaría. No se arregló ni se ejecutó `pnpm approve-builds`.
- `corepack enable` falla con EPERM sin permisos de administrador (intenta escribir en `C:\Program Files\nodejs`); se usó `npm i -g pnpm@12.16.1`, la versión de `packageManager`.

## 6. Notas técnicas

- El zip oficial `whisper-bin-x64.zip` de la versión `b5454` **sí** incluye `whisper-server.exe` (en `Release/`, junto a sus DLL: hay que ejecutarlo con esa carpeta como directorio de trabajo). Los tags `v1.9.x` de whisper.cpp no traen binarios; están en los tags `bNNNN`.
- El `tar` de Git Bash (GNU) falla con rutas `D:\…`; el script de descarga usa el `tar.exe` de Windows.
- `whisper-server` recibe el prompt al arrancar (`--prompt`); el benchmark lanza un proceso por configuración (modelo × prompt) en vez de depender de un prompt por petición.

## 7. Tareas que deja el spike

Agrupadas por **área**, no por fase: [PLAN.md](../PLAN.md) (sección 9) decide en qué fase y semana se hace cada una. Decisión y datos: [spike-results.md](spike-results.md), [spike-run-b.md](spike-run-b.md) y los ADR [4](adr/0004-resolucion-contra-jugadas-legales.md) y [5](adr/0005-strategy-y-reconocedor-por-defecto.md).

### Agente local (`local-agent`)
- [ ] **Prompt de ajedrez.** Arrancar `whisper-server` con el prompt de `spike/whisper-local/src/prompt.ts` (`--prompt`): sin él, `small` baja de 89,7 % a 61,5 %. Modelo `small` por defecto.
- [ ] **Puerta de volumen y duración.** Duración ≥ 300 ms y RMS ≥ −50 dBFS antes de transcribir; en el spike frenó 10 de los 20 clips sin habla y ninguno acabó en jugada. No se ajusta con el `test` (sección 2).
- [ ] **Instalación de Whisper en un solo comando.** Un script (hoy `pnpm --filter @chessspeak/spike-whisper-local download` más editar `.env`) que descargue y verifique el binario y el modelo `small`, deje las rutas en `.env` y arranque el agente local, sin pasos manuales. El proyecto se presenta terminado en el equipo de cualquiera de los dos o del profesor, así que no puede depender de una instalación a mano.
- [ ] **Medir la latencia de extremo a extremo** (navegador → agente → Whisper), porque la del benchmark es solo inferencia.

### Producto (voz e interfaz)
- [ ] **Retardo de 400 ms.** En el adaptador Web Speech de `<mf-voice-input>`, esperar 400 ms tras soltar el botón antes de llamar a `stop()` y medir la latencia desde que se suelta. Es un requisito, no un parámetro de prueba (ADR 5).
- [ ] **Confirmación explícita obligatoria** con cualquier reconocedor.
- [ ] **Declarar la latencia de Whisper** en la interfaz y en la documentación: p50 2,91 s y p95 3,06 s solo de inferencia, en el equipo de la sección 8.
- [ ] **Avisar en navegadores sin Web Speech (Firefox).** Detectar que `SpeechRecognition` no existe y mostrar un aviso claro, ofreciendo Whisper local (si el agente responde) o la caja de texto de respaldo. Lo mismo, con aviso de «recomendado Edge», si la comprobación de [spike-chrome.md](spike-chrome.md) no cumple en Chrome.
- [ ] **Validación con otra voz, frases nuevas y otro equipo** en la sesión de evaluación de la semana 4, sin tocar los umbrales de `spike-criteria.md`.
- [ ] **Prueba en Chrome**, según [spike-chrome.md](spike-chrome.md) (pendiente; todo se midió en Edge 156). Se hace el mar 3 por la mañana, **después de subir todo y respaldar los WAV**.
- [ ] **Posible corrida nueva declarada** con un modelo `small` cuantizado para bajar la latencia de Whisper: se declara antes de medir, con su propia regla de lectura.
- [ ] **Lote único de mejoras del parser** (alias para «toma» fundido con la letra, «alfil» partido en dos palabras, «peone»; sección 3), antes de la validación de la semana 4. Las cifras del spike son de la versión `spike-parser-freeze`; la validación usa frases nuevas y **registra el hash del parser usado**. El responsable se asigna el lun 9.

### CI y entrega
- [x] **`protocolVersion` en `GET /health`** cuando se fusione el contrato v0 (PR #3). La rama de la capa de datos no lo incluye a propósito: ese campo se añadió en el contrato y hay que reincorporarlo al fusionar. Al fusionar también hay que **alinear** los valores de `result` y `termination` del CHECK de `games` (migración `*_games_checks`, ADR 3) con los del contrato si cambiaron en la revisión.
- [ ] **`pnpm approve-builds` / `ERR_PNPM_IGNORED_BUILDS`.** Decidir qué builds se permiten en `pnpm-workspace.yaml` (hoy, `esbuild@0.28.2`) para que `pnpm install` termine con código 0 antes de montar el CI (ver sección 5), y explicarlo en el README.
- [x] **Actualizar PLAN.md** con el spike cerrado, la decisión y que no hay demo en vivo (hecho el 2 de noviembre de 2026).
- [ ] **`pnpm serve:web`:** servidor estático de Node, sin dependencias, en `127.0.0.1:5500`, para equipos sin VS Code (Fase 0 o Fase 3; el plan lo pone el mié 4).
- [ ] **Web pública en Vercel** (núcleo, no opcional): es la forma más portable de presentar. Desde una página pública, Whisper local puede bloquearse por el acceso a red local del navegador y además requiere instalar el agente; ensayarlo en Edge y en Chrome y documentarlo en el README.
- [ ] **Probar el README en una máquina limpia antes de entregar:** clonar, `pnpm install`, `.env`, instalación de Whisper y arranque, abriendo la app en Edge y en Chrome, siguiendo solo lo que dice el README. No hay demo en vivo: el README es lo que usa quien evalúa.
- [ ] Copia de seguridad fuera del repo de `spike/recordings/` (116 WAV, 10 774 256 bytes) y de `spike/results/`.

## 8. Equipo de referencia de la latencia de Whisper

Las cifras de latencia de Whisper de [spike-run-b.md](spike-run-b.md) (`small` con prompt: p50 2,91 s, p95 3,06 s; `base`: 0,83 s / 0,92 s) se midieron el 2 de noviembre de 2026 en este equipo, que es la referencia:

| Componente | Valor |
|---|---|
| CPU | Intel Core i5-12400F (12.ª generación) |
| Núcleos / hilos | 6 núcleos / 12 hilos (reloj base 2,5 GHz según Windows) |
| RAM | 15,8 GB (16 GB) |
| Placa | Gigabyte Z690 AORUS ELITE AX DDR4 |
| GPU | AMD Radeon RX 6700 XT (no se usó: el binario `whisper-bin-x64` b5454 infiere en CPU) |
| Sistema | Windows 10 Pro |

**En otros equipos la latencia será distinta.** Depende sobre todo de la CPU, los hilos y la carga de fondo (por ejemplo, el navegador y la partida abiertos); un equipo más lento o con menos núcleos tendrá más latencia con `small`, y uno más rápido, menos. Además, la cifra es solo inferencia (no incluye grabación ni transporte HTTP), así que la latencia real de extremo a extremo es mayor en cualquier equipo. Las cifras informales de la sección 4 se tomaron en otro equipo («esta laptop», según esa nota) con clips sintéticos y no son comparables con estas.

## Tareas pendientes

- [ ] Lint: el repo no tiene configuración de lint (ESLint u otro); el CI solo corre typecheck y pruebas. Definir una configuración y añadir un paso al trabajo `verify`.
