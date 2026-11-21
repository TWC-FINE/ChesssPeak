# Evidencia de T-stop en EC2: detener una instancia en pleno uso

Corridas del 21 de noviembre de 2026 con la [sección 10](../../whisper-cloud-criteria.md#10-adenda-del-21-de-noviembre-3-t-stop-en-ec2) de los criterios.
- **Antes de medir:** la sección 10 se fusionó en `main` (`f4c022f`), y la medición corrió desde `main` en `86f3d48`.
- **Los umbrales no se cambiaron después de medir.**

## Resultado

**F1 se cumple en las 7 corridas: 0 peticiones perdidas al detener la instancia de w2**, con 0 respuestas 502, 503 y 504.

- **`ec2` cumple F1–F4 en las 3 repeticiones.**
- **`ec2-ocupado` cumple F1–F4 en 2 de 3 repeticiones válidas.** En r3, F4 queda **no verificable, y se registra como no cumple** (ver abajo).
- **Por la tabla de decisión de la sección 10,** como `ec2-ocupado` no tiene 3 repeticiones válidas que cumplan F1–F4, el resultado es **«no se cumplen»**.

Umbrales (sección 8):
- **F1:** 60 de 60 respuestas 200;
- **F2:** en EC2 se anota sin umbral;
- **F3:** latencia máxima ≤ 30 s;
- **F4:** w2 vuelve a `up` en ≤ 3 min desde que se pulsa «Iniciar», y atiende al menos una petición nueva, sin acción en el agente.

| Corrida | F1 | F2 detección | F3 máx. | F4 `up` / primera 200, desde el aviso de Iniciar | w2 en curso en A | Resultado |
|---|---|---|---|---|---|---|
| `ec2` r1 | 60/60 | 14 s | 15,2 s | 26,5 s / 58,2 s | 0 | Cumple |
| `ec2` r2 | 60/60 | 12 s | 13,8 s | 25,5 s / 65,3 s | 0 | Cumple |
| `ec2` r3 | 60/60 | 11 s | 13,9 s | 22,4 s / 53,1 s | 0 | Cumple |
| `ec2-ocupado` r1 | 60/60 | 5 s | 19,1 s | 23,5 s / 44,9 s | 1 (válida) | Cumple |
| `ec2-ocupado` r2 | 60/60 | 3 s | 16,4 s | 21,4 s / 40,8 s | 1 (válida) | Cumple |
| `ec2-ocupado` r3 | 60/60 | 59 s | 21,5 s | **187,8 s** / 225,6 s | 1 (válida) | **F4 no verificable: no cumple** |

### `ec2-ocupado` r3

- **Lo medido:** w2 volvió a `up` 187,8 s después del **aviso** de «Iniciar». El umbral es 180 s desde que se **pulsa** «Iniciar».
- **Por qué no se puede verificar:** el responsable no recuerda la hora exacta de la pulsación, y desde el repo no se consulta CloudTrail.
  - Si pulsó 8 s o más después del aviso, se cumpliría; si no, no.
  - Al no haber hora, **se registra como «no verificable: no cumple»**, sin tocar el umbral.
- **Anotado sin umbral:** en esta repetición, la detección (F2) tardó 59 s, frente a 3–14 s en las demás. Puede que «Detener» se pulsara algo después del aviso, o que el apagado tardara más `[S]`.
- **F1 y F3 se cumplen:** 60/60, con un máximo de 21,5 s.

### Informativo, sin umbral

**Concurrencia 2:** 60/60, con un máximo de 25,2 s. w2 volvió a `up` a los 21,4 s del aviso de «Iniciar».

### Lo que muestran estas cifras

- **Ninguna petición se perdió al detener una instancia de verdad.** Eso incluye las 3 repeticiones en que w2 tenía una petición en curso: el agente la canceló y la reintentó en w1.
- **El máximo de F3 (13,8–21,5 s)** es el de la petición que esperó la detección y después se transcribió en w1, en unos 11–13 s.
- **Con la IP elástica, w2 volvió solo:** en 5 de las 6 repeticiones, unos 21–27 s después del aviso, sin tocar el agente ni los túneles.
- **F4 se mide desde el aviso,** no desde la pulsación. Como el responsable pulsa en el aviso o después, la cifra real de F4 es igual o menor que la de la tabla.

## Cómo se midió

- **Cada repetición:** `whisper-cloud/aws/tstop-ec2.ps1 -Label <etiqueta> -OutDir <carpeta-de-salida> -ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas -VpnApagada`. En `ec2-ocupado` se añade `-WhenBusy`, y en la informativa, `-Steps 2`.
  - Abre [`tstop-watch.ps1`](../../../whisper-cloud/aws/tstop-watch.ps1) en modo `Manual`, con la devolución a los 120 s.
  - Lanza `load.ts` con 60 peticiones, concurrencia 1 y 2 de calentamiento.
- **El responsable pulsó «Detener» e «Iniciar»** en la consola de EC2, solo sobre la instancia de w2, cuando el script lo avisó.
- **Una repetición que no llegó a ejecutarse:** el primer intento de lanzar `ec2` r2 falló por una ruta relativa al script. No se envió ninguna petición, no se abrió `tstop-watch` y no se creó ningún archivo. Se relanzó con la ruta absoluta, con el OK del responsable.
- **De dónde sale cada criterio:**
  - F1 y F3, del JSON de `load.ts`;
  - F2 y F4, del resumen `tstop-*.txt`;
  - «w2 en curso en A», de `snapshot-A-*.json`.
- Las cifras de las tablas salen de estos archivos; ninguna se editó a mano.

## Entorno

- **Instancias:**
  - 2 `c7i-flex.large` en `us-east-2`, cada una con una IP elástica;
  - el mismo `user-data.sh` y contenedor `small` que en C4.
- **Comprobado antes de medir, por SSH y solo con lectura:**
  - las dos marcaban «listo»;
  - el 8080 escuchaba solo en `127.0.0.1`;
  - `/health` respondía 200;
  - el contenedor estaba arriba;
  - la CPU tenía AVX2.
- **Acceso:** el grupo de seguridad solo admite el puerto 22 desde la IP del responsable con `/32`, y la clave privada está fuera del repo.
- **Túneles y agente:** se arrancaron con `demo-up.ps1`. Túneles con keepalive de 5 s × 2 y reconexión; agente en modo URLs, con `LB_PROBE_INTERVAL_MS=2000` y `LB_TIMEOUT_MS=45000`.
- **Clip:** el WAV por defecto de `load.ts`, una grabación del responsable del repo, que dio su OK explícito para enviarla por los túneles.
- **Equipo del responsable:**
  - VPN apagada y Docker local apagado;
  - uso mínimo: los clics en la consola de EC2.
  - Lo detallan los `entorno-*.txt`.

## Cambios respecto a los originales

- **`load-*.txt`:** la ruta de la línea «Reporte» se cambió por `<carpeta-de-salida>`, en los 7 archivos.
  - Se hizo con un script de Node probado antes en una copia.
  - El diff solo mostró esa línea en cada archivo.
- **Lo que no hay:**
  - ninguna IP pública, nombre de instancia ni ruta personal: solo aparece `127.0.0.1`;
  - ningún CR ni BOM, según un conteo con un script de Node de solo lectura. No se convirtió nada.
- **No se incluye:** la salida de error de `pnpm`, que solo repetía la orden.

Para comprobar los archivos, desde esta carpeta: `sha256sum -c SHA256SUMS`.
