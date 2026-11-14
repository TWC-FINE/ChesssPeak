# Balanceo de carga de la transcripción de voz en ChessSpeak

> **Origen de las cifras:** una corrida por configuración el 4 de noviembre de 2026 y dos más el 5 de noviembre, todas en el equipo de desarrollo y con los mismos ajustes. Las del 5 se hicieron por la noche, hora local (UTC−5), así que sus archivos llevan la fecha UTC del 6. Los archivos están en [docs/evidence/load-balancing/](evidence/load-balancing/). Ninguna cifra está estimada ni redondeada a favor de una configuración. **Las secciones 6.1 a 6.4 describen solo el 4 de noviembre; la 6.5 añade las repeticiones y corrige la conclusión.**

## Resumen

ChessSpeak permite jugar ajedrez diciendo las jugadas en voz alta. Una de sus dos formas de reconocer la voz es **Whisper local**: el navegador envía un clip WAV a un agente en `127.0.0.1:8765`, que lo transcribe en la CPU de la propia máquina. Cada transcripción consume varios segundos de CPU y no guarda estado, así que es el proceso crítico que elegimos balancear.

**Límite que hay que tener presente:** en una partida real este balanceador ve **una petición a la vez**, porque los turnos alternan y cada jugador tiene su propio agente. Las escaleras de carga de este documento son **sintéticas**. Por eso `LB_WORKERS` vale 1 por defecto. El caso con carga natural que se evaluó, un análisis post-partida con Stockfish, no pasó su prueba: [analysis-gate.md](analysis-gate.md). **No está confirmado que este balanceador cumpla por sí solo el requisito:** ver la [revisión del ADR 10](adr/0010-balanceo-de-carga-en-local-agent.md#revisión-del-5-de-noviembre). **Desde el 14 de noviembre la decisión vigente es el [ADR 12](adr/0012-whisper-como-servicio-con-pool-por-urls.md):** Whisper como servicio, balanceado por URLs. Ver la [sección 9](#9-modo-por-urls-con-contenedores-adr-12). El ADR 11 quedó sustituido.

Comparamos dos configuraciones con los mismos 12 hilos de CPU y la misma cola:

- un **monolito**, con un solo proceso `whisper-server` de 12 hilos;
- una versión **balanceada**, con tres procesos de 4 hilos detrás de un balanceador de **conexiones mínimas**.

Las subimos de carga por escalones hasta su punto de quiebre (más de un 5 % de respuestas fallidas).

**Qué encontramos** (detalle en la sección 6.5):

- **El balanceo es un requisito del curso, no una mejora demostrada. No se demostró mejora de rendimiento.** Con 4 simultáneas, el balanceado rindió un 4–5 % más el 5 de noviembre. El ≈ 24 % medido el 4 de noviembre no se repitió, y la diferencia entre esos dos días, en el mismo equipo, es mayor que ese efecto.
- **El beneficio medido es la tolerancia a fallos** (sección 7): si cae un worker, el servicio sigue. La velocidad no lo es.
- **Con 4 simultáneas**, la mediana mejora un 27–28 %, pero el p95 empeora un 40–42 %.
- **Con 1 petición**, que es el caso real de una partida, el balanceado es un 57–60 % más lento.
- **Con 2 simultáneas** ya no mejora la mediana: el 4 de noviembre fue un 12 % mejor y el 5 de noviembre un 5–6 % peor.
- **Ambas configuraciones fallan con 8 simultáneas** por tiempo de espera (504) en las tres corridas. Lo que limita es el tiempo máximo de 15 s y el ritmo de la CPU, no la forma del agente.

## 1. Qué se balancea y por qué

El servidor de partidas (NestJS) no es un buen candidato:

- sus operaciones son baratas;
- la partida vive en memoria y cada jugador mantiene un socket abierto;
- replicarlo exigiría sesiones pegajosas y un almacén compartido (Redis), y el plan gratuito de Render da una sola instancia.

La transcripción con Whisper es lo contrario: cara (p50 de 2,91 s solo de inferencia con el modelo `small`, medido en el spike) y sin estado entre peticiones. La decisión está en el [ADR 10](adr/0010-balanceo-de-carga-en-local-agent.md).

## 2. Implementación

| Pieza | Elección |
|---|---|
| Lenguaje y entorno | TypeScript estricto sobre Node.js 24, módulo `http` nativo, sin dependencias de terceros |
| Motor de transcripción | `whisper.cpp` (binario `whisper-server` b5454 para CPU), modelo `small` con prompt de vocabulario de ajedrez |
| Instancias | Procesos `whisper-server` en la misma máquina, puertos 8801, 8802… (`LB_WORKERS`) |
| Algoritmo | Conexiones mínimas; en empate, rotación. Turno rotativo disponible para comparar |
| Capacidad | Una petición en curso por worker; cola común de `LB_QUEUE_MAX`; 503 con la cola llena; 504 a los 15 s |
| Salud | `GET /health` de cada worker cada segundo; fuera de rotación tras 3 fallos o si su proceso termina; reinicio con espera creciente de 1 s a 30 s |
| Monitoreo | Cabecera `X-Worker`, `GET /lb/stats`, Server-Sent Events en `GET /lb/events` y dashboard en `GET /lb/dashboard` |

```
navegador ──HTTP──► local-agent :8765 (gateway · cola · conexiones mínimas · monitor)
                        ├─► whisper-server w1 :8801
                        ├─► whisper-server w2 :8802
                        └─► whisper-server w3 :8803
```

**Por qué conexiones mínimas.** Las peticiones duran segundos y su duración varía con la del clip, así que importa quién está libre ahora. IP hash no sirve porque todas las peticiones llegan desde `127.0.0.1`. Las variantes ponderadas se justifican con instancias desiguales, y aquí son idénticas.

**Precisión.** El pool solo ofrece a la estrategia workers libres, con una petición por worker. Con este código, conexiones mínimas y turno rotativo se comportan como una cola común con el siguiente worker libre, y solo cambia el orden entre los libres. Por eso estas corridas no comparan algoritmos.

## 3. Equipo de pruebas

Datos del bloque `environment` de los dos JSON (coinciden en ambas corridas, salvo la RAM libre):

| Característica | Valor |
|---|---|
| CPU | 12th Gen Intel(R) Core(TM) i5-12400F |
| Hilos lógicos | 12 |
| RAM total | 16 222 MB |
| RAM libre al empezar | 4 188 MB (monolito) · 3 367 MB (balanceado), con el agente ya cargado |
| Sistema operativo | Windows 10, versión 10.0.19045, x64 |
| Node.js | v24.20.0 |
| Motor | `whisper-server` b5454 (solo CPU), modelo `small` con el prompt de ajedrez |

Es el equipo de desarrollo, el mismo del spike. **No se comprobó que sea el de menores prestaciones del grupo**, que es el que pidió el profesor: ver la sección 8.

## 4. Metodología

- **Generador de carga:** `pnpm --filter @chessspeak/local-agent load` ([scripts/load.ts](../local-agent/scripts/load.ts)).
  - Envía siempre el mismo WAV (`spike/recordings/p05-01_quiet_r1_runB.wav`, una frase real del spike).
  - Usa escalones de 1, 2, 4, 8 y 16 peticiones simultáneas, con 20 peticiones cada uno. En cada escalón hay exactamente N peticiones en vuelo hasta la última.
  - La corrida se detiene en el primer escalón caído: **en ninguna de las dos se ejecutó el de 16**.
- **Calentamiento:** una petición por worker antes del primer escalón, que no cuenta.
- **Entre escalones:** se espera a que el agente quede sin cola ni peticiones en curso, para que un escalón no contamine al siguiente.
- **Configuraciones comparadas:** el mismo total de hilos (12) y la misma cola (12):
  - **monolito:** `LB_WORKERS=1`, 12 hilos;
  - **balanceado:** `LB_WORKERS=3`, 4 hilos cada uno.
- **Métricas por escalón:**
  - peticiones por segundo totales y con respuesta 200;
  - p50 y p95 de la latencia de las respuestas 200 (percentil nearest-rank, el mismo del spike);
  - conteo de 200, 503 y 504.
- **Criterio de caída**, fijado antes de medir: un escalón con más del **5 %** de respuestas distintas de 200 es el punto de quiebre y detiene la corrida.

## 5. Cómo reproducirlo

```powershell
# terminal 1: monolito
$env:LB_WORKERS=1; $env:LB_QUEUE_MAX=12; pnpm --filter @chessspeak/local-agent start
# terminal 2
pnpm --filter @chessspeak/local-agent load --label monolito

# terminal 1: balanceado
$env:LB_WORKERS=3; $env:LB_QUEUE_MAX=12; pnpm --filter @chessspeak/local-agent start
# terminal 2
pnpm --filter @chessspeak/local-agent load --label balanceado
```

Cada corrida deja su reporte en `local-agent/results/load-<fecha>-<etiqueta>.json`. Esa carpeta no está en git. Las corridas citadas aquí se copiaron a `docs/evidence/load-balancing/`.

## 6. Resultados

Las secciones 6.1 a 6.4 son del **4 de noviembre**: se conservan como registro, y su conclusión está corregida en la 6.5. Datos del bloque `steps` de cada JSON, con 20 peticiones por escalón.

- **200/s:** respuestas correctas por segundo de pared del escalón. **Resp./s:** todas las respuestas, correctas o no.
- **p50 y p95** son de las respuestas 200: las que fallan por tiempo esperan 15 s y no dicen cuánto tarda una transcripción.
- **Éxito** es 200 entre las 20 peticiones del escalón.
- «No ejecutado»: la corrida se detuvo en el escalón de 8, el primero caído.

### 6.1 Monolito (1 worker × 12 hilos, cola 12)

| Simultáneas | 200/s | Resp./s | p50 | p95 | Éxito | 200 | 503 | 504 |
|---|---|---|---|---|---|---|---|---|
| 1 | 0,36 | 0,36 | 2,76 s | 2,86 s | 100 % | 20 | 0 | 0 |
| 2 | 0,37 | 0,37 | 5,46 s | 5,62 s | 100 % | 20 | 0 | 0 |
| 4 | 0,37 | 0,37 | 10,90 s | 11,27 s | 100 % | 20 | 0 | 0 |
| 8 | 0,12 | 0,49 | 7,94 s | 13,33 s | **25 %** | 5 | 0 | **15** |
| 16 | no ejecutado | | | | | | | |

### 6.2 Balanceado (3 workers × 4 hilos, cola 12, conexiones mínimas)

| Simultáneas | 200/s | Resp./s | p50 | p95 | Éxito | 200 | 503 | 504 | Reparto (w1/w2/w3) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 0,24 | 0,24 | 4,20 s | 4,93 s | 100 % | 20 | 0 | 0 | 7 / 7 / 6 |
| 2 | 0,42 | 0,42 | 4,78 s | 4,94 s | 100 % | 20 | 0 | 0 | 10 / 1 / 9 |
| 4 | 0,45 | 0,45 | 6,75 s | 12,98 s | 100 % | 20 | 0 | 0 | 6 / 7 / 7 |
| 8 | 0,19 | 0,48 | 12,99 s | 13,42 s | **40 %** | 8 | 0 | **12** | 4 / 2 / 2 |
| 16 | no ejecutado | | | | | | | | |

Los contadores del propio agente coinciden con los del cliente: 66 respuestas 200 y 15 × 504 en el monolito, y 71 y 12 en el balanceado (contando también las del calentamiento). Ningún worker se reinició durante las corridas.

### 6.3 Comparativa

| | Monolito | Balanceado |
|---|---|---|
| Máximo estable (simultáneas) | 4 | 4 |
| Punto de quiebre (simultáneas) | 8 | 8 |
| Mejor rendimiento (200/s) | 0,37 (con 2 y con 4) | 0,45 (con 4) |
| p50 en el último escalón estable (4) | 10,90 s | 6,75 s |
| p95 en el último escalón estable (4) | 11,27 s | 12,98 s |
| Éxito en el escalón de quiebre (8) | 25 % (5 de 20) | 40 % (8 de 20) |

Diferencia del balanceado respecto al monolito, calculada con los valores sin redondear de los JSON:

| Simultáneas | p50 | p95 | Media | 200/s |
|---|---|---|---|---|
| 1 | +52 % | +72 % | +50 % | −33 % |
| 2 | −12 % | −12 % | −10 % | +14 % |
| 4 | **−38 %** | **+15 %** | −18 % | **+24 %** |

Un porcentaje negativo en latencia es mejor para el balanceado; en 200/s, positivo es mejor. El escalón de 8 no se compara porque las dos configuraciones ya habían caído y sus latencias son de pocas respuestas.

### 6.4 Análisis del punto de quiebre

**Los dos se quiebran en 8 simultáneas, y por la misma razón.** En ninguna corrida apareció un 503: con 8 peticiones en vuelo caben todas entre los workers y los 12 puestos de la cola. Lo que falló fue el **tiempo máximo de espera de 15 s**, que se traduce en 504. Lo que se puede atender antes de los 15 s es, aproximadamente, el ritmo de transcripción multiplicado por esos 15 s.

- **Monolito:** 0,37 respuestas por segundo ≈ 5,4 peticiones en 15 s. Con 8 simultáneas hubo exactamente 5 respuestas 200 y 15 × 504.
- **Balanceado:** 0,45 por segundo ≈ 6,8 en 15 s. Con 8 simultáneas hubo 8 respuestas 200 y 12 × 504, algo más de lo que da la cuenta; no se investigó por qué.
- **La rejilla de escalones es gruesa** (4 → 8). El umbral real de cada configuración está entre 4 y 8, y el balanceado, con más ritmo, probablemente aguante algo más que el monolito. Estas corridas no pueden mostrarlo: habría que repetir con escalones intermedios (5, 6 y 7).
- **Los 503 no se midieron en las corridas oficiales.** Aparecen cuando las peticiones simultáneas superan los workers más la cola (13 en el monolito, 15 en el balanceado) y el primer escalón por encima es el de 16, que la corrida no alcanzó porque se detiene en el primero caído. Sí se observaron en la prueba aparte de la sección 7, con 20 simultáneas: respuesta inmediata con `Retry-After`.
- **Un 504 no libera al worker.** El cliente recibe el error a los 15 s, pero Whisper sigue transcribiendo esa petición. Por eso el generador espera a que el agente quede libre entre escalones.

**Rendimiento: no se multiplica, y la CPU es el límite.**

- En el monolito el rendimiento es plano desde la primera petición: 0,36, 0,37 y 0,37 respuestas por segundo con 1, 2 y 4 simultáneas. Un solo `whisper-server` con 12 hilos ya ocupa la CPU, así que más concurrencia solo alarga la espera. El p50 con 2 simultáneas es el doble que con 1 (5,46 s frente a 2,76 s) y con 4 es casi cuatro veces mayor: las peticiones se atienden una tras otra.
- El 4 de noviembre, el balanceado llegó a 0,45 respuestas correctas por segundo con 4 simultáneas, ≈ 24 % más que el monolito. **Esa diferencia no se repitió: ver la sección 6.5.** Los tres workers comparten los mismos 12 hilos.
- Hay un indicio de por qué mejora algo. Una petición sola tarda 2,76 s con 12 hilos y 4,20 s con 4 hilos: triplicar los hilos acelera una transcripción solo 1,5 veces. Esa escala sublineal sugiere que repartir los hilos entre varios procesos se aprovecha algo mejor que dárselos todos a uno. Es una explicación plausible; no se probó de forma aislada.

**Latencia bajo concurrencia: mejora la mediana, no la cola.**

- Con **2 y 4 simultáneas** el balanceado mejora la mediana (−12 % y −38 %) y la media (−10 % y −18 %): las peticiones se atienden en paralelo en lugar de en fila.
- Con **1 simultánea** es peor: +52 % en la mediana. Una sola petición solo puede usar los 4 hilos de un worker y deja el resto de la CPU sin usar. Es el precio de repartir los hilos.
- Con **4 simultáneas** el p95 es 15 % peor (12,98 s frente a 11,27 s). Hay 4 peticiones para 3 workers, así que una espera a que termine otra y luego se atiende ella: el tiempo de espera más un servicio completo. La media mejora, pero la petición con mala suerte tarda más.
- El reparto es casi uniforme con 4 simultáneas (6 / 7 / 7). Con 2 fue desigual (10 / 1 / 9): sobra siempre un worker, de modo que no afectó a la latencia; no se investigó por qué w2 quedó al margen.

**Conclusión.** La que había aquí, basada en una sola corrida, sostenía ≈ 24 % más de rendimiento y ya no vale. La vigente está en la sección 6.5.

### 6.5 Repeticiones del 5 de noviembre y conclusión vigente

Dos repeticiones nuevas por configuración, con el mismo equipo, los mismos ajustes y el mismo clip que el 4 de noviembre. El monolito y el balanceado se comparan dentro de cada fila.

| Fecha | Simultáneas | p50 monolito | p50 balanceado | p95 monolito | p95 balanceado | Correctas/s monolito | Correctas/s balanceado |
|---|---|---|---|---|---|---|---|
| 4 nov | 1 | 2,76 s | 4,20 s | 2,86 s | 4,93 s | 0,36 | 0,24 |
| 4 nov | 2 | 5,46 s | 4,78 s | 5,62 s | 4,94 s | 0,37 | 0,42 |
| 4 nov | 4 | 10,90 s | 6,75 s | 11,27 s | 12,98 s | 0,37 | 0,45 |
| 4 nov | 8 | 7,94 s | 12,99 s | 13,33 s | 13,42 s | 0,12 (5 de 20) | 0,19 (8 de 20) |
| 5 nov (rep. 2) | 1 | 1,96 s | 3,08 s | 2,10 s | 3,14 s | 0,50 | 0,32 |
| 5 nov (rep. 2) | 2 | 3,88 s | 4,08 s | 4,21 s | 4,17 s | 0,50 | 0,49 |
| 5 nov (rep. 2) | 4 | 7,84 s | 5,76 s | 8,07 s | 11,48 s | 0,51 | 0,53 |
| 5 nov (rep. 2) | 8 | 7,74 s | 12,34 s | 13,56 s | 14,29 s | 0,19 (7 de 20) | 0,26 (10 de 20) |
| 5 nov (rep. 3) | 1 | 1,95 s | 3,12 s | 1,99 s | 3,27 s | 0,51 | 0,32 |
| 5 nov (rep. 3) | 2 | 3,87 s | 4,11 s | 3,90 s | 4,35 s | 0,52 | 0,48 |
| 5 nov (rep. 3) | 4 | 7,74 s | 5,54 s | 7,77 s | 10,89 s | 0,52 | 0,54 |
| 5 nov (rep. 3) | 8 | 7,75 s | 11,07 s | 13,56 s | 14,65 s | 0,19 (7 de 20) | 0,30 (11 de 20) |

- **Correctas/s** son las respuestas 200 entre la duración del escalón.
- **p50 y p95** son de las respuestas 200. En el escalón de 8 hay pocas, porque las demás fallaron.
- **El escalón de 16** no se ejecutó en ninguna corrida: cada una se detiene en el primer escalón caído.

**Archivos de origen**, en [docs/evidence/load-balancing/](evidence/load-balancing/), con su hash SHA-256 en `SHA256SUMS`:

- **4 nov:** `load-2026-11-04T18-43-34-563Z-monolito.json` y `load-2026-11-04T18-47-15-289Z-balanceado.json`
- **5 nov (rep. 2):** `load-2026-11-06T03-00-18-944Z-rep2-monolito.json` y `load-2026-11-06T03-03-06-605Z-rep2-balanceado.json`
- **5 nov (rep. 3):** `load-2026-11-06T03-06-18-722Z-rep3-monolito.json` y `load-2026-11-06T03-09-03-404Z-rep3-balanceado.json`

**RAM libre al empezar**, según esos archivos (monolito y balanceado), con el agente ya cargado: 4 nov: 4188 y 3367 MB · 5 nov (rep. 2): 4587 y 6676 MB · 5 nov (rep. 3): 7799 y 6699 MB.

**Conclusión vigente.**

1. **No se demostró mejora de rendimiento.** Con 4 simultáneas, el balanceado rindió un 4–5 % más el 5 de noviembre, no el ≈ 24 % del 4 de noviembre. Entre esos dos días, en el mismo equipo y con la misma configuración, las correctas por segundo subieron un 39–41 % en el monolito y un 16–19 % en el balanceado. Esa diferencia es mayor que el efecto que se quería medir.
2. **Lo que se observó, en conjunto:**
   - Con 4 simultáneas, la mediana mejora un 27–28 %, pero el p95 empeora un 40–42 %.
   - Con 1 petición, el balanceado es un 57–60 % más lento. **Ese es el caso real de una partida.**
   - Con 2 simultáneas ya no mejora la mediana: el 4 de noviembre fue un 12 % mejor y el 5 de noviembre un 5–6 % peor.
   - Ambas configuraciones fallan con 8 simultáneas por tiempo de espera (504) y aguantan con 4, en las tres corridas.
3. **El balanceo se presenta como un requisito del curso.** Su beneficio medido es la tolerancia a fallos (sección 7), no la velocidad. A cambio ocupa unos 2 GB más de RAM y es más lento con una sola petición, y por eso `LB_WORKERS` vale 1 por defecto.

Las limitaciones de estas cifras están en la sección 8.

## 7. Tolerancia a fallos

Pruebas funcionales en el mismo equipo de la sección 3, en sesiones aparte de las corridas de carga, con 3 workers de 4 hilos y el modelo `small`. A diferencia de la sección 6, son observaciones puntuales, no una serie medida:

| Prueba | Resultado observado |
|---|---|
| Matar a la fuerza el `whisper-server` de w2 en reposo | w2 pasa a `down` al instante; las dos peticiones siguientes van a w1 y w3; tras 1 s de espera, w2 se relanza y carga el modelo; a los 5 s ya está activo con otro PID (`restarts: 1`) |
| Matar w1 desde el dashboard en mitad de una carga de 20 peticiones (5 rondas de 5) | **20 de 20 respuestas 200**, sin ningún 502: la petición que w1 tenía en curso se reintentó en otro worker. Reparto final 6 / 7 / 7; w1 volvió con otro PID |
| 20 peticiones simultáneas contra 3 workers con cola de 12 | 5 × 503 inmediatos (20 − 3 en curso − 12 en cola), 6 × 200 y 9 × 504 a los 15 s |
| Matar a la fuerza solo el proceso Node del agente | A los 3 s no queda ningún `whisper-server` ni proceso Node, y los puertos 8765 y 8801–8803 están libres |

**Ensayo de la demo con `LB_WORKERS=3` (5 de noviembre).** Una sola corrida en el mismo equipo: 15 peticiones, 3 simultáneas, matando w2 con `POST /lb/workers/w2/kill` mientras corría la carga. Archivos: `load-2026-11-06T03-12-14-706Z-demo-kill-w2.json` y `comparacion-y-ensayo-2026-11-05.txt`, en [docs/evidence/load-balancing/](evidence/load-balancing/).

| Observado | Resultado |
|---|---|
| Respuestas con un worker muerto | **15 de 15 correctas**, sin ningún 502, 503 ni 504 |
| Reparto | 5 / 5 / 5 |
| w2 | Volvió solo con otro PID (20388 → 29020), `restarts: 1` |
| Contadores de w2 | `served 6`, `failed 1` |

- **15 peticiones frente a 18 respuestas:** antes del escalón de 15 peticiones, el calentamiento envió otras 3 que no cuentan (`config.warmup: 3` en el JSON). El contador del agente pasó de 0 a 18 respuestas 200 (`agentTotals`). Por eso `served` suma 6 + 6 + 6, mientras que el reparto del escalón es 5 / 5 / 5. El JSON no registra a qué worker fue cada petición de calentamiento: que fuera una a cada uno se deduce de esa resta.
- **El `failed 1` de w2 probablemente corresponde a la petición en vuelo, reintentada en otro worker.** Se deduce del código y de los contadores; el agente no registra los reintentos uno por uno, así que no hay un registro directo de esa petición. `failed` solo aumenta cuando falla el envío a un worker (`local-agent/src/pool.ts:350`). Un error que no sea `TypeError` acaba en 502, y hubo 0. Tampoco hubo 504. Queda el caso `TypeError`, en el que el pool saca al worker y reintenta la petición una vez en otro (`pool.ts:352-358`), un comportamiento que cubre `local-agent/test/pool.test.ts:124`. Las cuentas encajan: 18 envíos correctos y 1 fallido son 19 intentos para 18 respuestas.
- **Coste:** con esta configuración, cada jugada con Whisper tarda unos 3,1 s en lugar de 1,95 s (p50 con 1 petición, sección 6.5).
- **Uso:** `LB_WORKERS=3` es solo para la demo del dashboard y de matar un worker. **El valor por defecto sigue siendo 1.**
- **Sin verificar:** del dashboard solo se comprobó que responde HTTP 200. No se comprobó cómo se ve, ni se usó su botón: el worker se mató con la llamada directa.

**El guardián IPC contra procesos huérfanos.**

- **El problema:** en la primera versión, detener el agente a la fuerza dejaba vivo el `whisper-server` ocupando su puerto. Ningún manejador de `exit` o `SIGTERM` se ejecuta cuando el sistema mata un proceso de golpe.
- **La solución:** cada `whisper-server` se lanza a través de un proceso Node mínimo, el guardián, unido al agente por un canal IPC. Si el agente muere de cualquier forma, el sistema operativo cierra el canal; el guardián recibe `disconnect` y mata a su `whisper-server`. Como respaldo, comprueba cada 500 ms si el agente sigue vivo.
- **Cobertura:** un test automático mata a la fuerza al proceso padre y comprueba que el hijo desaparece.
- **Reinicio sin conflicto:** el agente se niega a arrancar un worker en un puerto que ya responde, así que un huérfano de una ejecución anterior nunca se adopta como si fuera propio.

**Memoria.** Cada worker con `small` ocupa unos 580–700 MB de RSS según el sistema operativo. Con tres workers son unos 2 GB, a tener en cuenta en un equipo con poca RAM.

## 8. Limitaciones

- **El equipo no es necesariamente el de menores prestaciones.** El profesor pidió hacer la prueba en el peor equipo del grupo. Estas corridas se hicieron en el equipo de desarrollo (i5-12400F), y no se comparó con el del otro integrante. Si hay uno más débil, conviene repetirlas allí con los comandos de la sección 5: en una CPU con menos hilos el monolito se satura antes y la comparación puede cambiar.
- **Pocas repeticiones.** Son 3 corridas por configuración, 2 de ellas nuevas, y en días distintos no dieron lo mismo. No alcanzan para estimar la variación real.
- **Una sola máquina.** Todas las corridas son del mismo equipo.
- **Causa de la diferencia entre días, sin investigar.** La RAM libre era mayor el 5 de noviembre, pero eso no prueba que sea la causa.
- **Docker no se registró en ninguna corrida.** Unos 40 minutos después de las del 5 de noviembre, Docker no respondía; de las del 4 no consta nada. Desde ahora se apaga y se registra antes de medir.
- **Rejilla de escalones gruesa** (1, 2, 4, 8): el punto de quiebre exacto está entre 4 y 8 y no se pudo distinguir entre las dos configuraciones. El escalón de 16 no se ejecutó.
- Todas las instancias comparten la misma CPU y la misma RAM. Es un balanceo entre procesos de una máquina, no entre máquinas.
- Se mide un solo clip repetido. La latencia real varía con la duración de cada frase.
- La latencia medida es la de extremo a extremo del agente (cola + transcripción), sin la grabación ni la red del navegador.
- El reconocedor por defecto de la aplicación es Web Speech. Whisper, y por tanto este balanceo, es la alternativa local y exige instalar el agente.

## 9. Modo por URLs con contenedores (ADR 12)

Desde el 14 de noviembre, el mismo `local-agent` puede balancear workers que ya están en marcha en lugar de arrancar procesos. La decisión está en el [ADR 12](adr/0012-whisper-como-servicio-con-pool-por-urls.md). Las secciones 1 a 8 siguen describiendo el modo por procesos, que es el valor por defecto.

| Pieza | Modo por URLs |
|---|---|
| Instancias | Contenedores de la imagen [`whisper-cloud/Dockerfile`](../whisper-cloud/Dockerfile) (`small`, whisper.cpp `d1be6fd`), 3 en [`compose.local.yml`](../whisper-cloud/compose.local.yml), con 2 CPU y 2 GB cada uno, en `127.0.0.1:18101-18103` |
| Conexión | `WHISPER_URLS`. «Arrancar» un worker es sondear su `/health` hasta que responda, con un plazo (`LB_CONNECT_TIMEOUT_MS`) |
| Fallos | Un worker caído se detecta con los sondeos o con una petición fallida, que se reintenta una vez en otro worker. Tras `LB_RECONNECT_MAX` conexiones fallidas seguidas, deja de intentarlo |
| Demo de fallo | Aislar y devolver, desde el dashboard o con `POST /lb/workers/:id/isolate` y `/restore`. Devolver da otra ronda completa de reconexiones. «Matar» responde 409, porque no hay proceso propio |
| Fuera del equipo | Sondeo y reconexión como mucho cada 15 s, y solo https |

**Cómo arrancarlo:**

```bash
docker compose -f whisper-cloud/compose.local.yml up -d --no-build   # la imagen se construye la primera vez sin --no-build
WHISPER_URLS=http://127.0.0.1:18101,http://127.0.0.1:18102,http://127.0.0.1:18103 pnpm --filter @chessspeak/local-agent start
docker compose -f whisper-cloud/compose.local.yml down               # al terminar
```

**Medición de la fase C (14 de noviembre),** con el [criterio v1](url-pool-criteria.md) fijado antes de medir y la [evidencia](evidence/url-pool-phase-c/README.md). Se hizo con Docker encendido, las bases paradas y solo los 3 contenedores en marcha.

- **Aislamiento con concurrencia 2:** I1–I3 se cumplen en 3 de 3 repeticiones. Cada una tuvo 40 de 40 respuestas 200, y w2 no recibió nada nuevo después de aislarlo.
  - **Salvedad:** w2 no tenía ninguna petición en curso al aislarlo, así que «lo que tenía en curso termina» solo lo cubre el test unitario.
- **Medición informativa con concurrencia 4 y 3 workers:** aparecieron 504, como preveía el criterio, porque una petición siempre espera en cola. No tiene umbral, y sus cifras no son rendimiento.

**Límites:**

- Todo corrió en un solo equipo.
- Los contenedores comparten su CPU y su RAM.
- **AWS EC2 se midió el 14 de noviembre y se recortó:** C1 no cumple ([evidencia](evidence/whisper-cloud-ec2/README.md)).
