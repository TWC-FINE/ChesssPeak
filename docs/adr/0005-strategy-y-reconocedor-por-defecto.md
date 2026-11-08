# ADR 5 — `SpeechRecognizer` como Strategy y reconocedor por defecto

- **Estado:** Aceptado (2 de noviembre de 2026). Decisión y datos en [docs/spike-results.md](../spike-results.md) y [docs/spike-run-b.md](../spike-run-b.md).
- **Fecha del borrador:** 31 de octubre de 2026
- **Relacionado:** [PLAN.md](../../PLAN.md) §3.7 y §3.8 · [spike-criteria.md](../spike-criteria.md) · ADR 4

## Contexto

Hay dos formas de reconocer voz: la Web Speech API del navegador (envía el audio a la nube del fabricante: a la de Microsoft en Edge, el navegador de la demo, y a la de Google en Chrome. El profesor aceptó la de Google; que acepte igual la de Microsoft es un supuesto) y Whisper local, que corre en la máquina de la persona usuaria y es el **módulo local** del proyecto (el profesor confirmó que el agente en localhost cuenta). Cada una tiene distinta precisión, latencia y requisitos. Además hace falta una entrada de texto de respaldo y un reconocedor falso para pruebas.

## Decisión

1. **Patrón Strategy:** una interfaz `SpeechRecognizer` y adaptadores intercambiables: Web Speech, Whisper local (vía `local-agent`), Fake (tests) y caja de texto. El parser y el servidor no cambian al añadir o cambiar un adaptador.
2. **Reconocedor por defecto: Web Speech en Edge, con un retardo de 400 ms entre soltar el botón y llamar a `stop()`.** El retardo **es un requisito del producto**: sin él (corrida A) el acierto es 56,4 %; con él (corrida B) 87,2 % y se cumplen todos los umbrales.
3. **Whisper local, modelo `small` con prompt de ajedrez, como alternativa seleccionable y como módulo local.** Acierto 89,7 %, 0 aceptaciones erróneas, pero latencia p50 2,91 s y p95 3,06 s (solo inferencia; la real es mayor), por encima de 1,5 s y 3 s. Esa latencia se declara en la interfaz y en la documentación. `base` (74,4 % con prompt) no cumple el acierto. El prompt de ajedrez es obligatorio en el agente (sin él, `small` baja a 61,5 %).
4. **Confirmación explícita obligatoria** con cualquier reconocedor.
5. **El N-best no se adopta**: ganancia de 0,0 puntos, por debajo del criterio de §4 de [spike-criteria.md](../spike-criteria.md).
6. Como Whisper no cumple la latencia, no se activa el desempate entre Web Speech y Whisper de [spike-run-b.md](../spike-run-b.md) (punto 6).

## Alternativas

- **Un único reconocedor fijo:** menos código, pero sin plan B si no cumple y sin módulo local.
- **Reconocer en el servidor:** habría que subir audio y mantener modelos en la nube; contradice la idea del módulo local.

## Consecuencias

- (+) Se puede cambiar de reconocedor sin tocar el resto; el cambio se mide con el mismo corpus y las mismas métricas.
- (+) El agente local queda aislado: HTTP en `127.0.0.1:8765` con CORS para `127.0.0.1:5500` y `localhost:5500`.
- (−) Web Speech depende de internet y de Chrome o Edge; Whisper necesita descargar binario y modelo y tiene más latencia en CPU.
- (−) El acceso desde un origen público al agente local depende del permiso de red local del navegador y no está probado.
- (−) El retardo de 400 ms se suma a la latencia que percibe la persona (B: p50 0,57 s). Hay que implementarlo en el producto, no solo en el arnés.
- (−) La mejora de A a B no se puede atribuir solo al retardo (control: 20 fallos no truncados con ruido en A contra 6 en B; posible efecto de práctica y ruido no idéntico). Una voz y una corrida B; límite inferior del IC95 de B: 78 %.
- **Pendiente:** validación con otra voz, frases nuevas y el equipo de la demo en la sesión de evaluación de la semana 4; **prueba en Chrome** (todo se midió en Edge 156 y PLAN.md asume Chrome); posible prueba de un modelo `small` cuantizado para bajar la latencia de Whisper, como **corrida nueva declarada** antes de medir.

## Criterio de cierre

Se cerró con la tabla comparativa de `docs/spike-results.md` y `docs/spike-run-b.md` (Web Speech A y B, Whisper `base`/`small` con y sin prompt, split `test`) y la regla de decisión de ese documento.

_Decisión: aceptado el 2 de noviembre de 2026. Evidencia: docs/spike-run-b.md (corrida B y Whisper sobre los clips de B)._
