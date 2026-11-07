# ADR 3 — Dos bases: PostgreSQL para las partidas y MongoDB para las jugadas y la telemetría

- **Estado:** Aceptado (3 de noviembre de 2026).
- **Relacionado:** [PLAN.md](../../PLAN.md) §5.2 y §5.3 · [ARCHITECTURE.md](../../ARCHITECTURE.md) §5 · ADR 1

## Contexto

El curso exige al menos dos bases de datos. Además hay dos tipos de datos distintos: el registro **relacional y con reglas** de quién jugó con quién y cómo terminó, y un flujo de documentos **que solo crece** (jugadas y telemetría de voz) que se escribe con mucha más frecuencia. El estado vivo de una partida está en memoria (`GameRoom`); las bases son su respaldo.

## Decisión

**PostgreSQL (Neon en producción, Prisma):** lo que debe cumplir reglas y consultarse por relaciones.
- `games`: `id` uuid, `status` (enum `waiting | active | finished | aborted`), `result`, `termination`, y por cada color `user_id` (nulo), `guest_id` (uuid, nulo) y `name`, más `created_at` y `finished_at`.
- `users`: mínima (`id`, `username` único, `password_hash`, `created_at`), solo para la clave foránea; sin lógica de autenticación todavía.
- Las reglas viven en la base como `CHECK` (migración SQL manual, porque Prisma no las expresa):
  - por color, como máximo uno de `user_id` y `guest_id`;
  - en `active` y `finished`, los dos colores tienen exactamente uno; en `waiting` y `aborted`, al menos un color tiene asiento (una partida abortada puede tener un solo asiento);
  - `status` enlazado con `result` y `termination`: `finished` con `1-0`, `0-1` o `1/2-1/2` y una terminación que no sea `aborted`; `aborted` con `*` y `aborted`; `waiting` y `active` con ambos nulos.
- `result` y `termination` son **TEXT con CHECK**, no enums de Postgres, para poder cambiar la lista con una migración simple. Sus valores salen del **borrador del contrato v0** (PR #3, en borrador) y **se alinearán cuando se fusione**.

**MongoDB (Atlas M0, `@nestjs/mongoose`):** documentos que se añaden y rara vez se modifican.
- `game_moves`: un documento por partida (`gameId` único) con `plyCount` y `moves[{ ply, uci, san, fen, at }]`. Es el destino del **write-behind**.
- `voice_attempts`: un documento por intento de reconocimiento, **sin audio**. `player` y `createdAt` los pone el servidor. Índices `{gameId, createdAt}`, `{session}` y `{recognizer, createdAt}`; los percentiles de latencia se calculan en Node.

**Write-behind idempotente.** El servidor responde con el estado en memoria y guarda la jugada después con `updateOne({ gameId, plyCount: ply - 1 }, { $push: { moves }, $inc: { plyCount: 1 }, $set: { updatedAt } })`. Si no coincide nada: `plyCount >= ply` es un reintento (se ignora) y `plyCount < ply - 1` es un hueco (se registra, no se escribe). Así un reintento no duplica y una escritura perdida no queda oculta.

**Desarrollo local:** `docker-compose.yml` con `postgres:17` y `mongo:8`, volúmenes con nombre y puertos solo en `127.0.0.1` (Postgres en el 15432 para no chocar con una instalación del equipo; antes era el 55432, que Windows puede reservar porque cae en su rango dinámico). Las credenciales salen de `.env` (`pnpm env:init`).

## Alternativas

- **Solo PostgreSQL** (jugadas en `jsonb`): más simple, pero incumple el requisito y mezcla la telemetría con los datos relacionales.
- **Solo MongoDB:** sin integridad entre la identidad de los jugadores y la partida.
- **Guardar cada jugada en Postgres:** posible, pero el patrón de solo-añadir con idempotencia por `plyCount` encaja mejor en un documento.
- **Enums de Postgres para `result` y `termination`:** más estricto, pero cambiar un valor exige `ALTER TYPE`; se prefirió TEXT con CHECK mientras el contrato esté en revisión.

## Consecuencias

- (+) Las reglas de los asientos y del resultado no dependen del código de la aplicación: la base rechaza lo inválido.
- (+) El servidor arranca y `GET /health` responde 200 aunque una base esté caída (`degraded`).
- (−) Dos bases que mantener y dos cadenas de conexión (`DATABASE_URL`, `MONGO_URI`). El `CHECK` de TEXT hay que sincronizarlo a mano con el contrato.
- (−) Si el servidor cae entre la respuesta y el write-behind, la jugada puede no llegar a Mongo; el hueco se detecta en la siguiente escritura y la rehidratación debe tenerlo en cuenta.
- (−) Prisma necesita ejecutar los scripts de instalación de `prisma` y `@prisma/engines` (descargan el motor de migraciones); se permiten expresamente en `pnpm-workspace.yaml`, a diferencia de `esbuild`.
- Pendiente: añadir `protocolVersion` a `/health` cuando se fusione el contrato (ver `docs/spike-notes.md`).
