# ADR 1 — Backend NestJS en TypeScript, con los contratos en `shared/`

- **Estado:** Aceptado (2 de noviembre de 2026).
- **Relacionado:** [PLAN.md](../../PLAN.md) §5.1, §5.2 y §5.6 · [ARCHITECTURE.md](../../ARCHITECTURE.md) · ADR 4 y 5 · [ADR 11](0011-balanceo-de-jugadas-con-move-workers.md)

## Contexto

El backend gestiona identidad, partidas en tiempo real (Socket.IO) y telemetría, y lo escriben dos personas junto con el front. Hace falta una estructura que se pueda dividir entre las dos, con una sola fuente de verdad para los mensajes que cruzan el cable. El servidor **no sabe de voz**: solo recibe jugadas en UCI.

## Decisión

1. **NestJS en TypeScript estricto, como monolito modular** (no microservicios): módulos `auth`, `games`, `voice-metrics` y `health`. Una sola instancia en Render.
2. **Los contratos viven en `shared/`** (`@chessspeak/shared`): tipos y esquemas **zod** para los eventos del socket, los eventos `cs:*` y el contexto de los microfrontends. El servidor y el front validan contra los mismos esquemas. El contrato v0 lo aprueba el responsable del repo; `shared/` ya contiene el tipo `Identity` y un esquema de ejemplo.
3. **Pruebas:** Jest en `server`; Vitest en `shared`, `voice-parser` y `web`. `pnpm verify` ejecuta el typecheck y los tests de todos los paquetes.
4. **Versiones del servidor:** NestJS 11 (CommonJS) con su propio `typescript` 5.9. El resto del repositorio usa TypeScript 7, pero `ts-jest` solo admite versiones menores que 7, y NestJS 12 es solo ESM, lo que complica Jest. Se revisa cuando el ecosistema lo permita.
5. **Builds de pnpm:** `pnpm install` terminaba con `ERR_PNPM_IGNORED_BUILDS` porque pnpm 12 no ejecuta por defecto los scripts de instalación. Se **deniegan explícitamente** (`allowBuilds` en `pnpm-workspace.yaml`, con `pnpm approve-builds`) los de `esbuild` y `@parcel/watcher`: ambos funcionan con sus binarios precompilados y sin su script. Así `pnpm install` termina con código 0 y el CI puede mirarlo. Si un paquete nuevo necesita su script, se decide en un commit aparte.

## Alternativas

- **Express o Fastify a mano:** menos estructura; habría que inventar la modularidad y la inyección de dependencias entre dos personas.
- **Contratos duplicados en front y back:** riesgo de divergencia; por eso un único paquete firmado por las dos.
- **Microservicios:** coste de despliegue y de coordinación sin beneficio para este tamaño.

## Consecuencias

- (+) Un contrato tipado y validado en los dos lados; el módulo de cada área se puede asignar por separado.
- (+) `GameRoom` y el parser se prueban sin Nest.
- (−) `shared/` está escrito como TypeScript ESM y `server` compila a CommonJS: cómo lo consume Nest (compilar `shared` o transformarlo en Jest) se decide en la parte 0c, cuando haya contrato.
- (−) Dos versiones de TypeScript en el repositorio hasta que `ts-jest` admita la 7.
- (−) **Revisión del 5 de noviembre:** el [ADR 11](0011-balanceo-de-jugadas-con-move-workers.md) prevé procesos auxiliares que solo guardan jugadas, activados con `MOVE_WORKERS` (0 por defecto). La lógica sigue en el monolito y en una sola instancia.
