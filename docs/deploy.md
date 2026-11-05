# Despliegue en la nube

Pone en línea el servidor (Render), las dos bases (Neon y Atlas) y la web (Vercel), todo en planes gratuitos. Se hace una vez; después, cada fusión a `main` se despliega sola.

**Regla:** las contraseñas y cadenas de conexión se escriben solo en los paneles de cada servicio. Nunca en el repositorio ni en un chat.

El orden importa: Render necesita las dos bases, Vercel necesita la URL de Render, y Render necesita al final la URL de Vercel.

## 1. Neon (Postgres)

1. Crea una cuenta en [neon.tech](https://neon.tech) y un proyecto llamado `chessspeak`, en la región **AWS US East (N. Virginia)**, la misma de Render.
2. En **Connect**, copia la cadena de conexión con **Connection pooling desactivado**: las migraciones de Prisma necesitan la conexión directa.
3. Guárdala para el paso 3 como `DATABASE_URL`. Debe terminar en `?sslmode=require`.

## 2. MongoDB Atlas

1. Crea una cuenta en [mongodb.com/atlas](https://www.mongodb.com/atlas) y un clúster **M0** en **AWS, N. Virginia (us-east-1)**.
2. En **Database Access**, crea un usuario `chessspeak-app` con contraseña generada y el rol **readWrite** solo sobre la base `chessspeak`.
3. En **Network Access**, añade `0.0.0.0/0`. Es necesario porque el plan gratuito de Render no tiene IP fija; se mitiga con el usuario de mínimos privilegios (`ARCHITECTURE.md`, sección 7).
4. En **Connect → Drivers**, copia la cadena e incluye el nombre de la base antes del `?`:
   ```
   mongodb+srv://chessspeak-app:<contraseña>@<clúster>.mongodb.net/chessspeak?retryWrites=true&w=majority
   ```
5. Guárdala para el paso 3 como `MONGO_URI`. Si la contraseña lleva símbolos, tienen que ir codificados para URL.

## 3. Render (servidor)

1. Crea una cuenta en [render.com](https://render.com) con GitHub y dale acceso al repositorio `TWC-FINE/ChesssPeak`.
2. **New → Blueprint**, elige el repositorio. Render lee `render.yaml`.
3. Te pedirá tres valores:
   - `DATABASE_URL`: la del paso 1.
   - `MONGO_URI`: la del paso 2.
   - `CORS_ORIGINS`: de momento `http://127.0.0.1:5500,http://localhost:5500`. Se completa en el paso 5.
4. Espera a que termine y copia la URL, parecida a `https://chessspeak-server.onrender.com`.
5. **Comprueba:** abre `<URL>/health`. Debe responder `"status":"ok"` con las dos bases en `up`. La primera petición puede decir `degraded`: recarga a los pocos segundos.

## 4. Vercel (web)

1. Crea una cuenta en [vercel.com](https://vercel.com) con GitHub e importa el repositorio.
2. **Root Directory:** déjalo en la raíz. Vercel lee `vercel.json`.
3. En **Environment Variables**, añade `PUBLIC_API_URL` con la URL de Render, sin barra final.
4. **Deploy** y copia la URL, parecida a `https://chessspeak.vercel.app`.

## 5. Conectar los dos

1. En Render → **Environment**, cambia `CORS_ORIGINS` a:
   ```
   https://<tu-web>.vercel.app,http://127.0.0.1:5500,http://localhost:5500
   ```
2. Guarda: Render reinicia el servidor.

## 6. Comprobación final

Abre la URL de Vercel, y en la consola del navegador (F12) ejecuta:

```js
await (await fetch(`${CS_CONFIG.PUBLIC_API_URL}/health`)).json()
```

Debe devolver `status: "ok"` sin error de CORS. La página debe mostrar los tres microfrontends.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `/health` tarda cerca de 1 minuto | Render gratuito se duerme tras un rato sin uso | Es normal. Hay que despertarlo antes de evaluar |
| `mongo: "down"` de forma permanente | Falta `0.0.0.0/0`, usuario o contraseña incorrectos, o símbolos sin codificar | Revisa el paso 2 |
| `postgres: "down"` de forma permanente | Cadena incorrecta | Revisa el paso 1 |
| El despliegue de Render falla en `migrate deploy` | Se usó la conexión con pooling | Usa la directa |
| Error de CORS en el navegador | `CORS_ORIGINS` no incluye la URL exacta de Vercel | Revisa el paso 5. Cada despliegue de vista previa de Vercel tiene otra URL: solo funciona la de producción |
| La web llama a una API vacía | Falta `PUBLIC_API_URL` en Vercel | Añádela y vuelve a desplegar: se aplica al compilar |

## Lo que esto no cubre

- **Whisper local desde la web pública:** el navegador puede bloquear la llamada a `127.0.0.1`. No está probado (ADR 5).
- **Socket.IO:** aún no existe. Cuando exista debe usar `corsOrigins()` de `server/src/deploy-config.ts`.
