# ADR 4 — Resolver lo hablado contra las jugadas legales

- **Estado:** Aceptado (2 de noviembre de 2026). Decisión y datos en [docs/spike-results.md](../spike-results.md) y [docs/spike-run-b.md](../spike-run-b.md).
- **Fecha del borrador:** 31 de octubre de 2026
- **Relacionado:** [PLAN.md](../../PLAN.md) §3.7 y §6 · [spike-criteria.md](../spike-criteria.md) · ADR 5

## Contexto

Los jugadores dicen las jugadas en voz alta. Los reconocedores confunden letras que riman en español (be, ce, de, e, ge), fusionan palabras («peone») y escriben números como dígitos o como palabras. Si el sistema interpretara la frase como notación libre, aceptaría jugadas ilegales o equivocadas sin avisar.

## Decisión

El servidor **no sabe de voz**: solo recibe jugadas en UCI y las valida. En el cliente, `voice-parser` (TypeScript puro, con `chessops`):

1. normaliza el texto reconocido (minúsculas, sin tildes, números a dígitos);
2. genera, para cada jugada legal de la posición (FEN), varias formas habladas (con y sin pieza, con «toma», coordenadas, desambiguación, enroques, coronación);
3. elige la más parecida con una distancia ponderada por tokens que abarata las confusiones fonéticas;
4. devuelve `move | ambiguous | nomatch | command`, con umbral y margen configurables. Nunca propone una jugada ilegal; si dos jugadas empatan, pide repetir.

La jugada propuesta se confirma explícitamente antes de enviarse. **La confirmación explícita es obligatoria**, con cualquier reconocedor.

## Datos medidos

Parser congelado (`spike-parser-freeze`), split `test` (78 intentos válidos), solo la primera alternativa, parámetros `threshold` 1, `margin` 0,25, `rankPenalty` 0,3:

| Reconocedor | Acierto top-1 | Aceptación errónea | Ambigüedad | Silencio/ruido aceptado |
|---|---|---|---|---|
| Web Speech, Edge, corrida A (sin retardo) | 56,4 % | 1,3 % | 10,3 % | 0/38 |
| Web Speech, Edge, corrida B (retardo de 400 ms) | 87,2 % (IC95 78–93 %) | 0,0 % | 0,0 % | 0/38 |
| Whisper `small` + prompt de ajedrez | 89,7 % (IC95 81–95 %) | 0,0 % | 7,7 % | 0/38 |

Con la corrida B (la que cuenta según la regla de lectura) se cumplen todos los umbrales de [spike-criteria.md](../spike-criteria.md). Los fallos restantes son sobre todo `nomatch` (12,8 % en B), no jugadas equivocadas: la resolución contra jugadas legales no aceptó ninguna jugada errónea en B y solo una en A. El N-best no aportó nada en ningún caso (+0,0 puntos).

## Alternativas

- **Gramática o expresiones regulares sobre la notación:** más simple, pero no corrige confusiones de letras y acepta jugadas ilegales.
- **Resolver en el servidor:** acopla el servidor al reconocimiento y mezcla responsabilidades.
- **Un modelo de lenguaje:** más flexible, pero no determinista, más lento y difícil de medir y de probar.

## Consecuencias

- (+) Tolera errores de reconocimiento sin aceptar jugadas ilegales; el parser se prueba solo, con un corpus.
- (+) Cambiar de reconocedor no cambia el parser ni el servidor (ver ADR 5).
- (−) Depende del estado de la partida (FEN) en el cliente.
- (−) La calidad se sabe solo midiendo: hace falta el corpus y las métricas del spike.
- (−) El límite inferior del IC95 de B (78 %) queda por debajo del 85 %, y la mejora de A a B no se puede atribuir solo al retardo (el control: 20 fallos no truncados con ruido en A contra 6 en B).
- **Pendiente:** validar con otra voz, con frases nuevas y con el equipo de la demo en la sesión de evaluación de la semana 4; la prueba en Chrome sigue pendiente (todo se midió en Edge 156).
- Fallos de A anotados y sin arreglar (`toma` + letra fundidos, «alfil» partido): se revisan con el corpus v1, no con el `test` ya usado.

## Criterio de cierre

Se confirmaba si el split `test`, medido con el parser congelado, cumple todos los umbrales de [spike-criteria.md](../spike-criteria.md) §1 con el reconocedor elegido en el ADR 5. Si el acierto top-1 queda entre 70 % y 85 %, se refuerzan alias y modo coordenadas y se vuelve a medir con un `test` nuevo; si queda por debajo del 70 %, se revisa el enfoque. Una falsa aceptación distinta de cero no se compensa.

_Decisión: aceptado el 2 de noviembre de 2026. Evidencia: docs/spike-results.md y docs/spike-run-b.md (corrida B, split `test`)._
