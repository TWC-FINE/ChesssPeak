# ADR 1 — Backend NestJS en TypeScript, con los contratos en `shared/`

- **Estado:** Aceptado (2 de noviembre de 2026).
- **Relacionado:** [PLAN.md](../../PLAN.md) §5.1, §5.2 y §5.6 · [ARCHITECTURE.md](../../ARCHITECTURE.md) · ADR 4 y 5 · [ADR 11](0011-balanceo-de-jugadas-con-move-workers.md)

## Contexto

El backend gestiona identidad, partidas en tiempo real (Socket.IO) y telemetría, y lo escriben dos personas junto con el front. Hace falta una estructura que se pueda dividir entre las dos, con una sola fuente de verdad para los mensajes que cruzan el cable. El servidor **no sabe de voz**: solo recibe jugadas en UCI.

## Decisión

1. **NestJS en TypeScript estricto, como monolito modular** (no microservicios): módulos `auth`, `games`, `voice-metrics` y `health`. Una sola instancia en Render.
2. **Los contratos viven en `shared/`** (`@chessspeak/shared`): tipos y esquemas **zod** para el socket, el REST, los eventos `cs:*` y el contexto de los microfrontends (contrato v1, ver [docs/protocol.md](../protocol.md) y [docs/contract-versioning.md](../contract-versioning.md)). El servidor y el front validan contra los mismos esquemas. El contrato lo aprueba el responsable del repo.
3. **Pruebas:** Jest en `server`; Vitest en `shared`, `voice-parser` y `web`. `pnpm verify` ejecuta el typecheck y los tests de todos los paquetes.
4. **Versiones del servidor:** NestJS 11 (CommonJS) con su propio `typescript` 5.9. El resto del repositorio usa TypeScript 7, pero `ts-jest` solo admite versiones menores que 7, y NestJS 12 es solo ESM, lo que complica Jest. Se revisa cuando el ecosistema lo permita.
5. **Builds de pnpm:** `pnpm install` terminaba con `ERR_PNPM_IGNORED_BUILDS` porque pnpm 12 no ejecuta por defecto los scripts de instalación. Se **deniegan explícitamente** (`allowBuilds` en `pnpm-workspace.yaml`, con `pnpm approve-builds`) los de `esbuild` y `@parcel/watcher`: ambos funcionan con sus binarios precompilados y sin su script. Así `pnpm install` termina con código 0 y el CI puede mirarlo. Si un paquete nuevo necesita su script, se decide en un commit aparte.
6. **Cómo consume Nest el paquete `shared` (nota del 2 de noviembre de 2026):** `shared` se escribe como TypeScript ESM y se **compila solo a CommonJS** (`pnpm --filter @chessspeak/shared build`: `dist/cjs` + declaraciones en `dist/types`, con un `package.json` `"type": "commonjs"` dentro de `dist/cjs`). Sus `exports` tienen cuatro condiciones, en este orden:
   - `source` → `src/index.ts`: condición propia que usan la web (`customConditions` en sus `tsconfig`, `resolve.conditions` en Vite y Vitest, `conditions` en esbuild), así que la web no necesita compilar `shared`.
   - `types` → `dist/types/index.d.ts` y `require` → `dist/cjs/index.js`: los usa el servidor. Con `moduleResolution: node10`, TypeScript 5.9 lee el campo `types` y Node/Jest el `main`/`require`.
   - `default` → `src/index.ts`.
   `server` compila `shared` antes de `typecheck`, `test` y `build` (`nest build`). Verificado: typecheck con TS 5.9, Jest (test de importación que comprueba que `require` resuelve a `dist/cjs`), `nest build` respetando su `rootDir` y el proceso arrancado respondiendo `/health` con `protocolVersion: 1`.
   Se probó también que `types` apuntando a `src/index.ts` compila (TS 5.9 y `nest build` sin errores), pero se descartó: así el servidor comprueba los tipos de lo mismo que ejecuta (la salida compilada) y no compila el código de `shared`, pensado para TypeScript 7, con otra versión. No se publica salida ESM: ningún consumidor la necesita.

## Alternativas

- **Express o Fastify a mano:** menos estructura; habría que inventar la modularidad y la inyección de dependencias entre dos personas.
- **Contratos duplicados en front y back:** riesgo de divergencia; por eso un único paquete, aprobado por el responsable del repo.
- **Microservicios:** coste de despliegue y de coordinación sin beneficio para este tamaño.

## Consecuencias

- (+) Un contrato tipado y validado en los dos lados; el módulo de cada área se puede asignar por separado.
- (+) `GameRoom` y el parser se prueban sin Nest.
- (−) El servidor depende de compilar `shared` antes (lo hacen sus scripts); si alguien ejecuta `tsc` o `jest` directamente sin compilar `shared`, falla con «no se encuentra el módulo».
- (−) Dos versiones de TypeScript en el repositorio hasta que `ts-jest` admita la 7.
- (−) **Revisión del 5 de noviembre:** el [ADR 11](0011-balanceo-de-jugadas-con-move-workers.md) prevé procesos auxiliares que solo guardan jugadas, activados con `MOVE_WORKERS` (0 por defecto). La lógica sigue en el monolito y en una sola instancia.
