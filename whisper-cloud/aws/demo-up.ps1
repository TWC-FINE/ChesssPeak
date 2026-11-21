# Balancing demo in one step (docs/demo-script.md): the 2 EC2 tunnels, the agent in URL mode and the dashboard,
# with the 3 local containers as plan B when EC2 does not answer.
#   .\whisper-cloud\aws\demo-up.ps1 -KeyPath $HOME\.ssh\chessspeak-ec2.pem -TunnelsOnly   (15 min before: tunnels only)
#   .\whisper-cloud\aws\demo-up.ps1 -KeyPath $HOME\.ssh\chessspeak-ec2.pem                (minute 6:45: agent too)
#   .\whisper-cloud\aws\demo-up.ps1 -LocalOnly                                             (plan B straight away)
# It asks for the 2 public IPs unless -HostIps gives them. Tunnels that already answer on 18201 and 18202 are reused.
# EC2 counts only if BOTH answer /health within -AwsTimeoutSeconds; otherwise the tunnels it opened are closed and
# it starts the 3 containers of compose.local.yml with --no-build. Each process runs in its own window, and
# demo-down.ps1 closes everything this script started. Nothing here talks to AWS except through the SSH tunnels.
param(
  [string]$KeyPath,
  [string[]]$HostIps,
  [ValidateRange(10, 600)][int]$AwsTimeoutSeconds = 90,
  [switch]$TunnelsOnly,
  [switch]$LocalOnly,
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$compose = Join-Path $repo 'whisper-cloud\compose.local.yml'
$stateFile = Join-Path $env:TEMP 'chessspeak-demo.json'
$ec2Ports = @(18201, 18202)
$localPorts = @(18101, 18102, 18103)
$agentUrl = 'http://127.0.0.1:8765'

function Write-Step([string]$Message) { Write-Host "$(Get-Date -Format 'HH:mm:ss') $Message" }
function Test-Listening([int]$Port) { $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) }
function Test-Health([int]$Port) {
  try { (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2).StatusCode -eq 200 } catch { $false }
}
# waits until every port answers /health, probing every 2 s (the tunnel interval of section 8)
function Wait-Health([int[]]$Ports, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ($true) {
    $down = @($Ports | Where-Object { -not (Test-Health $_) })
    if ($down.Count -eq 0) { return $true }
    if ((Get-Date) -gt $deadline) { Write-Step "Sin respuesta en /health: $($down -join ', ')"; return $false }
    Start-Sleep -Seconds 2
  }
}
function Save-State($State) { [System.IO.File]::WriteAllText($stateFile, ($State | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false))) }

if ($TunnelsOnly -and $LocalOnly) { throw '-TunnelsOnly y -LocalOnly no van juntos.' }
if (-not $TunnelsOnly -and (Test-Listening 8765)) { throw 'El puerto 8765 está ocupado: para antes el agente en modo procesos (Ctrl+C en su ventana).' }

# what this script starts, so that demo-down.ps1 can close it, even after a failure halfway
$state = [ordered]@{ startedAt = (Get-Date).ToString('o'); mode = $null; tunnelPids = @(); agentPid = $null; composeStarted = $false }
if (Test-Path $stateFile) {
  $previous = Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
  # the first call of the session dates every window, so demo-down.ps1 still recognises the tunnels it opened
  $state.startedAt = [string]$previous.startedAt
  $state.tunnelPids = @($previous.tunnelPids | Where-Object { $null -ne $_ })
  $state.composeStarted = [bool]$previous.composeStarted
}

$mode = 'local'
if (-not $LocalOnly) {
  $reused = @($ec2Ports | Where-Object { Test-Listening $_ })
  if ($reused.Count -eq $ec2Ports.Count) {
    Write-Step "Los túneles ya escuchan en $($ec2Ports -join ' y '): se reutilizan."
  } elseif ($reused.Count -gt 0) {
    throw "Solo escucha $($reused -join ', '): cierra esa ventana de túnel, o ejecuta demo-down.ps1, y vuelve a empezar."
  } else {
    if ([string]::IsNullOrWhiteSpace($KeyPath)) { throw 'Falta -KeyPath: la clave .pem, fuera del repo.' }
    if ($null -eq $HostIps -or $HostIps.Count -eq 0) {
      $HostIps = @((Read-Host 'IP pública nueva de la instancia 1 (w1)'), (Read-Host 'IP pública nueva de la instancia 2 (w2)'))
    }
    if ($HostIps.Count -ne 2) { throw 'Hacen falta exactamente 2 IP.' }
    foreach ($ip in $HostIps) { if (-not [System.Net.IPAddress]::TryParse($ip.Trim(), [ref]$null)) { throw "No es una IP: $ip" } }
    $tunnel = Join-Path $PSScriptRoot 'tunnel.ps1'
    for ($i = 0; $i -lt 2; $i++) {
      $window = Start-Process powershell -PassThru -ArgumentList @('-NoProfile', '-NoExit', '-File', $tunnel, '-HostIp', $HostIps[$i].Trim(), '-KeyPath', $KeyPath, '-LocalPort', $ec2Ports[$i])
      $state.tunnelPids += $window.Id
      Save-State $state
    }
    Write-Step "Túneles abiertos en ventanas propias. Esperando /health de las 2 instancias, hasta $AwsTimeoutSeconds s..."
  }
  if (Wait-Health $ec2Ports $AwsTimeoutSeconds) {
    $mode = 'ec2'
    Write-Step 'Las 2 instancias responden.'
  } else {
    Write-Step 'EC2 no responde a tiempo: se cierran los túneles y se pasa al plan B local.'
    foreach ($id in $state.tunnelPids) { if (Get-Process -Id $id -ErrorAction SilentlyContinue) { & taskkill /PID $id /T /F | Out-Null } }
    $state.tunnelPids = @()
    Save-State $state
    if ($TunnelsOnly) { throw 'EC2 no respondió. En el minuto 6:45, usa -LocalOnly (plan B).' }
  }
}
if ($TunnelsOnly) {
  $state.mode = 'ec2'
  Save-State $state
  Write-Step 'Listo: túneles comprobados. En el minuto 6:45, para el agente en modo procesos y ejecuta demo-up.ps1 otra vez, sin -TunnelsOnly.'
  exit 0
}

if ($mode -eq 'local') {
  # through cmd: in Windows PowerShell 5.1 a redirected stderr of a native command throws under 'Stop'
  & cmd /c 'docker info >nul 2>&1'
  if ($LASTEXITCODE -ne 0) { throw 'Docker no responde: enciende Docker Desktop. Si no hay Docker, la salida es el pool por procesos (docs/demo-script.md, sección 5).' }
  Write-Step 'Arrancando los 3 contenedores locales (sin construir la imagen)...'
  & docker compose -f $compose up -d --no-build
  if ($LASTEXITCODE -ne 0) { throw "docker compose up terminó con código $LASTEXITCODE." }
  $state.composeStarted = $true
  Save-State $state
  if (-not (Wait-Health $localPorts 60)) { throw 'Los contenedores locales no responden a /health en 60 s.' }
}

$ports = if ($mode -eq 'ec2') { $ec2Ports } else { $localPorts }
$env:WHISPER_URLS = ($ports | ForEach-Object { "http://127.0.0.1:$_" }) -join ','
if ($mode -eq 'ec2') {
  # the values of C4 and section 8 of docs/whisper-cloud-criteria.md
  $env:LB_TIMEOUT_MS = '45000'
  $env:LB_PROBE_INTERVAL_MS = '2000'
} else {
  # plan B keeps the agent defaults, as docs/demo-script.md does
  Remove-Item Env:LB_TIMEOUT_MS, Env:LB_PROBE_INTERVAL_MS -ErrorAction SilentlyContinue
}
$agent = Start-Process powershell -PassThru -WorkingDirectory $repo -ArgumentList @('-NoProfile', '-NoExit', '-Command', 'pnpm --filter @chessspeak/local-agent start')
$state.agentPid = $agent.Id
$state.mode = $mode
Save-State $state
Write-Step "Agente arrancando en su ventana, con WHISPER_URLS=$env:WHISPER_URLS"

$deadline = (Get-Date).AddSeconds(90)
while ($true) {
  try {
    $stats = Invoke-RestMethod -Uri "$agentUrl/lb/stats" -TimeoutSec 2
    if ($stats.mode -eq 'url' -and @($stats.workers | Where-Object { $_.state -ne 'up' }).Count -eq 0) { break }
  } catch { }
  if ((Get-Date) -gt $deadline) { throw 'El agente no tiene todos sus workers up en 90 s. Mira su ventana; demo-down.ps1 cierra lo arrancado.' }
  Start-Sleep -Seconds 2
}
Write-Step "Agente listo: $(@($stats.workers | ForEach-Object { "$($_.id)=$($_.url)" }) -join ' ')"
if (-not $NoBrowser) { Start-Process "$agentUrl/lb/dashboard" }
Write-Host ''
Write-Host "Modo: $(if ($mode -eq 'ec2') { '2 instancias EC2 por túnel SSH' } else { 'plan B, 3 contenedores en este equipo' }). Dashboard: $agentUrl/lb/dashboard"
Write-Host 'Al terminar: .\whisper-cloud\aws\demo-down.ps1'
