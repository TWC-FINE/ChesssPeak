# Contribuir a ChessSpeak

Reglas de trabajo del proyecto, en solitario: el responsable del repo es el único que aprueba. Corto a propósito: se cumple o se discute en un PR.

## Idioma
- Código, comentarios, nombres de ramas y mensajes de commit: **inglés**.
- Interfaz de usuario y documentación (`*.md`): **español**.
- Nombre del proyecto: **ChessSpeak**. “ChessPeak” y “ChesssPeak” son errores.

## Ramas
- `main` siempre debe compilar y pasar CI. No se hace push directo a `main`.
- Una rama por feature o fix, saliendo de `main` actualizado:
  - `feat/<tema>` (ej. `feat/game-room`)
  - `fix/<tema>`
  - `docs/<tema>`
  - `chore/<tema>`
  - `spike/<tema>` para pruebas desechables
- Ramas cortas: si pasa de 2–3 días, se parte en tareas más chicas.

## Commits
Formato [Conventional Commits](https://www.conventionalcommits.org/), en inglés, en imperativo:

```
feat(server): add GameRoom move validation
fix(voice-parser): handle "be" and "ve" aliases
docs: update calendar in PLAN.md
```

Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`. Ámbitos sugeridos: `server`, `web`, `voice-parser`, `local-agent`, `shared`.

Commits pequeños, uno por cambio lógico. Nunca se commitean secretos, `.env`, binarios de whisper ni modelos.

## Pull requests
1. Abre el PR contra `main` con una descripción corta: qué cambia, por qué y cómo probarlo.
2. **Lo revisa y lo aprueba el responsable del repo** antes de fusionar. No hay revisión de otra persona.
3. CI en verde, revisando cada trabajo por separado (`verify`, `integration`, `secrets` y `smoke`): `smoke` es `continue-on-error`, así que el resultado global puede decir verde aunque falle.
4. Se fusiona con *squash* y se borra la rama.
5. **Cambios en `shared/` (contrato)** van siempre en un PR propio, lo aprueba el responsable del repo y suben la versión.
6. Si el PR cambia una decisión de arquitectura, incluye o actualiza el ADR correspondiente en `docs/adr/`.

**Excepción a la regla 4:** la cadena #3, #10, #11, #12, #13 y #14 se fusiona con **commit de fusión**, en ese orden, con cada trabajo de CI en verde revisado por separado y con la base en `main` antes de fusionar. Ninguna de sus ramas se borra hasta que el PR siguiente apunte a `main`. Un *squash* rompería la cadena, porque cada PR se apoya en los commits del anterior.

## Revisiones
- Se revisa lo importante: corrección, contrato, seguridad, tests. El estilo lo resuelven lint y formato.

## Convenciones de código
- TypeScript estricto. Sin `any` salvo justificación en un comentario.
- Validación de entradas externas (socket, HTTP) con zod usando los schemas de `shared/`.
- `GameRoom` y `voice-parser` son puros: sin Nest, sin DOM, testeables en aislamiento.
- Los microfrontends no se importan entre sí; hablan con eventos `cs:*` definidos en `shared/`.
- CSS plano con prefijo por microfrontend (`.mfg-…`, `.mfv-…`, `.mfh-…`) y tokens compartidos. Sin Shadow DOM.
- Nombres: archivos en `kebab-case`, clases en `PascalCase`, variables y funciones en `camelCase`, eventos `cs:kebab-case`.

## Tests
- Server: Jest. `shared`, `voice-parser` y `web`: Vitest.
- Todo cambio en `voice-parser` agrega o ajusta frases del corpus (`corpus v1`, 80 frases).
- Un bug se arregla primero con un test que lo reproduce.

## Seguridad
- Secretos solo en `.env` (con `.env.example` en el repo). Si se filtra uno, se rota de inmediato.
- No se guarda audio en ningún lado.
- Instalar dependencias nuevas solo con motivo claro; se anotan en el PR.

## Organización
- El avance se marca en [PLAN.md](PLAN.md). Si algo se atrasa, se aplica el orden de recorte del plan sin discutirlo de nuevo.
- Las dudas de alcance se resuelven en [SPEC.md](SPEC.md).
