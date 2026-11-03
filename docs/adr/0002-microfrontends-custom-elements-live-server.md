# ADR 2 — Microfrontends como custom elements, servidos con Live Server (sin Module Federation)

- **Estado:** Aceptado (2 de noviembre de 2026).
- **Relacionado:** [PLAN.md](../../PLAN.md) §5.5 · [ARCHITECTURE.md](../../ARCHITECTURE.md) §2.2 · ADR 1

## Contexto

El curso exige microfrontends. La aclaración del profesor, **transmitida oralmente (no es una cita literal)**: cada microfrontend debe vivir por sí solo; todos conviven en un `index` que se ejecuta con Live Server; es un ejemplo del concepto y **no se exigen despliegues independientes**. **Sigue pendiente de confirmar** con el profesor si el proyecto debe poder abrirse con Live Server **sin compilar**.

## Decisión

1. **Tres custom elements** (`<mf-game>`, `<mf-voice-input>`, `<mf-history>`), cada uno en su **propio proyecto Vite** con Lit en **light DOM** (sin Shadow DOM) y un único bundle que registra su etiqueta. CSS plano con prefijo propio (`csg-`, `csv-`, `csh-`) y tokens compartidos en `shared/`.
2. **Un shell estático** (`index.html` + TypeScript vanilla, router por hash) carga los tres bundles, les inyecta el contexto por la propiedad `el.context` y se queda con el único socket. **Los microfrontends no se importan entre sí**, solo `shared/`; se comunican con eventos `cs:*`.
3. **Cada microfrontend vive por sí solo:** tiene su página standalone con contexto simulado, y si uno no carga o no se registra a tiempo, el shell muestra «`<nombre>` no disponible» y los demás siguen funcionando.
4. **Salida única en `web/dist/`** (`pnpm build:web`), con rutas relativas. Se puede abrir con Live Server en `http://127.0.0.1:5500/web/dist/index.html` (raíz del repo, sin romper la página del spike), con `pnpm serve:web` (servidor estático de Node sin dependencias, `127.0.0.1:5500`, para equipos sin VS Code) o como web estática pública.
5. **Sin Module Federation:** no se exigen despliegues independientes y añadiría complejidad de build sin beneficio para el curso.

## Alternativas

- **Module Federation / import maps con despliegue por microfrontend:** cumple "despliegue independiente", que el profesor dijo que no se exige; coste alto de configuración.
- **Iframes:** aislamiento total, pero comunicación y estilos incómodos, y el tablero necesita compartir el tamaño de la página.
- **Shadow DOM:** encapsula el CSS, pero chessground y los tokens compartidos funcionan mejor con CSS plano y prefijos.
- **Un solo bundle sin microfrontends:** más simple, pero incumple el requisito.

## Consecuencias

- (+) Cada pieza se desarrolla y se prueba sola; un fallo de una no tumba las otras.
- (+) `pnpm smoke:web` (Chrome o Edge sin interfaz) comprueba que las etiquetas se registran, que el tablero se pinta con sus piezas embebidas y que cada standalone funciona.
- (−) Con light DOM los estilos son globales: el prefijo por microfrontend es una disciplina, no una garantía.
- (−) `chessground` pesa: `mf-game.js` ronda los 190 kB (51 kB comprimido) con CSS y piezas incluidos.
- (−) Si el profesor exige abrir el proyecto con Live Server sin compilar, `web/dist` tendrá que estar en el repositorio desde la entrega.
