# ADR 8 — Invitados con token firmado

- **Estado:** Aceptado (5 de noviembre de 2026).
- **Relacionado:** [SPEC.md](../../SPEC.md) RF1 · [docs/protocol.md](../protocol.md) §2 · ADR 1

## Contexto

Quien juega entra sin registrarse (RF1), y el servidor debe decidir siempre la identidad. Esa identidad tiene que sobrevivir a una reconexión, porque `GameRoom` asigna los asientos por un id estable. El login queda fuera del plan.

## Decisión

1. **`POST /auth/guest` entrega un JWT firmado** con HS256 y una validez de 24 horas. Lleva `kind`, `name` y, en `sub`, un `guestId` generado por el servidor. No hay fila en `users`: el token es la identidad.
2. **El cuerpo se valida con el esquema estricto de `shared/`,** el mismo que usan los clientes, así que un cliente no puede enviar su propia identidad.
3. **`GuestTokenService.verify` solo acepta HS256 y una identidad de invitado válida.** Es lo que usarán el handshake del socket y `POST /games`.
4. **El secreto no tiene valor de respaldo.** Debe tener al menos 32 caracteres y no contener el marcador de `.env.example`. Si no cumple, el servidor arranca igual, porque `/health` debe responder, registra un error y `/auth/guest` responde 503. Nunca firma con un secreto débil.
5. **Límite de 10 peticiones por minuto y por IP** en `/auth/guest`, con `@nestjs/throttler` y solo en esa ruta. Las peticiones inválidas también cuentan.
6. **`trust proxy` vale 1,** para que el límite vea la IP real detrás del proxy de Render.

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
- (−) **Sin verificar:** que `trust proxy = 1` sea el valor correcto en Render, porque aún no hay despliegue. Si no lo es, varios clientes podrían compartir el mismo límite. Hay que comprobarlo al desplegar.
