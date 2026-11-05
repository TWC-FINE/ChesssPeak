# Análisis post-partida — resultado de la prueba de viabilidad

**Decisión: NO PASA** según [analysis-criteria.md](analysis-criteria.md) v1. Medido el 5 de noviembre de 2026. Datos en `spike/analysis-gate/results/`.

**Aplicación de la regla:** el análisis no se construye, salvo que se decida explícitamente otra cosa con una versión nueva del criterio (sección 6).

## 1. Resultado frente a los umbrales

Profundidad 16 (calibrada: 53,2 s a profundidad 14 y 136,9 s a profundidad 16 en la partida de calibración). Partida de medición de 81 posiciones.

| Config. | Procesos × hilos | r1 | r2 | r3 | Mediana | p50 por posición | p95 por posición | RSS total máx. |
|---|---|---|---|---|---|---|---|---|
| C0 | 1 × 12 | 30,1 s | 34,0 s | 24,8 s | **30,1 s** | 0,2 s | 1,1 s | 1317 MB |
| C1 | 3 × 4 | 9,5 s | 11,6 s | 8,9 s | **9,5 s** | 0,3 s | 0,8 s | 1649 MB |
| C2 | 6 × 2 | 4,9 s | 3,7 s | 4,1 s | **4,1 s** | 0,2 s | 0,6 s | 2186 MB |

Mejor pool por tiempo: **C2**.

| Condición | Umbral | Resultado | ¿Cumple? |
|---|---|---|---|
| Reducción de tiempo | ≥ 30 % | 86,3 % | Sí |
| Sin solape | Sin solape | 4,9 s frente a 24,8 s | Sí |
| Calidad | ≤ 5 % difieren en más de 50 cp | 27 de 79 (34,2 %) | **No** |

## 2. El 86 % no es una ganancia real

Esta sección es un análisis posterior de los mismos datos. No cambia la decisión.

**A la misma profundidad nominal, las configuraciones no hacen la misma búsqueda.** Sumando el tiempo de cada búsqueda y multiplicando por sus hilos:

| Config. | Hilos-segundo por lote (mediana) |
|---|---|
| C0 | 361 |
| C1 | 108 |
| C2 | 46 |

C0 gasta unas 8 veces más CPU que C2 para la misma "profundidad 16", y su resultado es distinto: en la media jugada 80 ve un mate (10 000) donde C2 da +1887. Por eso C2 no es 86 % más rápido a igualdad de resultado: hace **menos trabajo y obtiene una evaluación más débil**. Esta prueba no mide cuánto tardaría cada configuración en llegar a la misma calidad.

**El criterio fijó la profundidad como presupuesto, y esa fue una mala elección de diseño.** Se hipotetizó que igual profundidad favorecería al pool. Lo que hace, en realidad, es comparar búsquedas de distinto tamaño.

## 3. Qué tan graves son las diferencias

También es posterior, y no autoriza a cambiar el umbral.

| Comparación con C0 (medianas) | C1 | C2 |
|---|---|---|
| Posiciones comparables | 75 | 79 |
| Difieren en más de 50 cp | 17 | 27 |
| De esas, en las primeras 40 medias jugadas | 0 | 0 |
| De esas, con ambas evaluaciones ≥ 300 cp y del mismo lado | 17 | 27 |
| De esas, con signo contrario | 0 | 0 |

En esta partida, ninguna diferencia cambia quién va ganando. Todas están en la fase en que las blancas ya ganan. Eso sale de **una sola partida, muy favorable a un bando al final**, y no se puede generalizar.

## 4. Ruido entre repeticiones de la misma configuración

| Config. | Parejas de repeticiones: difieren en más de 50 cp | Diferencia media |
|---|---|---|
| C0 | 2,8 %, 4,2 %, 2,8 % | 9,5–13,4 cp |
| C1 | 6,6 %, 6,5 %, 6,6 % | 15,3–17,4 cp |
| C2 | 8,9 %, 7,6 %, 11,4 % | 17,4–24,1 cp |

**El umbral del 5 % estaba cerca del ruido.** Dos repeticiones de C2 ya difieren entre sí más de lo que el umbral permite, aunque ese ruido se compara entre corridas sueltas y el umbral entre medianas. Aun así, el 34,2 % contra C0 queda muy por encima de ese ruido: la diferencia es real.

La mejor jugada tampoco es estable: dos repeticiones de C0 coinciden en 57–65 de 81 posiciones, y C2 r1 con C0 r1 en 49.

## 5. Desviaciones y límites

- **Edge seguía en marcha.** La comprobación previa detectó `msedge.exe` en las tres etapas, aunque el navegador se había cerrado; lo más probable son procesos en segundo plano. CPU en reposo: 91,7–97,5 %. VS Code también estaba abierto.
- **Las corridas fueron más cortas de lo previsto.** La calibración exige ≥ 60 s, pero solo en su propia partida. En la de medición, C0 tardó unos 30 s y C2 unos 4 s, con más peso del ruido (C0 va de 24,8 s a 34,0 s).
- **No hubo fallos técnicos** ni corridas repetidas. Todas las posiciones llegaron a profundidad 16.
- **Reparto:** en C2, los procesos atendieron entre 11 y 16 posiciones, porque toman la siguiente al quedar libres.
- Una máquina, una partida, una profundidad.

## 6. Qué significa para el proyecto

**Lo que sí queda demostrado:**
- El lote se reparte bien entre procesos, sin generador de carga: la concurrencia es natural.
- Con 6 procesos la memoria sube de 1317 MB a 2186 MB.

**Lo que no queda demostrado:** que un pool analice mejor o más rápido que un solo proceso con la misma CPU. Es la pregunta que justificaba el balanceo.

**Por la regla aprobada, se aplica el plan alternativo:** `LB_WORKERS=1` por defecto, un lote de WAV por el pool y la justificación franca en el ADR 10 y en `load-balancing.md`.

**Única vía para reabrirlo:** una versión v2 del criterio, decidida por el equipo y escrita antes de medir, que descarte esta evidencia y use otra partida. La comparación correcta sería un presupuesto igual de trabajo o de tiempo frente a una referencia más fuerte. La sección 8 del criterio prohíbe probar más configuraciones para rescatar la prueba: una v2 solo se justifica por el defecto de diseño de la sección 2, y hay que declararla como tal.
