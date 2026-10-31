# ADR 4 — Resolver lo hablado contra las jugadas legales

- **Estado:** Borrador. **Decisión pendiente de [docs/spike-results.md](../spike-results.md).**
- **Fecha del borrador:** 31 de octubre de 2026
- **Relacionado:** [PLAN.md](../../PLAN.md) §3.7 y §6 · [spike-criteria.md](../spike-criteria.md) · ADR 5

## Contexto

Los jugadores dicen las jugadas en voz alta. Los reconocedores confunden letras que riman en español (be, ce, de, e, ge), fusionan palabras («peone») y escriben números como dígitos o como palabras. Si el sistema interpretara la frase como notación libre, aceptaría jugadas ilegales o equivocadas sin avisar.

## Decisión (provisional)

El servidor **no sabe de voz**: solo recibe jugadas en UCI y las valida. En el cliente, `voice-parser` (TypeScript puro, con `chessops`):

1. normaliza el texto reconocido (minúsculas, sin tildes, números a dígitos);
2. genera, para cada jugada legal de la posición (FEN), varias formas habladas (con y sin pieza, con «toma», coordenadas, desambiguación, enroques, coronación);
3. elige la más parecida con una distancia ponderada por tokens que abarata las confusiones fonéticas;
4. devuelve `move | ambiguous | nomatch | command`, con umbral y margen configurables. Nunca propone una jugada ilegal; si dos jugadas empatan, pide repetir.

La jugada propuesta se confirma explícitamente antes de enviarse.

## Alternativas

- **Gramática o expresiones regulares sobre la notación:** más simple, pero no corrige confusiones de letras y acepta jugadas ilegales.
- **Resolver en el servidor:** acopla el servidor al reconocimiento y mezcla responsabilidades.
- **Un modelo de lenguaje:** más flexible, pero no determinista, más lento y difícil de medir y de probar.

## Consecuencias

- (+) Tolera errores de reconocimiento sin aceptar jugadas ilegales; el parser se prueba solo, con un corpus.
- (+) Cambiar de reconocedor no cambia el parser ni el servidor (ver ADR 5).
- (−) Depende del estado de la partida (FEN) en el cliente.
- (−) La calidad se sabe solo midiendo: hace falta el corpus y las métricas del spike.

## Criterio de cierre

Se **confirma** si el split `test`, medido con el parser congelado, cumple todos los umbrales de [spike-criteria.md](../spike-criteria.md) §1 con el reconocedor elegido en el ADR 5. Si el acierto top-1 queda entre 70 % y 85 %, se refuerzan alias y modo coordenadas y se vuelve a medir con un `test` nuevo; si queda por debajo del 70 %, se revisa el enfoque. Una falsa aceptación distinta de cero no se compensa.

_Decisión: pendiente. Evidencia: docs/spike-results.md (sin mediciones al escribir este borrador)._
