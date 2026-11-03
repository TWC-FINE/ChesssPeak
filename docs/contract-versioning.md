# Versionado del contrato

El contrato es todo lo que vive en `shared/`: el socket, el REST, los eventos `cs:*` del navegador y los contextos de los microfrontends. Detalle en [protocol.md](protocol.md).

## Versión actual: `v: 1`

- `PROTOCOL_VERSION = 1` en `shared/src/protocol/common.ts`.
- La versión viaja en el **handshake del socket** (`auth: { token, v: 1 }`), en **cada evento `cs:*`** y en **cada contexto**. Los mensajes del socket y del REST no la repiten: la fija el handshake.
- El servidor **rechaza la conexión** si `v` no es una versión que soporte. No responde con una versión distinta a la pedida.

## Reglas dentro de v1: solo cambios aditivos

| Cambio | ¿Permitido en v1? |
|---|---|
| Campo nuevo **opcional** en un mensaje servidor → cliente, en un evento `cs:*` o en un contexto | Sí |
| Evento nuevo (socket o `cs:*`) | Sí |
| Campo nuevo **opcional** en un mensaje cliente → servidor | Sí, desplegando antes el servidor (que es estricto) |
| Usar un valor de enum **ya marcado como reservado** (`spectator`, `threefold_repetition`, `fifty_moves`) | Sí |
| Valor de enum nuevo, no reservado, en un mensaje servidor → cliente | **No**: un cliente antiguo lo rechazaría |
| Quitar o renombrar un campo, un evento o un valor; volver obligatorio un campo opcional; cambiar un tipo | **No** |

Lo que no está permitido exige **v: 2**: nueva constante, handshake con `v: 2` y un periodo en el que el servidor acepte las dos, o un despliegue conjunto.

## Estricto o tolerante

- **Cliente → servidor (socket y REST): `.strict()`.** El servidor rechaza cualquier campo que no conozca. Es una regla de seguridad: campos como `color`, `userId` o `player` no existen en los mensajes del cliente, y si llegan se rechazan. **La identidad la decide siempre el servidor**, a partir del token.
- **Servidor → cliente, eventos `cs:*` y contextos: tolerantes** (`z.object`, que descarta lo que no conoce). Así un cliente antiguo **ignora los campos nuevos** en lugar de fallar.

## Proceso

1. Cualquier cambio del contrato, por pequeño que sea, va en un **PR revisado y aprobado por las dos personas** (A y B).
2. El mismo PR actualiza los esquemas y sus tests, [protocol.md](protocol.md) y el registro de abajo.
3. Si el cambio no es aditivo, el PR sube la versión y explica la transición.

## Registro

| Versión | Fecha | Cambio |
|---|---|---|
| v1 | 2 de noviembre de 2026 | Primera versión (socket, REST, `cs:*`, contextos). Pendiente de firma por las dos personas (lun 9 de noviembre). |
