# Despliegue en la nube

Pone en línea el servidor (Render), las dos bases (Neon y Atlas) y la web (Vercel), todo en planes gratuitos. Se hace una vez; después, cada fusión a `main` se despliega sola.

**Regla:** las contraseñas y cadenas de conexión se escriben solo en los paneles de cada servicio. Nunca en el repositorio ni en un chat.

## Cuentas

Las crea el responsable del repo. Con GitHub basta para entrar en Render y en Vercel.

- [ ] **Neon:** proyecto `chessspeak`, para Postgres.
- [ ] **MongoDB Atlas:** clúster M0, para Mongo.
- [ ] **Render:** con acceso al repositorio `TWC-FINE/ChesssPeak`, para el servidor.
- [ ] **Vercel:** con acceso al mismo repositorio, para la web.

## Orden

1. **Backend:** Neon, Atlas y Render (pasos 1 a 3). Render necesita las dos bases.
2. **Compilar la web con la URL del backend:** se define `PUBLIC_API_URL` en Vercel (paso 4). Se aplica al compilar.
3. **Subir la web:** Vercel la publica (paso 4).
4. **Añadir el origen de la web a `CORS_ORIGINS`** en Render (paso 5). Sin esto, el navegador bloquea las llamadas.

## 1. Neon (Postgres)

1. Crea un proyecto llamado `chessspeak`, en la región **AWS US East (N. Virginia)**, la misma de Render.
2. En **Connect**, copia la cadena de conexión con **Connection pooling desactivado**: las migraciones de Prisma necesitan la conexión directa.
3. Guárdala para el paso 3 como `DATABASE_URL`. Debe terminar en `?sslmode=require`.

## 2. MongoDB Atlas

1. Crea un clúster **M0** en **AWS, N. Virginia (us-east-1)**.
2. En **Database Access**, crea un usuario `chessspeak-app` con una contraseña **larga y aleatoria**, generada por Atlas, y el rol **readWrite** solo sobre la base `chessspeak`.
3. En **Network Access**, añade `0.0.0.0/0`. Es un riesgo aceptado: ver [Riesgos](#riesgos).
4. En **Connect → Drivers**, copia la cadena e incluye el nombre de la base antes del `?`:
   ```
   mongodb+srv://chessspeak-app:<contraseña>@<clúster>.mongodb.net/chessspeak?retryWrites=true&w=majority
   ```
5. Guárdala para el paso 3 como `MONGO_URI`. Si la contraseña lleva símbolos, tienen que ir codificados para URL.

## 3. Render (servidor)

1. **New → Blueprint**, elige el repositorio. Render lee `render.yaml`, que ya declara la versión de Node, `MOVE_WORKERS=0` y los tiempos de espera.
2. Te pedirá tres valores:
   - `DATABASE_URL`: la del paso 1.
   - `MONGO_URI`: la del paso 2.
   - `CORS_ORIGINS`: de momento `http://127.0.0.1:5500,http://localhost:5500`. Se completa en el paso 5.
3. Espera a que termine y copia la URL, parecida a `https://chessspeak-server.onrender.com`.
4. **Comprueba:**
   - `<URL>/health/live` responde `"status":"live"`. Es la ruta que sondea Render, y no consulta las bases.
   - `<URL>/health` responde `"status":"ok"` con las dos bases en `up`. La primera petición puede decir `degraded`: recarga a los pocos segundos.

## 4. Vercel (web)

1. Importa el repositorio. **Root Directory:** déjalo en la raíz. Vercel lee `vercel.json`.
2. En **Environment Variables**:
   - Añade `PUBLIC_API_URL` con la URL de Render, sin barra final.
   - El selector de Whisper local queda visible en Vercel a propósito: sin `PUBLIC_AGENT_URL` se usa `http://127.0.0.1:8765`. **Supuesto sin probar:** que definirla vacía lo oculte; no está comprobado que Vercel admita un valor vacío.
   - Comprueba que está marcada **Enable access to System Environment Variables**. Sin ella no existe `VERCEL=1`, y la compilación no detectaría que falta `PUBLIC_API_URL`.
3. **Deploy** y copia la URL, parecida a `https://chessspeak.vercel.app`.

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

### Comprobar el límite de `/auth/guest`

**El 8 de noviembre de 2026, `trust proxy = 1` falló en Render** (ADR 8): el servidor veía la IP de un proxy, no la del cliente. Desde entonces el límite usa `CF-Connecting-IP`, que `render.yaml` declara en `CLIENT_IP_HEADER`. **Supuesto:** Cloudflare sigue delante de Render y sobrescribe esa cabecera.

**Se prueba tras cada cambio en esto.** Avisa antes a quien use la web desde la misma red: cada petición gasta una de las 10 entradas por minuto de esa IP. Los pasos 1 y 2 gastan 6, sin llegar al límite. El contador se ve en esta cabecera:

```bash
curl -si -X POST https://TU-SERVICIO.onrender.com/auth/guest -H 'Content-Type: application/json' -d '{"displayName":"Prueba"}' | grep -i x-ratelimit-remaining
```

1. **Misma IP, sin cabeceras:** cuatro peticiones seguidas deben dar 9, 8, 7 y 6. Si el contador salta, el servidor no ve la IP del cliente.
2. **Cabeceras falsas:** repítelo con `-H 'X-Forwarded-For: 198.51.100.7, 1.2.3.4'` y con `-H 'CF-Connecting-IP: 198.51.100.8'`. El contador debe seguir bajando. Si empieza de nuevo, un cliente podría saltarse el límite.
3. **Clientes distintos:** una vez desde otra red, por ejemplo con los datos del celular. Allí el contador debe empezar de nuevo. Si sigue bajando, todos los clientes comparten el mismo límite.

Si falla, no hay otra corrección prevista: se documenta la limitación, y el límite se ajusta con `GUEST_AUTH_LIMIT_PER_MINUTE`.

## Riesgos

### HTTPS, obligatorio para el micrófono

El navegador solo da acceso al micrófono en un contexto seguro: HTTPS, o `http://127.0.0.1` y `http://localhost` en local. La URL `vercel.app` tiene HTTPS. **Cualquier otro dominio sin HTTPS deja la web sin voz.**

### Web pública que llama a Whisper en `127.0.0.1`

Una página publicada puede no tener permiso para llamar al agente local. **Chrome pide permiso de red local desde la versión 142** ([documentación](https://developer.chrome.com/blog/local-network-access)). **En Edge no está comprobado:** hay que probarlo.

**Prueba en Edge:**

1. Arranca `local-agent` con el origen de la web en la lista, en `.env`:
   ```
   AGENT_ALLOWED_ORIGINS=https://<tu-web>.vercel.app,http://127.0.0.1:5500,http://localhost:5500
   ```
2. Abre la URL de Vercel en Edge, y en la consola (F12) ejecuta:
   ```js
   await (await fetch('http://127.0.0.1:8765/health')).json()
   ```

| Resultado | Qué significa | Qué hacer |
|---|---|---|
| Devuelve el estado del agente | Funciona desde la web pública | Anotar la versión de Edge |
| Edge pide permiso | Depende de lo que responda quien abra la web | Permitirlo, y avisar de ello en la interfaz y en el README |
| `Failed to fetch` | Bloqueado, por el navegador o por CORS | Leer el mensaje de la consola y revisar `AGENT_ALLOWED_ORIGINS`. Si sigue bloqueado, Whisper se usa con la web en local (`pnpm serve:web`) |

La web solo consulta al agente al abrir el selector de reconocedor, para no provocar ese permiso a quien no va a usar Whisper. La demo sirve la web en local por este motivo. El reconocedor por defecto, Web Speech, no depende del agente.

### `0.0.0.0/0` en Atlas: riesgo aceptado

Cualquier dirección de internet puede intentar conectarse a la base. **Se acepta** porque el plan gratuito de Render no tiene IP fija. Lo mitigan la contraseña larga y aleatoria y un usuario con permisos solo sobre la base `chessspeak` (`ARCHITECTURE.md`, sección 7). Si la contraseña se filtra, se cambia en Atlas y en Render.

### Otros límites

- **Servidor gratuito:** Render lo duerme tras un rato sin uso, así que hay que despertarlo antes de evaluar.
- **Tiempos de `/health`:** `HEALTH_PROBE_TIMEOUT_MS` en `render.yaml` es un valor de trabajo, sin medir contra Neon ni Atlas.
- **Sin medir:** la memoria del servidor en Render. Por eso `MOVE_WORKERS` vale 0.

## Dominio: supuesto

`chessspeak.dpdns.org` está en espera del profesor, y **no se sabe qué es el hosting ni qué permite**. **Mínimo garantizado: la URL `vercel.app`.** No se registra otro dominio ni se cambian los nameservers.

Cuando `nslookup -type=NS chessspeak.dpdns.org` deje de responder `Server failed`, el camino depende de lo que permita el hosting:

| Si el hosting permite | Qué se haría (supuesto) |
|---|---|
| Administrar registros DNS | Añadir el dominio en Vercel y crear allí el registro que Vercel indique |
| Solo alojar archivos | Subir `web/dist`, compilada con `PUBLIC_API_URL`, si tiene HTTPS |
| Ninguna de las dos, o sin HTTPS | Quedarse en `vercel.app` |

En los dos primeros casos hay que añadir el origin del dominio a `CORS_ORIGINS`, repetir la comprobación del paso 6 y repetir la prueba de Whisper.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `/health` tarda cerca de 1 minuto | Render gratuito se duerme tras un rato sin uso | Es normal. Hay que despertarlo antes de evaluar |
| `mongo: "down"` de forma permanente | Falta `0.0.0.0/0`, usuario o contraseña incorrectos, o símbolos sin codificar | Revisa el paso 2 |
| `postgres: "down"` de forma permanente | Cadena incorrecta | Revisa el paso 1 |
| El despliegue de Render falla en `migrate deploy` | Se usó la conexión con pooling | Usa la directa |
| Error de CORS en el navegador | `CORS_ORIGINS` no incluye la URL exacta de Vercel | Revisa el paso 5. Cada despliegue de vista previa de Vercel tiene otra URL: solo funciona la de producción |
| La compilación de Vercel falla con `falta PUBLIC_API_URL` | Falta la variable en Vercel | Añádela y vuelve a desplegar: se aplica al compilar |
| La web publicada dice que falta `PUBLIC_API_URL` | No se detectó `VERCEL=1` y faltaba la variable | Revisa las dos opciones del paso 4 |
