# Whisper en la nube — criterios de la prueba de viabilidad

Estos criterios se fijaron **antes de medir** y **no se cambian después de medir**. Si hay que cambiar algo, se registra como una versión nueva de este archivo (v2) con la fecha y el motivo, y las mediciones hechas con la versión anterior se descartan como evidencia de decisión.

- Versión: **v1**
- Fecha: 12 de noviembre de 2026
- Relacionado: ADR 12 (por escribir; sustituye al [ADR 11](adr/0011-balanceo-de-jugadas-con-move-workers.md)) · [ADR 10](adr/0010-balanceo-de-carga-en-local-agent.md) · [ADR 5](adr/0005-strategy-y-reconocedor-por-defecto.md)

## 1. Qué se decide

Si vale la pena desplegar `whisper-server` en Cloud Run, como N servicios con una instancia cada uno y un gateway en el servidor de Render que reparta entre ellos. Whisper local sigue siendo el módulo local.

La prueba tiene dos fases:

- **Fase A, local, sin nube:** la imagen Linux de [`whisper-cloud/`](../whisper-cloud/Dockerfile) se mide con `docker run --cpus=2`. Si la fase A no pasa, **no se abre la cuenta de Google Cloud** y la nube queda descartada.
- **Fase C, en la nube:** solo si la fase A pasa y el responsable del repo da su OK a la fase B, que es crear la cuenta y los servicios.

## 2. Fase A: local, con `docker run --cpus=2 --memory=2g`

### Entradas

- **Imagen:** `whisper-cloud/Dockerfile`, que fija whisper.cpp `d1be6fd`, el mismo commit que el binario de Windows `b5454`. Usa `GGML_NATIVE=OFF`, 2 hilos y el prompt de ajedrez. Se construye una imagen con `MODEL=small` y otra con `MODEL=base`.
- **Clips:** el split `test` de `spike/recordings` (runB), los mismos 78 intentos válidos del spike. Ningún clip sale del equipo en esta fase.
- **Herramienta:** `pnpm --filter @chessspeak/spike-whisper-local benchmark --url http://127.0.0.1:8080 --models <modelo> --prompt on --label docker-cpus2-r<n>`.
  - **Latencia:** se mide la ida y vuelta HTTP a `localhost`, sin red.
  - **Acierto:** el top-1 lo calcula `voice-parser` con sus parámetros por defecto.
- **Repeticiones:** 3 por modelo, cada una con un contenedor recién arrancado.
- **Entorno:**
  - Docker Desktop encendido, porque hace falta, con **solo** el contenedor de whisper en marcha: las bases de datos de `docker compose` se paran antes.
  - Antes de cada repetición se registra el entorno con el comando del paso 3 de [kit-equipo-debil/LEEME.txt](kit-equipo-debil/LEEME.txt), más `docker ps`.

### Umbrales

| | Qué | Umbral | Por qué |
|---|---|---|---|
| **A1** | p95 de latencia en caliente, en **cada** repetición | ≤ **7,5 s** | La mitad de `LB_TIMEOUT_MS` (15 s): así cabe un reintento en otro worker |
| **A2** | De `docker run` a que `GET /health` responda 200, con la imagen ya descargada, en cada una de 3 veces | ≤ **30 s** | El timeout del navegador (`REQUEST_TIMEOUT_MS`, 30 s). En la nube se suma la descarga de la imagen |
| **A3** | Aciertos top-1 sobre 78, en **cada** repetición | `small` ≥ **68**; `base` ≥ **56** | Hasta 2 clips menos que el spike con el mismo commit (`small` 70/78, `base` 58/78). Los hilos cambian de 4 a 2 |
| **A4** | Pico de memoria del contenedor (`/sys/fs/cgroup/memory.peak`) | ≤ **1,5 GiB** | Cabe con margen en 2 GiB de Cloud Run |

### Comandos de A2 y A4 (PowerShell)

```powershell
$t = Get-Date
docker run -d --rm --name wcs --cpus=2 --memory=2g -p 8080:8080 chessspeak-whisper:small-d1be6fd
do {
  Start-Sleep -Milliseconds 250
  $ok = try { (Invoke-WebRequest http://127.0.0.1:8080/health -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200 } catch { $false }
} until ($ok -or ((Get-Date) - $t).TotalSeconds -gt 120)
if ($ok) { "A2: {0:N1} s" -f ((Get-Date) - $t).TotalSeconds } else { "A2: sin respuesta en 120 s (no cumple)" }
# ... benchmark ...
"A4: {0:N0} MiB" -f ((docker exec wcs cat /sys/fs/cgroup/memory.peak) / 1MB)
docker stop wcs
```

### Lo que la fase A no puede decir

- `--cpus=2` en Docker Desktop reparte 2 CPU de un i5-12400F a través de WSL2. Eso **no equivale** a 2 vCPU de Cloud Run. **Supuesto:** la nube será igual o más lenta, así que pasar la fase A es necesario, pero no suficiente.
- No mide la red, el arranque en frío de Cloud Run ni el reparto entre servicios. Eso es la fase C.

## 3. Fase C: en la nube

Solo con la fase A aprobada y el OK del responsable para la fase B.

**Requisito antes de enviar audio:** antes de subir a la nube cualquier WAV, el responsable del repo confirma que son grabaciones suyas y da su OK explícito.

| | Qué | Umbral |
|---|---|---|
| **C1** | p95 en caliente de un clip, medido en el gateway (ida y vuelta completa) | ≤ **7,5 s** |
| **C2** | Primer clip tras escalar a cero | ≤ **30 s**. Si no se cumple, la demo usa `min-instances=1` solo durante su ventana, y se declara |
| **C3** | Aciertos top-1 sobre 78 | Los mismos umbrales que A3 |
| **C4** | 2 servicios y 2–4 peticiones simultáneas; un worker se aísla en el gateway a mitad de la prueba | **0** peticiones perdidas, con el reparto visible en `X-Worker` |
| **C5** | Consumo de toda la prueba, proyectado al mes con la demo incluida | < **50 %** de la capa gratuita, y **0 USD** de gasto por encima de ella |

Configuración de cada servicio:

- `--cpu=2 --memory=2Gi`;
- `--max-instances=1 --concurrency=1 --min-instances=0`;
- `--no-allow-unauthenticated`;
- región `us-east4`, que es Tier 1 y está en Virginia del Norte, la misma zona que el servidor de Render.

### Adenda del 12 de noviembre, antes de medir en la nube

La añade el responsable del repo, que pidió conservarla dentro de la v1. No cambia A1–A4, que ya se midieron, ni ningún umbral. Solo fija cómo se mide la fase B, que tiene un solo servicio y todavía no tiene gateway:

- **Un servicio, solo `small`.** C1, C2, C3 y C5 se miden en la fase B. **C4 se mide en la fase C**, con 2 servicios y el gateway.
- **Desde dónde se mide C1:** desde el equipo del responsable, **con la VPN apagada**, a través de `gcloud run services proxy` en `localhost`. Esto suma su conexión y el proxy, así que es más exigente que medir en el gateway. Hay 3 repeticiones de los 78 clips, y **cuenta el p95 de la peor repetición**:

  | p95 de la peor repetición | Resultado |
  |---|---|
  | ≤ 7,5 s | **Pasa** |
  | Más de 7,5 s y hasta 9,0 s (falla por 1,5 s o menos) | **No concluyente:** se decide en la fase C, midiendo en el gateway |
  | Más de 9,0 s (falla por más de 1,5 s) | **Se recorta la nube** |

- **C2:** se mide con el primer clip enviado tras al menos 20 minutos sin peticiones, después de comprobar en la consola que el servicio tiene 0 instancias.
- **C5:** se calcula con el número de peticiones y sus latencias medidas, redondeadas a 100 ms, por 2 vCPU y 2 GiB. Se contrasta con el tiempo facturable que muestra la consola de Cloud Run.
- **Ningún clip sale a la nube** sin la respuesta explícita del responsable sobre la autoría de las grabaciones y su OK para esa prueba.

## 4. Decisión

| Resultado | Qué se hace |
|---|---|
| `small` cumple A1–A4 | Fase B con `small`, si el responsable da su OK |
| Solo `base` cumple A1–A4 | Fase B con `base`, si el responsable da su OK, declarando que su acierto (74,4 % en el spike) no llega al umbral del 85 % del ADR 5 |
| Ninguno cumple | **No es viable.** No se abre la cuenta. El ADR 12 lo registra y el balanceo queda en el pool local del ADR 10 |
| C1–C5 no se cumplen en la nube | Se borran los servicios, y el ADR 12 registra el resultado tal como salió |

## 5. Coste previsto, con las cifras oficiales

**Cifras verificadas el 12 de noviembre de 2026** en las páginas oficiales enlazadas en las fuentes. Facturación por petición, precio Tier 1, región `us-east4`:

| Concepto | Cifra oficial |
|---|---|
| Capa gratuita mensual | 180 000 vCPU-s, 360 000 GiB-s y 2 millones de peticiones, sumadas por cuenta de facturación |
| CPU activa | 0,000024 USD por vCPU-s |
| Memoria activa | 0,0000025 USD por GiB-s |
| CPU de instancia mínima inactiva | 0,0000025 USD por vCPU-s |
| Memoria de instancia mínima inactiva | 0,0000025 USD por GiB-s |
| Peticiones | 0,40 USD por millón |
| Redondeo | Hacia arriba, a los 100 ms |
| Instancias inactivas que no son mínimas | No se cobran |
| Artifact Registry | 0,5 GB gratis al mes; después, 0,000136986 USD por GiB-hora |
| Cloud Build | 2 500 minutos gratis al mes en `e2-standard-2` |
| Prueba gratuita | 300 USD de crédito durante 90 días. No se factura nada durante la prueba; solo se cobra tras pasar a una cuenta de pago |
| Presupuestos | Un presupuesto de solo alertas **no limita el gasto**. La primera alerta puede tardar varias horas y el coste llega con retraso |

**Supuestos del cálculo:** 2 vCPU y 2 GiB por servicio, y 7,5 s por clip (el límite de C1; si tarda más, la prueba ya no pasa).

| Escenario | Uso | Valor a precio de lista | Parte de la capa gratuita |
|---|---|---|---|
| **Sesión de medición** (3 × 78 clips, calentamientos, 100 peticiones de C4 y 6 arranques en frío de 30 s) | ≈ 2 900 s de instancia → 5 800 vCPU-s y 5 800 GiB-s | ≈ 0,15 USD | 3,2 % de la CPU y 1,6 % de la memoria |
| **Sondeos de salud** cada 20 s, 2 servicios, 2 h | 720 peticiones de 0,1 s → 144 vCPU-s | ≈ 0,004 USD | despreciable |
| **Demo** con `min-instances=1` en los 2 servicios durante 3 h, más 100 clips | 43 200 vCPU-s y 43 200 GiB-s inactivos, más 1 500 vCPU-s activos | ≈ 0,26 USD | — |
| **Total previsto:** 2 sesiones de medición y la demo | | **≈ 0,56 USD**, cubierto por la capa gratuita | gasto esperado: **0 USD** |
| **Riesgo: olvidar `min-instances=1`** en los 2 servicios | 345 600 vCPU-s y 345 600 GiB-s inactivos al día | **≈ 1,73 USD al día** | — |

**Supuesto:** la capa gratuita se aplica como descuento sobre el gasto, valorada a precio Tier 1 activo: 180 000 × 0,000024 + 360 000 × 0,0000025 ≈ **5,22 USD al mes**. El descuento sobre el gasto está verificado; que la tarifa inactiva consuma ese descuento de esta forma es nuestra lectura. Con esa lectura, olvidar `min-instances=1` agota la capa gratuita en unos 3 días, y el presupuesto de 5 USD llega al 100 % unos 3 días después, con el retraso propio de las alertas.

**Artifact Registry (estimación):** la imagen de `small` pesa unos 0,5 GB y la de `base`, unos 0,2 GB. Solo se sube la del modelo elegido. Si se subieran las dos, el exceso sería de unos 0,2 GB, unos 0,02 USD al mes. El tamaño real se anota después de construir.

**Recomendación:** **no pasar a una cuenta de pago** mientras dure la prueba gratuita, porque según la documentación no se factura nada durante ella.

### Fuentes

- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Google Cloud Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing)
- [Cloud Build pricing](https://cloud.google.com/build/pricing)
- [Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)
- [Cloud Run: memory limits](https://docs.cloud.google.com/run/docs/configuring/services/memory-limits)
