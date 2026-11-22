# Guion de la demo (unos 10 minutos)

Para la demo en vivo de la entrega del 19 de noviembre de 2026, en **Edge**, con la web en local (`pnpm serve:web`) y el backend en Render. Cubre los criterios de aceptación de [SPEC.md](../SPEC.md), sección 6, y los requisitos R1–R8.

**Partida del guion:** un mate rápido, f3 · e5 · g4 · Dh4#. Cada media jugada demuestra una cosa distinta, y la partida termina sola, por mate: la web no tiene botón de abandonar.

**Antes de la demo hay que ensayar este guion entero** con las mismas laptops, micrófonos y red. Lo que no se haya ensayado no se muestra.

## 1. Preparación (30 minutos antes)

| Paso | Cómo | Comprobación |
|---|---|---|
| Despertar Render | Abrir <https://chessspeak-server.onrender.com/health> | Responde 200, con las dos bases en `up`. Tras dormir, la primera respuesta tardó 52,5 s el 8 de noviembre |
| Web en local contra Render | En `web/shell/.env`: `PUBLIC_API_URL=https://chessspeak-server.onrender.com` y `PUBLIC_CLOUD_AGENT_URL=http://127.0.0.1:8766`. Después, `pnpm build:web`. La sirve en el 5500 `demo-up.cmd` (fila del balanceo); con `demo-up -NoWeb`, `pnpm serve:web` como antes | <http://127.0.0.1:5500> carga los tres microfrontends |
| Dos jugadores | Dos ventanas de Edge, normal e InPrivate, o dos laptops. La sesión vive en `sessionStorage`, así que cada pestaña es un jugador | Cada ventana entra como invitado con un nombre distinto |
| Micrófonos | Diademas. Probar «e cuatro» en cada ventana | La flecha aparece y se cancela con «Cancelar» |
| Configuración local, **una sola vez** | Copiar `whisper-cloud/aws/demo.example.json` a `%LOCALAPPDATA%\ChessSpeak\demo.json`, fuera del repo, y escribir en ella la ruta de la `.pem` y las 2 IP elásticas. Con barras `/` en la ruta no hay que escapar nada | `demo-up` dice «Clave e IP leídas de la configuración local» |
| Balanceo en EC2, **unos 15 minutos antes** | En la consola de EC2 (`us-east-2`), **Iniciar** las 2 instancias. Las IP elásticas no cambian. Si la red no es la de casa (la sala o los datos del celular), cambiar antes la regla del puerto 22 a «Mi IP», que debe terminar en `/32`; nunca `0.0.0.0/0`. Después, **doble clic en `whisper-cloud/aws/demo-up.cmd`** (sección 5) | Arrancan los dos agentes, cada uno en su ventana: el del **8765**, en modo procesos, para «Whisper local» (el audio no sale del equipo), y el del **8766**, por los 2 túneles, para «Whisper en la nube (EC2)». Se abre <http://127.0.0.1:8766/lb/dashboard> con w1 y w2 activos. La web queda servida en el 5500, sin ventana, y Edge se abre en <http://127.0.0.1:5500> |
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
| 6:45–8:45 | Pasar al dashboard del agente **que apunta a EC2**, <http://127.0.0.1:8766/lb/dashboard>, que `demo-up` dejó abierto con w1 y w2 activos. El del 8765 sigue en marcha. En otra terminal, lanzar la carga contra el 8766 (sección 5). Con la carga en marcha, pulsar **«Aislar»** en w2. Mostrar que w1 sigue atendiendo y que no hay 502, 503 ni 504. Después, **«Devolver»** w2 | Whisper como servicio en 2 instancias EC2 de `us-east-2`, una por worker. El agente reparte por conexiones mínimas a través de 2 túneles SSH (ADR 12). Aislar una instancia no pierde peticiones: C4 se midió con 0 perdidas en 3 de 3 repeticiones. **Es una demostración del reparto entre 2 máquinas, no de velocidad:** cada clip tarda unos 11 s en EC2 y C1 no se cumple | R8 |
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
| **Edge bloquea `127.0.0.1:8765` o `:8766`** (aviso de red local) | Aceptar el permiso. La demo usa la web en local precisamente para evitarlo |
| **EC2** (una instancia no arranca, el túnel no conecta, la red bloquea SSH o `/health` no responde) | **Balanceo con los 3 contenedores locales:** `demo-up.ps1` pasa solo a ellos, detrás del agente del 8766, si EC2 no responde en 90 s; si no, `demo-down.ps1` y `demo-up.ps1 -LocalOnly` (sección 5). Decir que corre en un solo equipo. No reintentar EC2 en vivo |
| **Docker Desktop** | Balanceo con el pool por procesos: `LB_WORKERS=3`, que necesita Whisper descargado. El dashboard ofrece «Aislar» y también «Matar», que mata el proceso y deja que el pool lo relance |
| **Un worker de Whisper** (instancia o contenedor) | Es justo lo que se demuestra: el pool lo saca de la rotación, y «Devolver» le da otra ronda de reconexiones |
| **El profesor detiene una instancia EC2 en pleno uso** | **No tocar nada:** ni el agente ni los túneles. El dashboard muestra a ese worker fuera de rotación en unos segundos, y w1 sigue atendiendo. Al volver a «Iniciar» la instancia, el túnel y el worker vuelven solos gracias a la IP elástica. Qué se puede decir: en la [evidencia](evidence/t-stop-ec2/README.md), **0 peticiones perdidas en 7 de 7** al detener una instancia, con la petición en curso reintentada en w1. En las 7 corridas en AWS, F1 y F3 se cumplieron en 7 de 7: 0 perdidas y latencia máxima ≤ 25,2 s. F2 se anota sin umbral. F4 se cumplió en 6 de 7: w2 volvió en 21–27 s tras el aviso de «Iniciar», y la séptima no es verificable. Por esa séptima, T-stop en EC2 quedó «no se cumplen» (sección 10 de los criterios) |
| **Demostrar «Detener» nosotros** | Por la decisión de la sección 10, con un **contenedor local**, diciendo que corre en un solo equipo: con `demo-up.ps1 -LocalOnly` y la carga en marcha, `docker compose -f whisper-cloud/compose.local.yml stop w2`, y después `start w2`. Fase 2 local: 0 peticiones perdidas en 12 de 12 ([evidencia](evidence/t-stop-local/README.md)) |
| **Todo lo demás** | El video de respaldo |

## 5. Comandos

```powershell
# Unos 15 minutos antes, con las 2 instancias iniciadas: doble clic en whisper-cloud\aws\demo-up.cmd, o desde
# PowerShell lo mismo, sin cambiar la política de ejecución del equipo:
powershell -NoProfile -ExecutionPolicy Bypass -File .\whisper-cloud\aws\demo-up.ps1
# Lee la .pem y las 2 IP elásticas de %LOCALAPPDATA%\ChessSpeak\demo.json (o de -KeyPath y -HostIps) y arranca,
# cada uno en su ventana:
# - el agente del 8765, en modo procesos: «Whisper local», el audio no sale del equipo. Si ya hay uno, lo reutiliza;
# - un túnel con reconexión por instancia, y comprueba /health. La .pem nunca se muestra en pantalla;
# - el agente del 8766, apuntando a EC2, con los valores de C4 y el sondeo cada 2 s de la sección 8 de
#   docs/whisper-cloud-criteria.md: «Whisper en la nube (EC2)». Si EC2 no responde en 90 s, pasa solo al plan B local.
# Antes de abrir nada comprueba la web: para si falta web\dist\config.js (no compila: pnpm build:web) o si el 5500 está
# ocupado por algo que no es esta web, y avisa si config.js no tiene PUBLIC_API_URL, PUBLIC_AGENT_URL o
# PUBLIC_CLOUD_AGENT_URL, o si el build es anterior a los últimos cambios. Al final sirve web\dist en el 5500 con node,
# sin ventana (log en %TEMP%\chessspeak-web.log), y abre el dashboard del 8766 y Edge en http://127.0.0.1:5500.
# Solo los túneles, para comprobarlos antes: añadir -TunnelsOnly. Sin el agente del 8765: -NoLocalAgent. Sin la web,
# como antes de servirla demo-up (con pnpm serve:web aparte): -NoWeb. Sin abrir el navegador: -NoBrowser

# Carga para el dashboard, en otra terminal, contra el agente del 8766. Usa un WAV de spike/recordings, que no está
# en el repo. Con unos 11 s por clip en EC2, 10 peticiones caben en el tiempo del guion
pnpm --filter @chessspeak/local-agent load --url http://127.0.0.1:8766/transcribe --steps 2 --requests 10 --label demo

# Al terminar: doble clic en whisper-cloud\aws\demo-down.cmd. Cierra los dos agentes (el del 8765 solo si lo arrancó
# demo-up), los túneles, la web del 5500 (solo si la arrancó demo-up) y, si los arrancó, los contenedores. Después, en la consola de EC2, «Detener» (no «Terminar»)
# las 2 instancias
.\whisper-cloud\aws\demo-down.ps1

# Plan B directamente: los 3 contenedores locales (compose up --no-build) detrás del agente del 8766, y el dashboard
.\whisper-cloud\aws\demo-up.ps1 -LocalOnly
pnpm --filter @chessspeak/local-agent load --url http://127.0.0.1:8766/transcribe --steps 2 --requests 20 --label demo

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
