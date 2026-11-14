# ADR 6 — `local-agent` por HTTP en localhost

- **Estado:** Aceptado (6 de noviembre de 2026). **Probado a mano con el Whisper real y un micrófono real el 8 de noviembre de 2026,** con una sola voz (ver [HANDOFF.md](../HANDOFF.md)).
- **Relacionado:** [ADR 5](0005-strategy-y-reconocedor-por-defecto.md) · [ADR 10](0010-balanceo-de-carga-en-local-agent.md) · [docs/deploy.md](../deploy.md) · [SPEC.md](../../SPEC.md) R2

## Contexto

Whisper corre en la máquina de quien juega, porque es el módulo local del proyecto y la nube gratuita no tiene CPU para él. La web tiene que hablar con ese proceso de algún modo, y el servidor no debe saber de voz (regla 1 de `AGENTS.md`).

## Decisión

1. **El navegador llama directamente al agente,** con un POST de un WAV a `http://127.0.0.1:8765/transcribe`. El servidor no interviene. Solo recibe la jugada confirmada, en UCI, y la telemetría, sin audio.
2. **El agente solo escucha en `127.0.0.1` y solo acepta orígenes de una lista** (`AGENT_ALLOWED_ORIGINS`) y las cabeceras `Host` esperadas. Responde a la petición previa de acceso a red privada.
3. **La web solo consulta al agente al abrir el selector de reconocedor.** Desde una página pública, esa llamada puede hacer que el navegador pida permiso de red local, y quien no va a usar Whisper no debe verlo.
4. **El selector aparece si `PUBLIC_AGENT_URL` está definida,** y Whisper solo se puede elegir si `/health` responde.

## Alternativas

- **El agente abre un WebSocket saliente hacia el servidor (descartada):** evitaría el permiso de red local desde una web pública. Pero el audio pasaría por el servidor, que dejaría de ignorar la voz, y habría que emparejar cada agente con su jugador.
- **Whisper en el navegador con WebAssembly (no evaluada):** evitaría instalar nada, pero no se ha medido. Las cifras del spike son de `whisper.cpp` nativo.

## Consecuencias

- (+) El audio no sale de la máquina y no se guarda en ninguna parte.
- (+) El servidor sigue sin saber de voz, y el agente se puede cambiar sin tocarlo.
- (−) **Solo funciona en la máquina donde corre el agente,** y hay que instalar el binario y el modelo.
- (−) **Desde una web pública, el navegador puede bloquear la llamada,** y la página no puede distinguir ese bloqueo de un agente apagado. Chrome pide permiso desde la versión 142; en Edge no está comprobado. La prueba está en [docs/deploy.md](../deploy.md). Por eso la demo sirve la web en local.
- (−) Cada origen público hay que añadirlo a `AGENT_ALLOWED_ORIGINS`.
- **Verificación:** el flujo está cubierto con un agente falso y el micrófono falso del navegador (`pnpm e2e:web`), y el 8 de noviembre se probó a mano contra el `local-agent` real con voz real, en la web local y en la pública, con una sola voz. Los tiempos de esa prueba son orientativos, no una medición. **Sigue sin verificar:** si Edge muestra el aviso de red local, y la validación con otra voz.
