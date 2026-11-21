# T-stop of section 8 (docs/whisper-cloud-criteria.md): fails one worker in the middle of a load run and brings it
# back, while it records /lb/stats every second.
#   .\whisper-cloud\aws\tstop-watch.ps1 -Label tstop-stop-r1 -OutDir <folder outside the repo> -Fail DockerStop
# Start it BEFORE load.ts, in another window. It saves snapshot 0 and waits until the run reaches -Threshold new 200
# answers. Then it fails -Worker and saves snapshot A. After -RecoverAfterSeconds it brings the worker back. It ends
# once the agent has had nothing queued or in flight for -IdleSeconds, and saves snapshot B.
# -Fail DockerStop and DockerPause act on the containers of whisper-cloud/compose.local.yml, where worker wN is
# service wN. -Fail Manual is for EC2: the script beeps and says when to press Stop, and later Start, in the console.
# -WhenBusy (section 9): past the threshold, it waits up to 30 s for a sample where the worker has a request in
# flight, and fails it then. Snapshot A shows whether it still had it.
# F1 and F3 come from the JSON of load.ts. F2 and F4 come from the summary this script writes.
param(
  [Parameter(Mandatory)][string]$Label,
  [Parameter(Mandatory)][string]$OutDir,
  [Parameter(Mandatory)][ValidateSet('DockerStop', 'DockerPause', 'Manual')][string]$Fail,
  [ValidatePattern('^w\d+$')][string]$Worker = 'w2',
  [ValidateRange(1, 1000)][int]$Threshold = 12,
  [ValidateRange(5, 1800)][int]$RecoverAfterSeconds = 60,
  [ValidateRange(5, 600)][int]$IdleSeconds = 15,
  [ValidateRange(60, 7200)][int]$MaxSeconds = 1200,
  [string]$Agent = 'http://127.0.0.1:8765',
  [switch]$WhenBusy
)
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ($Label -notmatch '^[\w-]+$') { throw 'Label: solo letras, números, - y _.' }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$out = (Resolve-Path $OutDir).Path
if ($out.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'OutDir debe estar fuera del repo: la evidencia se limpia antes de publicarla.' }
$compose = Join-Path $repo 'whisper-cloud\compose.local.yml'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$files = @{
  samples = Join-Path $out "samples-$Label.jsonl"
  summary = Join-Path $out "tstop-$Label.txt"
  s0 = Join-Path $out "snapshot-0-$Label.json"
  sA = Join-Path $out "snapshot-A-$Label.json"
  sB = Join-Path $out "snapshot-B-$Label.json"
}
foreach ($file in $files.Values) { if (Test-Path $file) { throw "Ya existe ${file}: usa otra etiqueta." } }

function Get-StatsText { (Invoke-WebRequest -UseBasicParsing -Uri "$Agent/lb/stats" -TimeoutSec 2).Content }
function Get-EpochMs([datetime]$At) { ([DateTimeOffset]$At).ToUnixTimeMilliseconds() }
function Format-Time([object]$At) { if ($null -eq $At) { '-' } else { ([datetime]$At).ToString('HH:mm:ss.fff') } }
function Get-Seconds([object]$From, [object]$To) { if ($null -eq $From -or $null -eq $To) { $null } else { [math]::Round((([datetime]$To) - ([datetime]$From)).TotalSeconds, 1) } }
function Add-Line([string]$Path, [string]$Text) { [System.IO.File]::AppendAllText($Path, "$Text`n", $utf8) }
function Invoke-Compose([string[]]$Arguments) {
  & docker compose -f $compose @Arguments
  if ($LASTEXITCODE -ne 0) { throw "docker compose $($Arguments -join ' ') terminó con código $LASTEXITCODE. PARA." }
}
function Show-Banner([string]$Text) {
  Write-Host ''
  Write-Host "  >>> $(Get-Date -Format 'HH:mm:ss') $Text <<<" -ForegroundColor Yellow
  Write-Host ''
  try { [console]::Beep(880, 400) } catch { }
}

# preconditions first, so that nothing is failed if something is wrong
$text0 = Get-StatsText
$s0 = $text0 | ConvertFrom-Json
if ($s0.mode -ne 'url') { throw "El agente está en modo $($s0.mode); T-stop necesita el modo URLs." }
$w0 = $s0.workers | Where-Object { $_.id -eq $Worker }
if ($null -eq $w0) { throw "El agente no tiene el worker $Worker." }
if (@($s0.workers | Where-Object { $_.state -ne 'up' }).Count -gt 0) { throw 'Todos los workers deben estar up antes de empezar.' }
$running = '(no aplica: fallo manual en EC2)'
if ($Fail -ne 'Manual') {
  $services = @(& docker compose -f $compose ps --services --status running)
  if ($LASTEXITCODE -ne 0) { throw 'docker compose ps falló: ¿está Docker encendido?' }
  if ($services -notcontains $Worker) { throw "El servicio $Worker de compose.local.yml no está en marcha." }
  $running = (@(& docker ps --format '{{.Names}}') | Sort-Object) -join ', '
}
[System.IO.File]::WriteAllText($files.s0, $text0, $utf8)
$base = $s0.totals
Write-Host "Instantánea 0 guardada. Lanza ahora la carga en otra ventana. $Worker fallará al llegar a $Threshold respuestas 200 nuevas."

$t0 = Get-Date
$phase = 'before'
$failStart = $null; $failAt = $null; $detectedAt = $null; $detectedState = $null
$recoverAt = $null; $upAgainAt = $null; $servedAgainAt = $null; $idleSince = $null
$readErrors = 0; $last = $s0; $endReason = 'el agente quedó sin trabajo'
$thresholdAt = $null; $activeAtA = $null; $sentDuringDetection = $false
while ($true) {
  $now = Get-Date
  if (($now - $t0).TotalSeconds -ge $MaxSeconds) { $endReason = "tope de $MaxSeconds s"; break }
  try {
    $text = Get-StatsText
    $s = $text | ConvertFrom-Json
  } catch {
    $readErrors++
    Add-Line $files.samples (([ordered]@{ at = $now.ToString('o'); phase = $phase; error = $_.Exception.Message }) | ConvertTo-Json -Compress)
    Start-Sleep -Seconds 1
    continue
  }
  $last = $s
  $w = $s.workers | Where-Object { $_.id -eq $Worker }
  $sample = [ordered]@{
    at = $now.ToString('o'); phase = $phase; totals = $s.totals; queued = $s.queued
    workers = @($s.workers | ForEach-Object { [ordered]@{ id = $_.id; state = $_.state; active = $_.active; served = $_.served; failed = $_.failed; restarts = $_.restarts } })
  }
  Add-Line $files.samples ($sample | ConvertTo-Json -Compress -Depth 4)

  if ($phase -eq 'before') {
    if ($null -eq $thresholdAt -and [int]$s.totals.'200' - [int]$base.'200' -ge $Threshold) { $thresholdAt = $now }
    $ready = $null -ne $thresholdAt -and (-not $WhenBusy -or $w.active -gt 0 -or ($now - $thresholdAt).TotalSeconds -ge 30)
    if ($ready) {
      [System.IO.File]::WriteAllText($files.sA, $text, $utf8)
      $activeAtA = $w.active
      $failStart = Get-Date
      switch ($Fail) {
        'DockerStop' { Invoke-Compose @('stop', $Worker) }
        'DockerPause' { Invoke-Compose @('pause', $Worker) }
        'Manual' { Show-Banner "DETÉN AHORA la instancia de $Worker en la consola de EC2 (Estado de instancia > Detener)" }
      }
      $failAt = Get-Date
      $phase = 'failed'
      Write-Host "$(Format-Time $failAt) $Worker fallado ($Fail). Se devuelve en $RecoverAfterSeconds s."
    }
  } else {
    # still up after the failure, with something in flight: a request it held, or one sent to it while frozen
    if ($null -eq $detectedAt -and $w.state -eq 'up' -and $w.active -gt 0) { $sentDuringDetection = $true }
    if ($null -eq $detectedAt -and $w.state -ne 'up') {
      $detectedAt = $now; $detectedState = $w.state
      Write-Host "$(Format-Time $now) el agente sacó a $Worker de la rotación ($($w.state))."
    }
    if ($phase -eq 'failed' -and ($now - $failAt).TotalSeconds -ge $RecoverAfterSeconds) {
      switch ($Fail) {
        'DockerStop' { Invoke-Compose @('start', $Worker) }
        'DockerPause' { Invoke-Compose @('unpause', $Worker) }
        'Manual' { Show-Banner "INICIA AHORA la instancia de $Worker en la consola de EC2 (Estado de instancia > Iniciar)" }
      }
      $recoverAt = Get-Date
      $phase = 'recovering'
      Write-Host "$(Format-Time $recoverAt) $Worker devuelto."
    } elseif ($phase -eq 'recovering') {
      if ($null -eq $upAgainAt -and $null -ne $detectedAt -and $w.state -eq 'up') {
        $upAgainAt = $now
        Write-Host "$(Format-Time $now) $Worker vuelve a estar up."
      }
      if ($null -ne $upAgainAt -and $null -eq $servedAgainAt) {
        $since = Get-EpochMs $upAgainAt
        if (@($s.recent | Where-Object { $_.worker -eq $Worker -and $_.status -eq 200 -and $_.at -gt $since }).Count -gt 0) {
          $servedAgainAt = $now
          Write-Host "$(Format-Time $now) $Worker atiende de nuevo."
        }
      }
      $busy = [int]$s.queued -gt 0 -or @($s.workers | Where-Object { $_.active -gt 0 }).Count -gt 0
      if ($busy) { $idleSince = $null } elseif ($null -eq $idleSince) { $idleSince = $now } elseif (($now - $idleSince).TotalSeconds -ge $IdleSeconds) { break }
    }
  }
  Start-Sleep -Seconds 1
}

try { [System.IO.File]::WriteAllText($files.sB, (Get-StatsText), $utf8) } catch { $readErrors++ }
$delta = ('200', '502', '503', '504' | ForEach-Object { "$_ +$([int]$last.totals.$_ - [int]$base.$_)" }) -join ', '
$detection = if ($null -eq $detectedAt) { 'no salió de la rotación' } else { "salió de la rotación ($detectedState) a los $([math]::Max(0, (Get-Seconds $failAt $detectedAt))) s del fin de la orden de fallo" }
$upAgain = if ($null -eq $upAgainAt) { 'no volvió a up' } else { "volvió a up a los $(Get-Seconds $recoverAt $upAgainAt) s de devolverlo" }
$servedAgain = if ($null -eq $servedAgainAt) { 'no atendió ninguna petición nueva' } else { "primera respuesta 200 nueva a los $(Get-Seconds $recoverAt $servedAgainAt) s de devolverlo" }
$summary = @(
  "Corrida: $Label"
  "Fecha: $($t0.ToString('yyyy-MM-dd HH:mm:ss zzz'))"
  "Fallo: $Fail sobre $Worker al llegar a $Threshold respuestas 200 nuevas; devolución $RecoverAfterSeconds s después"
  "Agente: modo $($s0.mode), estrategia $($s0.strategy), timeoutMs $($s0.timeoutMs), sondeo de $Worker cada $($w0.probeIntervalMs) ms, reconnectMax $($s0.reconnectMax)"
  "Contenedores en marcha al empezar: $running"
  "Orden de fallo: de $(Format-Time $failStart) a $(Format-Time $failAt)$(if ($WhenBusy) { ' (con -WhenBusy)' })"
  "$Worker en curso en la instantánea A: $activeAtA · con peticiones en curso entre el fallo y la detección: $(if ($sentDuringDetection) { 'sí' } else { 'no' })"
  "F2 detección: $Worker $detection"
  "Devolución: $(Format-Time $recoverAt)"
  "F4 recuperación: $Worker $upAgain; $servedAgain"
  "Totales del agente desde la instantánea 0: $delta"
  "Lecturas fallidas de /lb/stats: $readErrors · fin: $endReason"
)
[System.IO.File]::WriteAllText($files.summary, (($summary -join "`n") + "`n"), $utf8)
$summary | ForEach-Object { Write-Host $_ }
