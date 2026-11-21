# One repetition of the ec2 variants of T-stop (docs/whisper-cloud-criteria.md, sections 8 to 10): stopping the
# instance of w2 for real, from the EC2 console, while load.ts runs through the agent.
#   .\whisper-cloud\aws\tstop-ec2.ps1 -Label tstop-ec2-r1 -OutDir <folder outside the repo> `
#     -ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas -VpnApagada
#   ... -Label tstop-ec2-ocupado-r1 -WhenBusy                     (w2 busy when it is stopped, section 10)
# Start first the tunnels and the agent with demo-up.ps1 (Elastic IPs, so the tunnels can come back on their own).
# It opens tstop-watch.ps1 in its own window in -Fail Manual mode: watch that window. It beeps when to press Stop
# and, -RecoverAfterSeconds later, Start. Nothing here calls AWS: the only traffic is load.ts through the tunnels.
param(
  [Parameter(Mandatory)][string]$Label,
  [Parameter(Mandatory)][string]$OutDir,
  [Parameter(Mandatory)][switch]$ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas,
  [Parameter(Mandatory)][switch]$VpnApagada,
  [switch]$WhenBusy,
  [ValidateSet('1', '2')][string]$Steps = '1',
  [ValidateRange(20, 200)][int]$Requests = 60,
  [ValidateRange(60, 600)][int]$RecoverAfterSeconds = 120
)
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas.IsPresent) { throw 'Sin confirmación no se envía ningún clip a la nube.' }
if (-not $VpnApagada.IsPresent) { throw 'Confirma con -VpnApagada que la VPN está apagada.' }
if ($Label -notmatch '^[\w-]+$') { throw 'Label: solo letras, números, - y _.' }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$out = (Resolve-Path $OutDir).Path
if ($out.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'OutDir debe estar fuera del repo: la evidencia se limpia antes de publicarla.' }
$summary = Join-Path $out "tstop-$Label.txt"
if (Test-Path $summary) { throw "Ya existe ${summary}: usa otra etiqueta." }

# preconditions: the agent of section 8, pointed at the 2 tunnels, both workers up
try { $stats = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/lb/stats' -TimeoutSec 3 } catch { throw 'El agente no responde en 127.0.0.1:8765: arráncalo con demo-up.ps1.' }
$urls = @($stats.workers | ForEach-Object { $_.url }) -join ','
if ($stats.mode -ne 'url' -or $urls -ne 'http://127.0.0.1:18201,http://127.0.0.1:18202') { throw "El agente no apunta a los 2 túneles de EC2 (modo $($stats.mode), $urls)." }
if ($stats.timeoutMs -ne 45000 -or @($stats.workers | Where-Object { $_.probeIntervalMs -ne 2000 }).Count -gt 0) { throw 'El agente no tiene LB_TIMEOUT_MS=45000 y LB_PROBE_INTERVAL_MS=2000 (sección 8).' }
if (@($stats.workers | Where-Object { $_.state -ne 'up' }).Count -gt 0) { throw 'w1 y w2 deben estar up antes de empezar.' }

& cmd /c 'docker info >nul 2>&1'
$docker = if ($LASTEXITCODE -eq 0) { 'encendido' } else { 'apagado' }
$free = [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)
$environment = @(
  "Corrida: $Label"
  "Fecha: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))"
  "Código: $(& git -C $repo rev-parse HEAD)"
  'Destino: 2 instancias EC2 (us-east-2) a través de túneles SSH en 127.0.0.1:18201 (w1) y 127.0.0.1:18202 (w2)'
  "Agente: modo URLs, LB_TIMEOUT_MS=45000, LB_PROBE_INTERVAL_MS=2000; variante $(if ($WhenBusy) { 'ocupado (-WhenBusy)' } else { 'w2 libre' })"
  'VPN: apagada (confirmado por el responsable)'
  "Docker local: $docker"
  "RAM libre: $free MB"
)
[System.IO.File]::WriteAllText((Join-Path $out "entorno-$Label.txt"), (($environment -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))

$watchArgs = @('-NoProfile', '-NoExit', '-File', (Join-Path $PSScriptRoot 'tstop-watch.ps1'), '-Label', $Label, '-OutDir', $out, '-Fail', 'Manual',
  '-RecoverAfterSeconds', $RecoverAfterSeconds, '-MaxSeconds', 3600)
if ($WhenBusy) { $watchArgs += '-WhenBusy' }
Start-Process powershell -ArgumentList $watchArgs | Out-Null
$snapshot0 = Join-Path $out "snapshot-0-$Label.json"
$deadline = (Get-Date).AddSeconds(30)
while (-not (Test-Path $snapshot0)) {
  if ((Get-Date) -gt $deadline) { throw 'tstop-watch no guardó la instantánea 0 en 30 s: mira su ventana.' }
  Start-Sleep -Milliseconds 300
}
Write-Host "Carga: $Requests peticiones con concurrencia $Steps. Mira la ventana de tstop-watch: avisa cuándo pulsar Detener e Iniciar."
$loadOut = Join-Path $out "load-$Label.txt"
& cmd /c "pnpm --filter @chessspeak/local-agent load --steps $Steps --requests $Requests --warmup 2 --label $Label --out-dir `"$out`" > `"$loadOut`" 2> `"$loadOut.err`""
$loadExit = $LASTEXITCODE
Write-Host "load.ts terminó con código $loadExit. Esperando el resumen de tstop-watch (hasta 10 min)..."
$deadline = (Get-Date).AddMinutes(10)
while (-not (Test-Path $summary)) {
  if ((Get-Date) -gt $deadline) { throw 'tstop-watch no escribió su resumen en 10 min: mira su ventana.' }
  Start-Sleep -Seconds 2
}
Get-Content $summary -Encoding UTF8
Select-String -Encoding UTF8 -Path $loadOut -Pattern '^\s*conc|^\s*\d+\s' | ForEach-Object { $_.Line }
Write-Host ''
Write-Host 'Al terminar la sesión: demo-down.ps1 y, en la consola de EC2, Detener (no Terminar) las 2 instancias.'
