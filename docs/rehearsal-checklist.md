# Checklist del ensayo y de la presentación

Para el **ensayo del lunes 23 de noviembre de 2026** y la **presentación del martes 24 a las 19:00** (UTC−5). Complementa al [guion de la demo](demo-script.md), que dice qué se hace en cada minuto. Esta lista dice qué se prepara, cuándo, y qué hacer si algo falla.

**Requisito:** que estén fusionados #87 (criterio de la sección 11), #88 (la opción «Whisper en la nube (EC2)» en la página) y #89 (los dos agentes y `demo-up.cmd`). Sin ellos, vale el procedimiento anterior del guion.

**Sin probar todavía `[S]`:**
- los túneles reales leídos de `demo.json`;
- el plan B con contenedores en el 8766.

Los dos se comprueban el lunes, en S3 y S4 de la [sección 11 de los criterios](whisper-cloud-criteria.md).

## 0. Una sola vez, antes del lunes

| Hecho | Qué | Cómo se comprueba |
|---|---|---|
| ☐ | **Configuración local:** copiar `whisper-cloud/aws/demo.example.json` a `%LOCALAPPDATA%\ChessSpeak\demo.json` y escribir la ruta de la `.pem` y las 2 IP elásticas. **Usar `/` en la ruta:** con `\`, el archivo no es JSON válido | `Test-Path $env:LOCALAPPDATA\ChessSpeak\demo.json` da `True`. Cuidado con que el Bloc de notas no lo guarde como `demo.json.txt` |
| ☐ | **Web:** en `web/shell/.env`, `PUBLIC_API_URL=https://chessspeak-server.onrender.com` y `PUBLIC_CLOUD_AGENT_URL=http://127.0.0.1:8766`. Después, `pnpm build:web`. `demo-up` no compila la web por su cuenta | `web/dist/config.js` contiene `127.0.0.1:8766`. Si no, `demo-up` lo avisa al empezar, igual que un `PUBLIC_API_URL` vacío o local y un build anterior a los últimos cambios. Si falta `web/dist/config.js`, se para antes de abrir los túneles |
| ☐ | **Imagen del plan B** construida | Con Docker encendido, `docker images` muestra `chessspeak-whisper:small-d1be6fd` |
| ☐ | **Whisper local** instalado (`.env` con `WHISPER_SERVER_PATH` y `WHISPER_MODEL_SMALL`) | El agente del 8765 arranca sin error |
| ☐ | **No actualizar Edge** entre el ensayo y la presentación | Se anota la versión el lunes |

## 1. Ensayo del lunes 23 (unos 90 minutos)

El ensayo **es la prueba de humo de la sección 11**, más una pasada completa del guion. Se anota la hora de cada paso.

| Hora | Hecho | Qué |
|---|---|---|
| L+0 | ☐ | **Docker encendido**, porque S4 lo necesita, y anotarlo. VPN apagada. Despertar Render: <https://chessspeak-server.onrender.com/health>, con hasta 1 minuto de espera (la primera respuesta tardó 52,5 s el 8 de noviembre) |
| L+5 | ☐ | En la consola de EC2 (`us-east-2`): **Iniciar** las 2 instancias. Si la red no es la de casa, cambiar la regla del puerto 22 a «Mi IP», que debe terminar en `/32`; nunca `0.0.0.0/0` |
| L+10 | ☐ | **Esperar al menos 3 minutos tras «Iniciar»** y hacer doble clic en `whisper-cloud/aws/demo-up.cmd`. Tiene que decir «Clave e IP leídas de la configuración local», «Las 2 instancias responden», «Whisper local: listo» y «Web: http://127.0.0.1:5500/». Sirve la web sin ventana y abre Edge en ella; ya no hace falta `pnpm serve:web`. Si las instancias se inician tarde, `demo-up` pasa al plan B a los 90 s (ver sección 3) |
| L+15 | ☐ | Dos ventanas de Edge en <http://127.0.0.1:5500>, normal (la que abrió `demo-up`) e InPrivate, cada una como invitado. **S0:** abrir el selector. Tienen que aparecer las 3 opciones y «(disponible)» en las dos de Whisper. **Anotar si Edge pide permiso de red local** |
| L+20 | ☐ | **S1–S3:** una partida por modo, con «e cuatro», «e cinco» y «caballo efe tres», tomando la instantánea de `/lb/stats` antes y después (comando en la sección 11). En S3 la voz va a EC2: dar el OK y anotar la hora |
| L+40 | ☐ | **Ensayo de «detener en vivo»,** informativo; la evidencia es la de la sección 10. Con la carga contra el 8766 en marcha, detener la instancia de w2 en la consola y **no tocar nada más**. Ver en el dashboard que w2 sale de la rotación y que w1 sigue atendiendo. Pulsar «Iniciar» y anotar la hora. w2 debería volver solo en unos 21–27 s desde el aviso, como en 6 de las 7 corridas medidas |
| L+55 | ☐ | **S4–S5:** `demo-down.cmd` y las 2 instancias en «Detenida». Después, `demo-up.cmd`: tiene que pasar al plan B a los 90 s. Repetir las 3 frases con «Whisper en la nube (EC2)». Cerrar la ventana del 8766 y comprobar que esa opción dice «(no responde)» y que Web Speech y Whisper local siguen |
| L+65 | ☐ | **Pasada completa del guion** (unos 10 min), cronometrada, con las instancias otra vez encendidas si queda tiempo; si no, con el plan B |
| L+85 | ☐ | `demo-down.cmd`. Las 2 instancias en «Detenida» en la consola. **Apagar Docker** y anotar la hora. Llevar la evidencia de la sección 11 a un PR |

## 2. Presentación del martes 24, 19:00

| Hora | Hecho | Qué |
|---|---|---|
| 18:00 | ☐ | Portátil enchufado, diademas y micrófonos, VPN apagada, aplicaciones pesadas cerradas. Abrir el video de respaldo y comprobar que se reproduce sin conexión |
| 18:15 | ☐ | **Render:** abrir `/health` y esperar 200 con las dos bases en `up`. **Docker Desktop encendido**, solo para el plan B, sin arrancar contenedores |
| 18:25 | ☐ | **EC2:** Iniciar las 2 instancias. Con la red de la sala, la regla del puerto 22 en «Mi IP» (`/32`). **Si la red bloquea el 22, pasar ya a los datos del celular** y volver a poner «Mi IP» |
| 18:30 | ☐ | Al menos 3 min después de «Iniciar», doble clic en `demo-up.cmd`, que sirve también la web y abre Edge. Comprobar «Las 2 instancias responden», w1 y w2 activos en <http://127.0.0.1:8766/lb/dashboard>, «Whisper local: listo» y que no haya ningún «AVISO» de la web |
| 18:40 | ☐ | Edge, dos ventanas con sesión. Selector con las 3 opciones «(disponible)». **Una** frase por modo, cancelando la flecha. Si sale el aviso de red local, aceptarlo |
| 18:50 | ☐ | Abrir las pestañas de Atlas y Neon, sin mostrar cadenas de conexión. Dejar escrito en una terminal el comando de carga contra el 8766 (sección 5 del guion). **Minimizar las ventanas de túnel:** muestran la IP elástica |
| 19:00 | ☐ | El [guion](demo-script.md). Si el profesor detiene una instancia: **no tocar nada** (sección 4 del guion) |
| Al terminar | ☐ | `demo-down.cmd`. Las 2 instancias en «Detenida» en la consola. Apagar Docker. Las IP elásticas se cobran hasta liberarlas, después de la entrega |

## 3. Plan B por fallo

| Si… | Qué se hace | Qué se dice |
|---|---|---|
| **Render no responde en 1 minuto** | Todo en local, como en la sección 4 del guion | «El backend corre ahora en este equipo» |
| **`demo-up` dice «EC2 no responde»:** una instancia no arranca, el túnel no conecta o se iniciaron tarde | Pasa solo al plan B: los 3 contenedores detrás del 8766. No reintentar EC2 en vivo | «El balanceo corre ahora en 3 contenedores de este equipo, no en 2 máquinas» |
| **La red de la sala bloquea SSH** | Datos del celular, «Mi IP» otra vez, y después `demo-down.cmd` y `demo-up.cmd`. Si no hay tiempo, el plan B | Igual que la fila anterior |
| **`demo-up` dice «Docker no responde»** (sin EC2 y sin Docker) | **Plan C, sin probar `[S]`:** `$env:AGENT_PORT='8766'; $env:LB_WORKERS='3'; pnpm --filter @chessspeak/local-agent start` levanta el pool por procesos en el 8766. Si falla, el video | «Son 3 procesos en este equipo» |
| **La página no ofrece «Whisper en la nube (EC2)»** | Falta `PUBLIC_CLOUD_AGENT_URL` en `web/shell/.env`: añadirla, ejecutar `pnpm build:web` y recargar. Son unos 2 minutos | — |
| **La nube dice «(no responde)»** | Se cerró o cayó la ventana del 8766: `demo-down.cmd` y `demo-up.cmd` | — |
| **«Whisper local» dice «(no responde)»** | Mirar la ventana del 8765: falta Whisper en `.env` o el puerto está ocupado. Seguir con Web Speech y con la nube | «Whisper local es la alternativa; el reconocedor por defecto es Web Speech» |
| **`demo-up` dice que el 8766 está ocupado** | `demo-down.cmd` y otra vez `demo-up.cmd` | — |
| **`demo-up` dice que el 5500 está ocupado por otra cosa, o que falta `web\dist`** | Para antes de abrir los túneles. Cerrar Live Server, o lo que use el 5500, o ejecutar `pnpm build:web`, y otra vez `demo-up.cmd`. Para volver al flujo anterior, `demo-up.cmd -NoWeb` desde una terminal y `pnpm serve:web` en otra | — |
| **La página no carga en el 5500** | Mirar `%TEMP%\chessspeak-web.err.log`. `demo-down.cmd` y `demo-up.cmd`; si no, el flujo anterior de la fila de arriba | — |
| **Error de `demo.json`** | Con un error de JSON, la ruta lleva `\`: cambiarla por `/`. Si falta la clave, comprobar que el archivo existe y no se llama `demo.json.txt` | — |
| **Edge pide permiso de red local** | Aceptar | «El navegador pide permiso para hablar con el agente de este equipo» |
| **El profesor detiene una instancia y, tras «Iniciar», w2 no vuelve en unos minutos** | Esperar. Si la instancia estuvo detenida **más de unos 10 minutos**, `tunnel.ps1` se rinde: reabrir ese túnel con `.\whisper-cloud\aws\tunnel.ps1 -HostIp <IP de w2> -KeyPath <ruta> -LocalPort 18202` y pulsar «Devolver» en el dashboard | «El túnel tiene un tope de reintentos a propósito, para no reintentar sin fin» |
| **El micrófono o el reconocedor** | La caja de texto, que sigue el mismo camino: parser, flecha y «Sí, jugar» | «La confirmación evita jugar algo erróneo» |
| **Todo lo demás** | El video de respaldo | — |

## 4. Preguntas probables y respuestas cortas

Las cifras salen de la [evidencia de T-stop en EC2](evidence/t-stop-ec2/README.md), del [ADR 12](adr/0012-whisper-como-servicio-con-pool-por-urls.md) y de los [criterios](whisper-cloud-criteria.md).

| Pregunta | Respuesta |
|---|---|
| **¿Se pierde algo si detengo una instancia?** | En las 7 corridas en AWS, 0 peticiones perdidas (F1, 7 de 7). Lo que tenía en curso la instancia detenida se reintenta una vez en la otra |
| **¿Cuánto tarda en volver?** | En 6 de las 7 corridas, unos 21–27 s desde el aviso de «Iniciar» (F4). En la séptima fueron 187,8 s desde el aviso, y no se conoce la hora de la pulsación: **no es verificable y cuenta como no cumplida.** Por eso, con la regla fijada antes de medir, T-stop en EC2 quedó «no se cumplen» |
| **¿Es rápido?** | No. En EC2 cada clip tarda unos 11–12 s, y el p95 de la peor repetición fue de 13,59 s, con el umbral en 7,5 s (C1 no cumple). Con una instancia detenida, la peor petición tardó 25,2 s. **Demuestra el reparto y la tolerancia a fallos, no la velocidad** |
| **¿El audio sale del equipo?** | Con «Whisper en la nube (EC2)», sí: va por un túnel SSH a las instancias y no se guarda en ninguna parte. Con «Whisper local», no sale. Web Speech usa el servicio en línea del navegador |
| **¿Dónde está el balanceador?** | En este portátil: el `local-agent` del 8766. Las dos instancias de EC2 son los workers. Si el portátil falla, falla el balanceador: es un punto único de fallo, y lo decimos |
| **¿Qué algoritmo usa?** | Conexiones mínimas. Cada worker atiende una petición a la vez, así que en la práctica es una cola común con el siguiente worker libre (ADR 10). Hay turno rotativo para comparar |
| **¿Por qué no un balanceador de AWS?** | Queríamos el algoritmo, el monitor, aislar y devolver, y el reintento de lo que estaba en curso en nuestro código. Un balanceador de AWS lo sustituiría, y para HTTPS necesita un certificado, es decir, un dominio |
| **¿Escala?** | No está demostrado. C1 no cumple, y toda la carga medida es sintética. En una partida real llega una petición cada vez |
| **¿Cómo sabéis qué instancia respondió?** | Por la cabecera `X-Worker` y los contadores del dashboard. La telemetría de `voice_attempts` dice `whisper` en los dos modos, **así que no distingue local de EC2** |
| **¿Cuánto cuesta?** | Unos 0,18 USD por hora con las 2 instancias encendidas, más 0,005 USD por hora por cada IP elástica, también con las instancias paradas, hasta liberarlas |

Lo que **no** se afirma está en la [sección 6 del guion](demo-script.md#6-qué-no-se-afirma-en-la-demo).
