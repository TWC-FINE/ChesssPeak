# Guion de la demo (unos 10 minutos)

Para la demo en vivo de la entrega del 19 de noviembre de 2026, en **Edge**, con la web en local (`pnpm serve:web`) y el backend en Render. Cubre los criterios de aceptación de [SPEC.md](../SPEC.md), sección 6, y los requisitos R1–R8.

**Partida del guion:** un mate rápido, f3 · e5 · g4 · Dh4#. Cada media jugada demuestra una cosa distinta, y la partida termina sola, por mate: la web no tiene botón de abandonar.

**Antes de la demo hay que ensayar este guion entero** con las mismas laptops, micrófonos y red. Lo que no se haya ensayado no se muestra.

## 1. Preparación (30 minutos antes)

| Paso | Cómo | Comprobación |
|---|---|---|
| Despertar Render | Abrir <https://chessspeak-server.onrender.com/health> | Responde 200, con las dos bases en `up`. Tras dormir, la primera respuesta tardó 52,5 s el 8 de noviembre |
| Web en local contra Render | En `web/shell/.env`: `PUBLIC_API_URL=https://chessspeak-server.onrender.com`. Después, `pnpm build:web` y `pnpm serve:web` | <http://127.0.0.1:5500> carga los tres microfrontends |
| Dos jugadores | Dos ventanas de Edge, normal e InPrivate, o dos laptops. La sesión vive en `sessionStorage`, así que cada pestaña es un jugador | Cada ventana entra como invitado con un nombre distinto |
| Micrófonos | Diademas. Probar «e cuatro» en cada ventana | La flecha aparece y se cancela con «Cancelar» |
| Whisper local | Arrancar el agente **en modo procesos**, sin `WHISPER_URLS` (sección 5). Hasta el minuto 6:45 la demo usa este agente, así que el audio de Whisper no sale del equipo | <http://127.0.0.1:8765/lb/dashboard> muestra los workers locales activos |
| Balanceo en EC2, **unos 15 minutos antes** | En la consola de EC2 (`us-east-2`), **Iniciar** las 2 instancias. **Copiar sus IP públicas nuevas:** cambian cada vez que arrancan. Si la red no es la de casa (la sala o los datos del celular), cambiar antes la regla del puerto 22 a «Mi IP», que debe terminar en `/32`; nunca `0.0.0.0/0`. Abrir los 2 túneles (sección 5) | Los 2 túneles abiertos. `http://127.0.0.1:18201/health` y `http://127.0.0.1:18202/health` responden 200. El contenedor arranca solo con la instancia |
| Plan B del balanceo | Docker Desktop encendido y la imagen de los 3 contenedores ya construida, **sin arrancarlos** | `docker images` muestra `chessspeak-whisper:small-d1be6fd` |
| Datos | Pestañas ya abiertas y con sesión iniciada: Data Explorer de Atlas (`voice_attempts` y `game_moves`) y SQL Editor de Neon (`games`) | **No mostrar ninguna cadena de conexión ni contraseña en pantalla** |
| Respaldo | El video de respaldo, a mano y probado | Se reproduce sin conexión |

## 2. Guion minuto a minuto

| Minuto | Qué se hace | Qué se dice | Requisito |
|---|---|---|---|
| 0:00–1:00 | Mostrar `/health` de Render y la web abierta en las dos ventanas | Arquitectura en una frase: monolito modular NestJS en Render, Postgres en Neon, Mongo en Atlas, y tres microfrontends que hablan por eventos `cs:*` | R1, R5, R7 |
| 1:00–2:00 | Ventana A: «Entrar como invitado» → «Crear partida» (blancas). Copiar el «Enlace para el otro jugador» y abrirlo en la ventana B | La partida va por un único socket de Socket.IO, que abre el shell | R3 |
| 2:00–3:30 | A, con Web Speech: pulsar, decir **«efe tres»**, soltar. Aparece la flecha → «Sí, jugar». B, con Web Speech: **«e cinco»** → confirmar | Hay 400 ms de espera tras soltar. La frase se resuelve contra las jugadas legales y **la confirmación es obligatoria**: nada se juega solo | R4, criterio 1 |
| 3:30–4:00 | A dice algo que no es una jugada, por ejemplo «hola», o una frase ambigua | No se mueve ninguna pieza: el parser responde `nomatch` o `ambiguous` y pide repetir | Criterio 4 |
| 4:00–5:00 | **Recargar la ventana A** a mitad de partida | La partida se reconstruye desde Mongo, con las jugadas y el turno | Criterio 3 |
| 5:00–6:00 | A cambia el reconocedor a **Whisper local** y dice **«ge cuatro»** → confirmar | Whisper corre en el equipo, en `local-agent` (`127.0.0.1:8765`), y el audio no sale de la máquina. Tarda más que Web Speech | R2, criterio 2 |
| 6:00–6:45 | B, con Web Speech: **«dama hache cuatro»** → confirmar. **Mate** | El servidor valida cada jugada en UCI y detecta el fin de partida. **El servidor no sabe nada de voz** | Criterio 1 |
| 6:45–8:45 | Parar el agente (Ctrl+C) y arrancarlo **apuntando a EC2** (sección 5). Abrir `/lb/dashboard`: w1 y w2 activos. En otra terminal, lanzar la carga. Con la carga en marcha, pulsar **«Aislar»** en w2. Mostrar que w1 sigue atendiendo y que no hay 502, 503 ni 504. Después, **«Devolver»** w2 | Whisper como servicio en 2 instancias EC2 de `us-east-2`, una por worker. El agente reparte por conexiones mínimas a través de 2 túneles SSH (ADR 12). Aislar una instancia no pierde peticiones: C4 se midió con 0 perdidas en 3 de 3 repeticiones. **Es una demostración del reparto entre 2 máquinas, no de velocidad:** cada clip tarda unos 11 s en EC2 y C1 no se cumple | R8 |
| 8:45–9:30 | Atlas: los últimos `voice_attempts` (`recognizer`, `transcript`, `outcome`, `accepted`, `latency.totalMs`) y `game_moves` de la partida. Neon: la consulta de la sección 5 | Telemetría por intento, sin audio; `player` lo pone el servidor. Dos bases: partidas en Postgres, y jugadas y telemetría en Mongo | R5, criterio 5 |
| 9:30–10:00 | Cierre: repo público con CI en verde, ADR y limitaciones | Limitaciones, sin rodeos: una sola voz, y EC2 con el balanceo demostrado (C4) pero la latencia por encima del umbral (C1) | R6 |

**Versión corta, unos 5 minutos:** minutos 1:00–3:30, después 5:00–6:45 y por último la parte del dashboard sin la carga, aislando w2 en reposo.

## 3. Frases de la partida

| Media jugada | Quién | Reconocedor | Frase | Jugada |
|---|---|---|---|---|
| 1 | Blancas (A) | Web Speech | «efe tres» | f2-f3 |
| 1… | Negras (B) | Web Speech | «e cinco» | e7-e5 |
| 2 | Blancas (A) | Whisper local | «ge cuatro» | g2-g4 |
| 2… | Negras (B) | Web Speech | «dama hache cuatro» | Dd8-h4# |

Si el reconocedor falla en una frase, se repite. La confirmación evita que se juegue algo erróneo. Si vuelve a fallar, se usa la caja de texto (plan B).

## 4. Plan B

| Si falla… | Qué se hace |
|---|---|
| **Internet de la sala** | Datos del celular. Si tampoco hay, **todo en local:** `docker compose up -d`, el servidor con `pnpm --filter @chessspeak/server start` y la web con `PUBLIC_API_URL=http://127.0.0.1:3000` (README, «Puesta en marcha»). **Web Speech necesita internet:** sin red, se juega con Whisper local o con la caja de texto |
| **Render no despierta o va lento** | Esperar a `/health` hasta 1 minuto. Si no responde, pasar a todo en local, como en la fila anterior |
| **El micrófono** | La caja de texto («Enviar») sigue el mismo camino: parser, flecha y «Sí, jugar» |
| **Web Speech** (sin reconocer, o el navegador lo bloquea) | Cambiar el reconocedor a Whisper local o usar la caja de texto |
| **Edge bloquea `127.0.0.1:8765`** (aviso de red local) | Aceptar el permiso. La demo usa la web en local precisamente para evitarlo |
| **EC2** (una instancia no arranca, el túnel no conecta, la red bloquea SSH o `/health` no responde) | **Balanceo con los 3 contenedores locales:** parar los túneles y el agente, `docker compose -f whisper-cloud/compose.local.yml up -d --no-build` y el agente con las 3 URL locales (sección 5). Decir que corre en un solo equipo. No reintentar EC2 en vivo |
| **Docker Desktop** | Balanceo con el pool por procesos: `LB_WORKERS=3`, que necesita Whisper descargado. El dashboard ofrece «Aislar» y también «Matar», que mata el proceso y deja que el pool lo relance |
| **Un worker de Whisper** (instancia o contenedor) | Es justo lo que se demuestra: el pool lo saca de la rotación, y «Devolver» le da otra ronda de reconexiones |
| **Todo lo demás** | El video de respaldo |

## 5. Comandos

```powershell
# Hasta el minuto 6:45: el agente en modo procesos (Whisper local; el audio no sale del equipo)
Remove-Item Env:WHISPER_URLS -ErrorAction SilentlyContinue
pnpm --filter @chessspeak/local-agent start

# EC2, unos 15 minutos antes: un túnel por instancia, cada uno en su ventana, con las IP nuevas.
# La clave .pem está fuera del repo; nunca se muestra en pantalla
.\whisper-cloud\aws\tunnel.ps1 -HostIp <IP-1> -KeyPath <ruta del .pem> -LocalPort 18201
.\whisper-cloud\aws\tunnel.ps1 -HostIp <IP-2> -KeyPath <ruta del .pem> -LocalPort 18202

# Minuto 6:45: Ctrl+C en el agente y arrancarlo apuntando a EC2 (los mismos valores que en C4)
$env:WHISPER_URLS = "http://127.0.0.1:18201,http://127.0.0.1:18202"
$env:LB_TIMEOUT_MS = "45000"; $env:LB_PROBE_INTERVAL_MS = "15000"
pnpm --filter @chessspeak/local-agent start

# Carga para el dashboard, en otra terminal. Usa un WAV de spike/recordings, que no está en el repo.
# Con unos 11 s por clip en EC2, 10 peticiones caben en el tiempo del guion
pnpm --filter @chessspeak/local-agent load --steps 2 --requests 10 --label demo

# Al terminar: Ctrl+C en el agente y en los 2 túneles, y en la consola de EC2 «Detener» (no «Terminar») las 2 instancias

# Plan B si falla EC2: los 3 contenedores locales
Remove-Item Env:LB_TIMEOUT_MS, Env:LB_PROBE_INTERVAL_MS -ErrorAction SilentlyContinue
docker compose -f whisper-cloud/compose.local.yml up -d --no-build
$env:WHISPER_URLS = "http://127.0.0.1:18101,http://127.0.0.1:18102,http://127.0.0.1:18103"
pnpm --filter @chessspeak/local-agent start
pnpm --filter @chessspeak/local-agent load --steps 2 --requests 20 --label demo
docker compose -f whisper-cloud/compose.local.yml down        # al terminar

# Salida si falla Docker: pool por procesos
$env:LB_WORKERS = "3"; Remove-Item Env:WHISPER_URLS -ErrorAction SilentlyContinue
pnpm --filter @chessspeak/local-agent start
```

**Al terminar la demo, detener las 2 instancias** en la consola de EC2 y comprobar que figuran como «Detenida». Encendidas cuestan unos 0,18 USD por hora entre las dos; detenidas solo se cobran los volúmenes. Se terminan después de la entrega (sección 7 de [`whisper-cloud/aws/README.md`](../whisper-cloud/aws/README.md)).

Consulta para el SQL Editor de Neon:

```sql
select id, status, result, termination, white_name, black_name, created_at, finished_at
from games
order by created_at desc
limit 5;
```

En Atlas, colección `voice_attempts`, filtro `{ gameId: "<id de la partida>" }`, ordenado por `createdAt` descendente.

## 6. Qué no se afirma en la demo

- **Que la voz acierta siempre.** En el spike, Web Speech con 400 ms acertó el 87,2 %, con una sola voz: puede fallar 1 de cada 8 frases. La confirmación existe por eso.
- **Que el balanceo da más rendimiento.** No se demostró. Lo medido es que aislar un worker no pierde peticiones, con 3 contenedores en un solo equipo y con 2 instancias EC2.
- **Que Whisper en la nube sirve para jugar.** En EC2, el p95 de la peor repetición fue de 13,59 s, y el umbral es 7,5 s (C1). Lo que sí se demostró es el reparto entre 2 instancias sin perder peticiones (C4).
- **Que la validación con otra voz está hecha,** salvo que `docs/quality.md` ya lo registre.
