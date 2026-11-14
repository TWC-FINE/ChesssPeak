# Pool por URLs con contenedores locales — criterios de la fase C

Estos criterios se fijaron **antes de medir** y **no se cambian después de medir**. Si hay que cambiar algo, se registra como una versión nueva de este archivo (v2), con la fecha y el motivo, y las mediciones hechas con la versión anterior se descartan como evidencia de decisión.

- Versión: **v1**
- Fecha: 14 de noviembre de 2026
- Relacionado: [criterios de Whisper en la nube](whisper-cloud-criteria.md) (adenda de EC2) · [ADR 10](adr/0010-balanceo-de-carga-en-local-agent.md) · ADR 12 (por escribir)

## 1. Qué se decide

Si el modo por URLs del `local-agent` (#41) reparte las peticiones entre 3 contenedores locales de Whisper y si **aísla un worker sin perder ninguna petición**. Es el plan B del balanceo y la base del modo que usaría EC2.

- **La velocidad no es criterio.** El producto envía una petición cada vez.
- **Todo corre en un solo equipo.** Esto no demuestra escalado entre máquinas, y el ADR 12 debe decirlo así.
- **Fuera de esta prueba:** la comparación de 1 contenedor frente a 3.

## 2. Montaje, igual en todas las corridas

- **Contenedores:** [`whisper-cloud/compose.local.yml`](../whisper-cloud/compose.local.yml), con la imagen `chessspeak-whisper:small-d1be6fd` de la fase A, sin reconstruirla (`docker compose ... up -d --no-build`). Son 3 servicios con `cpus: 2` y `mem_limit: 2g`, publicados en `127.0.0.1:18101-18103`. Se arrancan una vez y siguen en marcha entre corridas.
- **Agente:** `WHISPER_URLS=http://127.0.0.1:18101,http://127.0.0.1:18102,http://127.0.0.1:18103`, con los valores por defecto: conexiones mínimas, `LB_TIMEOUT_MS` de 15 s, cola de 12 y un sondeo por segundo. **Se reinicia antes de cada corrida**, así que los contadores empiezan en cero.
- **Clip:** el WAV por defecto de `load.ts`, `spike/recordings/p05-01_quiet_r1_runB.wav`. Es la voz del responsable del repo, no sale del equipo y no va al repo.
- **Calentamiento:** `--warmup 3`, una petición por worker. No cuenta.
- **Entorno:**
  - Docker Desktop **encendido**, porque los workers son contenedores.
  - Las bases de datos de `docker compose` **paradas**. En `docker ps` solo aparecen los 3 contenedores de Whisper.
  - Antes de cada corrida se registra el entorno con el comando del paso 3 de [kit-equipo-debil/LEEME.txt](kit-equipo-debil/LEEME.txt), más `docker ps`. **La lista de procesos se queda en local.** A la evidencia solo van la fecha, la RAM libre, el estado de Docker y los contenedores en marcha.
  - Equipo: el de desarrollo, un i5-12400F con 12 hilos. Los 3 contenedores pueden usar hasta 6 CPU.

## 3. Prueba de aislamiento (criterio)

**Concurrencia 2**, igual al número de workers que siguen activos después de aislar uno. Así, por diseño, ninguna petición tiene que esperar en cola, y un 504 señalaría un fallo real, no una cola llena.

Son 3 repeticiones. En cada una:

1. Se lanza la carga: `pnpm --filter @chessspeak/local-agent load --steps 2 --requests 40 --warmup 3 --label aislamiento-r<n>`.
2. Cuando `/lb/stats` marca al menos 13 respuestas 200 (las 3 del calentamiento más 10 del escalón), se aísla w2 con `POST /lb/workers/w2/isolate` y se guarda `/lb/stats` justo después: es la **instantánea A**.
3. Al terminar el escalón se guarda `/lb/stats`: es la **instantánea B**.

| | Qué | Umbral |
|---|---|---|
| **I1** | Respuestas 200 del escalón, según el JSON de `load.ts` | **40 de 40** en cada repetición, es decir, **0 perdidas**. Cualquier 502, 503, 504 o error de red cuenta como perdida |
| **I2** | Peticiones nuevas que recibe w2 después de aislarlo | `B.w2.served − A.w2.served ≤ A.w2.active`: solo terminan las que ya tenía en curso |
| **I3** | Reparto después de aislar | w1 y w3 atienden **al menos 5** peticiones cada uno entre A y B. Quedan unas 27 peticiones para 2 workers, así que menos de 5 en uno indicaría que el reparto no funciona |

## 4. Medición informativa (sin umbral)

Son 3 repeticiones, sin aislar ningún worker: `pnpm --filter @chessspeak/local-agent load --steps 4 --requests 40 --warmup 3 --label informativa-c4-r<n>`.

Se anotan:

- las respuestas 200, 503 y 504 y las demás;
- el p50, el p95 y el máximo de las respuestas 200, y el p50 y el p95 de todas;
- el reparto por worker.

**No tiene umbral ni decide nada.** Con 4 peticiones simultáneas y 3 workers, una espera en cola, así que los 504 pueden aparecer por diseño cuando la espera más la inferencia pasa de `LB_TIMEOUT_MS`. Estas cifras no se citan como rendimiento del producto.

## 5. Comandos de las instantáneas (PowerShell)

```powershell
$s = "http://127.0.0.1:8765"
# instantánea A: aislar w2 tras 13 respuestas 200 (3 de calentamiento + 10)
do { Start-Sleep -Milliseconds 200; $ok = (Invoke-RestMethod "$s/lb/stats").totals.'200' } until ($ok -ge 13)
Invoke-RestMethod -Method Post "$s/lb/workers/w2/isolate" | Out-Null
Invoke-RestMethod "$s/lb/stats" | ConvertTo-Json -Depth 6 | Out-File "snapshot-A-r$n.json" -Encoding utf8
# instantánea B: cuando load.ts haya terminado
Invoke-RestMethod "$s/lb/stats" | ConvertTo-Json -Depth 6 | Out-File "snapshot-B-r$n.json" -Encoding utf8
```

## 6. Evidencia

En `docs/evidence/url-pool-phase-c/` van:

- los JSON de `load.ts`;
- las instantáneas A y B;
- los registros de entorno recortados como dice la sección 2;
- un README y `SHA256SUMS`.

Antes de publicarla se revisa que no haya rutas personales ni listas de procesos.

## 7. Decisión

| Resultado | Qué se hace |
|---|---|
| I1–I3 se cumplen en las 3 repeticiones | El ADR 12 registra el pool por URLs, con aislamiento sin pérdidas, en un solo equipo |
| Alguno falla | Se registra tal como salió en el ADR 12, sin repetir hasta que pase. El aislamiento no se presenta como resuelto en la demo |
