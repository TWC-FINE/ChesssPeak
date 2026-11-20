# ADR 9 — Licencia GPL-3.0, por chessground

- **Estado:** Propuesto (20 de noviembre de 2026). Se acepta al fusionarlo el responsable del repo.
- **Relacionado:** [`LICENSE`](../../LICENSE) · [README.md](../../README.md), «Licencia» · ADR 2 · `pnpm-workspace.yaml` (`patchedDependencies`)

## Contexto

El tablero de `<mf-game>` es **chessground** 9.2.1 y las reglas, en el servidor y en la web, son **chessops** 0.15.1. Las dos son de lichess y se publican con **GPL-3.0-or-later**. El resto de dependencias es permisivo: Lit (BSD-3-Clause), NestJS, Socket.IO, zod, Mongoose y whisper.cpp (MIT) y Prisma (Apache-2.0).

La web se distribuye: el navegador descarga el bundle de `web/dist`, que lleva chessground y chessops dentro, desde Vercel o desde `pnpm serve:web`. Además, chessops se usa con un parche propio (`patches/chessops@0.15.1.patch`), así que hay una versión modificada. Una obra que incluye código GPL y se distribuye tiene que distribuirse con la GPL y con su código fuente.

## Decisión

1. **Todo el repositorio usa GPL-3.0-only:** `LICENSE` con el texto de la GPL-3.0 y `"license": "GPL-3.0-only"` en cada `package.json`. Se elige una sola licencia para todo, aunque el servidor o `voice-parser` podrían tener otra, porque el monorepo se entrega y se lee como un todo.
2. **El código fuente es este repositorio público,** `TWC-FINE/ChesssPeak`, con el parche de chessops incluido. Quien recibe la web puede obtener el código que la generó, en la misma versión.
3. **«-only» y no «-or-later»:** la GPL-3.0-or-later de chessground permite usar la 3.0. Elegir «-only» evita aceptar por adelantado una versión futura que nadie del proyecto ha leído.
4. **No se cambian las dependencias por la licencia.** Un tablero propio o una biblioteca permisiva (por ejemplo, chess.js para las reglas) costaría días de trabajo y pruebas, y lo que se ganaría, poder cerrar el código, no hace falta en un proyecto académico y público.

## Alternativas

- **MIT u otra licencia permisiva:** no es compatible. Distribuir el bundle con chessground bajo MIT incumpliría la GPL.
- **Licencias distintas por paquete:** posible para `server/` o `voice-parser`, pero `server/` también usa chessops y el resto es poco código. Complica la entrega y no aporta nada.
- **AGPL-3.0:** cubriría también el uso por red del servidor. Ninguna dependencia lo exige, y la GPL ya obliga a publicar el código de la web, que es lo que se distribuye.

## Consecuencias

- (+) Cumple la licencia de chessground y chessops sin cambiar el código.
- (+) Encaja con el requisito del curso de tener todo en GitHub: el repositorio ya es el código fuente que la GPL pide.
- (−) Quien reutilice el proyecto tiene que publicarlo con la GPL si lo distribuye. No se puede convertir en un producto cerrado.
- (−) Una dependencia nueva debe tener una licencia compatible con la GPL-3.0. Se revisa en el PR que la añada.
- (−) El servidor en Render no se distribuye, solo se usa por red. La GPL no obliga a publicar sus cambios. Aquí se publican igual, porque todo está en el repositorio.
- (−) **No es asesoría legal:** es la lectura del equipo de las licencias, y se puede revisar si el profesor o la universidad piden otra cosa.
