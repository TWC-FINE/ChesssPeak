# ADR 5 — `SpeechRecognizer` como Strategy y reconocedor por defecto

- **Estado:** Borrador. **Decisión pendiente de [docs/spike-results.md](../spike-results.md).**
- **Fecha del borrador:** 31 de octubre de 2026
- **Relacionado:** [PLAN.md](../../PLAN.md) §3.7 y §3.8 · [spike-criteria.md](../spike-criteria.md) · ADR 4

## Contexto

Hay dos formas de reconocer voz: la Web Speech API del navegador (en Chrome envía el audio a la nube de Google; el profesor lo aceptó) y Whisper local, que corre en la máquina de la persona usuaria y es el **módulo local** del proyecto (el profesor confirmó que el agente en localhost cuenta). Cada una tiene distinta precisión, latencia y requisitos. Además hace falta una entrada de texto de respaldo y un reconocedor falso para pruebas.

## Decisión (provisional)

1. **Patrón Strategy:** una interfaz `SpeechRecognizer` y adaptadores intercambiables: Web Speech, Whisper local (vía `local-agent`), Fake (tests) y caja de texto. El parser y el servidor no cambian al añadir o cambiar un adaptador.
2. **Reconocedor por defecto: _pendiente_.** Propuesta de partida: Web Speech, y Whisper local como alternativa y como módulo local. Se confirma o se cambia con las mediciones del spike:
   - Web Speech es el defecto **solo si** cumple los umbrales de [spike-criteria.md](../spike-criteria.md) §1.
   - Si no los cumple y Whisper sí, el defecto pasa a Whisper, con `base` o `small` según la latencia (p50 ≤ 1,5 s; ojo: la latencia del benchmark de Whisper es optimista, ver [spike-notes.md](../spike-notes.md)).
   - El **N-best** solo se adopta si cumple la regla de §4 del documento de criterios.

## Alternativas

- **Un único reconocedor fijo:** menos código, pero sin plan B si no cumple y sin módulo local.
- **Reconocer en el servidor:** habría que subir audio y mantener modelos en la nube; contradice la idea del módulo local.

## Consecuencias

- (+) Se puede cambiar de reconocedor sin tocar el resto; el cambio se mide con el mismo corpus y las mismas métricas.
- (+) El agente local queda aislado: HTTP en `127.0.0.1:8765` con CORS para `127.0.0.1:5500` y `localhost:5500`.
- (−) Web Speech depende de internet y de Chrome o Edge; Whisper necesita descargar binario y modelo y tiene más latencia en CPU.
- (−) El acceso desde un origen público al agente local depende del permiso de red local del navegador y no está probado.

## Criterio de cierre

Se cierra con la tabla comparativa de `docs/spike-results.md` (Web Speech vs Whisper `base`/`small`, split `test`) y la regla de decisión de ese documento. El resultado se anota abajo con la fecha.

_Decisión: pendiente. Evidencia: docs/spike-results.md (sin mediciones al escribir este borrador)._
