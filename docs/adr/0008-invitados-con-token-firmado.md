# ADR 8 — Invitados con token firmado

- **Estado:** Aceptado (5 de noviembre de 2026).
- **Relacionado:** [SPEC.md](../../SPEC.md) RF1 · [docs/protocol.md](../protocol.md) §2 · ADR 1

## Contexto

Quien juega entra sin registrarse (RF1), y el servidor debe decidir siempre la identidad. Esa identidad tiene que sobrevivir a una reconexión, porque `GameRoom` asigna los asientos por un id estable. El login queda fuera del plan.

## Decisión

1. **`POST /auth/guest` entrega un JWT firmado** con HS256 y una validez de 24 horas. Lleva `kind`, `name` y, en `sub`, un `guestId` generado por el servidor. No hay fila en `users`: el token es la identidad.
2. **El cuerpo se valida con el esquema estricto de `shared/`,** el mismo que usan los clientes, así que un cliente no puede enviar su propia identidad.
3. **`GuestTokenService.verify` solo acepta HS256 y una identidad de invitado válida.** Es lo que usarán el handshake del socket y `POST /games`.
4. **El secreto no tiene valor por defecto.** `.env.example` solo lleva el nombre, vacío, y `pnpm env:init` genera uno aleatorio. Debe tener al menos 32 caracteres y no contener el antiguo marcador `change-me`. Si no cumple, el servidor arranca igual, porque `/health` debe responder, registra un error y `/auth/guest` responde 503. Nunca firma con un secreto débil.
5. **Límite de peticiones por minuto y por IP** en `/auth/guest`, con `@nestjs/throttler` y solo en esa ruta. Se configura con `GUEST_AUTH_LIMIT_PER_MINUTE`, y vale 10 por defecto y ante cualquier valor inválido. Las peticiones inválidas también cuentan.
6. **`trust proxy` vale 1,** para que el límite vea la IP real detrás del proxy de Render. **Revisado el 8 de noviembre de 2026:** en Render no basta (ver Consecuencias). Allí el límite usa la cabecera que nombra `CLIENT_IP_HEADER`, y `render.yaml` declara `cf-connecting-ip`. Sin esa variable, como en local y en los tests, sigue usando `req.ip`.

## Alternativas

- **Filas de invitado en la base o sesiones en el servidor:** permitirían revocar, pero añaden estado y dependen de la base para entrar. Una partida entre invitados no lo necesita.
- **Token opaco con firma propia:** obliga a escribir a mano lo que un JWT ya resuelve.
- **`@nestjs/jwt` 12:** se publica solo como ESM y el servidor compila a CommonJS. Se usa la línea 11, la de NestJS 11.
- **Abortar el arranque sin secreto:** dejaría sin `/health` a un servidor que funciona en lo demás. Además, la CI compila `AppModule` sin ese secreto.

## Consecuencias

- (+) Entrar no depende de ninguna base de datos.
- (+) La identidad se comprueba sin consultar nada, también en cada reconexión.
- (−) Un token no se puede revocar antes de que caduque. Solo se invalidan todos a la vez, cambiando el secreto.
- (−) Quien pierde su token, por ejemplo al borrar los datos del navegador, pierde su asiento: entra como otro invitado.
- (−) Una sesión que dure más de 24 horas necesita un token nuevo.
- (−) **Riesgo conocido: `POST /games` no tiene límite de creación.** Quien tenga un token válido puede crear partidas sin tope, y cada una es una fila en `games`. El contrato no define un 429 para esta ruta, y añadirlo es un cambio de `shared/` y de `docs/protocol.md`. El límite de `/auth/guest` frena la obtención de tokens, pero no el uso de uno ya emitido, que dura 24 horas.
- (−) **`trust proxy = 1` falló en Render el 8 de noviembre de 2026.** Desde una misma IP, sin cabeceras, el contador alternaba entre dos claves, y una cabecera `X-Forwarded-For` falsa lo reinició. Express toma la última entrada de esa cabecera, que en Render parece ser la de un nodo de Cloudflare: es una hipótesis coherente con lo observado. Render no documenta cuántos saltos hay, así que se descartó `trust proxy = 2`.
- (−) **Supuesto:** Cloudflare sigue delante de los servicios web de Render y escribe `CF-Connecting-IP`, sobrescribiendo la que envíe el cliente. Así lo dice un artículo de Render ([Host PocketBase on Render](https://render.com/articles/host-pocketbase-on-render)), no su documentación de referencia. Si Render cambiara eso, la cabecera podría falsearse o faltar. Si falta, el límite vuelve a `req.ip`. **Sin verificar tras el despliegue:** la prueba está en [docs/deploy.md](../deploy.md).
