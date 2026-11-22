# Balancing demo in one step (docs/demo-script.md), with two agents side by side, so the recognizer is chosen in the page:
# - 127.0.0.1:8765, process mode: «Whisper local». The audio stays on this machine.
# - 127.0.0.1:8766, URL mode: «Whisper en la nube (EC2)», over the 2 SSH tunnels, with the 3 local containers of
#   compose.local.yml as plan B when EC2 does not answer.
#   demo-up.cmd                                       (double click: everything, reading the local config)
#   .\whisper-cloud\aws\demo-up.ps1 -TunnelsOnly      (15 min before: tunnels only)
#   .\whisper-cloud\aws\demo-up.ps1 -LocalOnly        (plan B straight away)
# The key path and the 2 Elastic IPs come from -KeyPath and -HostIps or, when they are not given, from the local config
# -ConfigPath, outside the repo (template: demo.example.json). Tunnels that already answer on 18201 and 18202 are reused,
# and so is an agent already listening on 8765. EC2 counts only if BOTH instances answer /health within
# -AwsTimeoutSeconds; otherwise the tunnels it opened are closed and the 8766 agent uses the 3 containers instead.
# Each process runs in its own window, and demo-down.ps1 closes everything this script started. Nothing here talks to
# AWS except through the SSH tunnels.
param(
  [string]$KeyPath,
  [string[]]$HostIps,
  [string]$ConfigPath = (Join-Path $env:LOCALAPPDATA 'ChessSpeak\demo.json'),
  [ValidateRange(10, 600)][int]$AwsTimeoutSeconds = 90,
  [switch]$TunnelsOnly,
  [switch]$LocalOnly,
  [switch]$NoLocalAgent,
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$compose = Join-Path $repo 'whisper-cloud\compose.local.yml'
$stateFile = Join-Path $env:TEMP 'chessspeak-demo.json'
$ec2Ports = @(18201, 18202)
$localPorts = @(18101, 18102, 18103)
$localAgentPort = 8765
$cloudAgentPort = 8766

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
# the agent on that port answers /lb/stats in that mode with every worker up
function Wait-Agent([int]$Port, [string]$Mode, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ($true) {
    try {
      $stats = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/lb/stats" -TimeoutSec 2
      if ($stats.mode -eq $Mode -and @($stats.workers | Where-Object { $_.state -ne 'up' }).Count -eq 0) { return $stats }
    } catch { }
    if ((Get-Date) -gt $deadline) { return $null }
    Start-Sleep -Seconds 2
  }
}
function Save-State($State) { [System.IO.File]::WriteAllText($stateFile, ($State | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false))) }
function Test-InRepo([string]$Path) { [System.IO.Path]::GetFullPath($Path).StartsWith($repo, [StringComparison]::OrdinalIgnoreCase) }
# the agent in its own window. The environment is set inside that window, so nothing leaks from this one or between agents.
# Every window gets -ExecutionPolicy Bypass for its own process, as demo-up.cmd does: pnpm may be a .ps1 shim
function Start-Agent([string]$Environment) {
  $command = "$Environment pnpm --filter @chessspeak/local-agent start"
  Start-Process powershell -PassThru -WorkingDirectory $repo -ArgumentList @('-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $command)
}

if ($TunnelsOnly -and $LocalOnly) { throw '-TunnelsOnly y -LocalOnly no van juntos.' }
if (-not $TunnelsOnly -and (Test-Listening $cloudAgentPort)) { throw "El puerto $cloudAgentPort está ocupado: ¿ya hay un agente de EC2? Ejecuta demo-down.ps1 y vuelve a empezar." }
# the local config holds the IPs and the key path: inside the repo they could end up in a commit
if (Test-InRepo $ConfigPath) { throw 'La configuración local no puede estar dentro del repo.' }

# what this script starts, so that demo-down.ps1 can close it, even after a failure halfway
$state = [ordered]@{ startedAt = (Get-Date).ToString('o'); mode = $null; tunnelPids = @(); agentPid = $null; localAgentPid = $null; composeStarted = $false }
if (Test-Path $stateFile) {
  $previous = Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
  # the first call of the session dates every window, so demo-down.ps1 still recognises the tunnels it opened
  $state.startedAt = [string]$previous.startedAt
  $state.tunnelPids = @($previous.tunnelPids | Where-Object { $null -ne $_ })
  $state.localAgentPid = $previous.localAgentPid
  $state.composeStarted = [bool]$previous.composeStarted
}

# Whisper local first: its model loads while the tunnels connect
if (-not $TunnelsOnly -and -not $NoLocalAgent) {
  if (Test-Listening $localAgentPort) {
    Write-Step "Ya hay un agente en el ${localAgentPort}: se reutiliza para «Whisper local»."
  } else {
    $window = Start-Agent "Remove-Item Env:WHISPER_URLS, Env:AGENT_PORT, Env:LB_TIMEOUT_MS, Env:LB_PROBE_INTERVAL_MS -ErrorAction SilentlyContinue;"
    $state.localAgentPid = $window.Id
    Save-State $state
    Write-Step "Agente de «Whisper local» arrancando en su ventana, en modo procesos, en el $localAgentPort."
  }
}

$mode = 'local'
if (-not $LocalOnly) {
  $reused = @($ec2Ports | Where-Object { Test-Listening $_ })
  if ($reused.Count -eq $ec2Ports.Count) {
    Write-Step "Los túneles ya escuchan en $($ec2Ports -join ' y '): se reutilizan."
  } elseif ($reused.Count -gt 0) {
    throw "Solo escucha $($reused -join ', '): cierra esa ventana de túnel, o ejecuta demo-down.ps1, y vuelve a empezar."
  } else {
    if (([string]::IsNullOrWhiteSpace($KeyPath) -or $null -eq $HostIps -or $HostIps.Count -eq 0) -and (Test-Path $ConfigPath)) {
      $config = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ([string]::IsNullOrWhiteSpace($KeyPath)) { $KeyPath = [string]$config.keyPath }
      if ($null -eq $HostIps -or $HostIps.Count -eq 0) { $HostIps = @($config.hostIps | ForEach-Object { [string]$_ }) }
      Write-Step "Clave e IP leídas de la configuración local."
    }
    if ([string]::IsNullOrWhiteSpace($KeyPath)) { throw "Falta la clave .pem: -KeyPath, o keyPath en $ConfigPath (plantilla: demo.example.json)." }
    if ($null -eq $HostIps -or $HostIps.Count -ne 2) { throw "Hacen falta exactamente 2 IP: -HostIps, o hostIps en $ConfigPath." }
    foreach ($ip in $HostIps) { if (-not [System.Net.IPAddress]::TryParse($ip.Trim(), [ref]$null)) { throw "No es una IP: $ip (revisa hostIps en $ConfigPath)" } }
    $tunnel = Join-Path $PSScriptRoot 'tunnel.ps1'
    for ($i = 0; $i -lt 2; $i++) {
      # Start-Process in Windows PowerShell 5.1 does not quote the arguments, so paths with spaces get quotes here
      $window = Start-Process powershell -PassThru -ArgumentList @('-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$tunnel`"", '-HostIp', $HostIps[$i].Trim(), '-KeyPath', "`"$KeyPath`"", '-LocalPort', $ec2Ports[$i])
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
    if ($TunnelsOnly) { throw 'EC2 no respondió. Usa demo-up.ps1 -LocalOnly (plan B).' }
  }
}
if ($TunnelsOnly) {
  $state.mode = 'ec2'
  Save-State $state
  Write-Step 'Listo: túneles comprobados. Para los dos agentes, ejecuta demo-up.ps1 otra vez, sin -TunnelsOnly.'
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
$urls = ($ports | ForEach-Object { "http://127.0.0.1:$_" }) -join ','
# EC2 takes the values of C4 and section 8 of docs/whisper-cloud-criteria.md; plan B keeps the agent defaults
$timing = if ($mode -eq 'ec2') { "`$env:LB_TIMEOUT_MS='45000'; `$env:LB_PROBE_INTERVAL_MS='2000';" } else { 'Remove-Item Env:LB_TIMEOUT_MS, Env:LB_PROBE_INTERVAL_MS -ErrorAction SilentlyContinue;' }
$agent = Start-Agent "`$env:AGENT_PORT='$cloudAgentPort'; `$env:WHISPER_URLS='$urls'; $timing"
$state.agentPid = $agent.Id
$state.mode = $mode
Save-State $state
Write-Step "Agente de «Whisper en la nube (EC2)» arrancando en su ventana, en el $cloudAgentPort, con WHISPER_URLS=$urls"

$stats = Wait-Agent $cloudAgentPort 'url' 90
if ($null -eq $stats) { throw "El agente del $cloudAgentPort no tiene todos sus workers up en 90 s. Mira su ventana; demo-down.ps1 cierra lo arrancado." }
Write-Step "Agente del $cloudAgentPort listo: $(@($stats.workers | ForEach-Object { "$($_.id)=$($_.url)" }) -join ' ')"

$localReady = $NoLocalAgent -or ($null -ne (Wait-Agent $localAgentPort 'process' 90))
if (-not $localReady) { Write-Step "AVISO: el agente del $localAgentPort no está listo. La página mostrará «Whisper local» como «no responde»; mira su ventana." }

# the page only offers the EC2 choice if web/dist was built with the second agent
$webConfig = Join-Path $repo 'web\dist\config.js'
if (-not ((Test-Path $webConfig) -and (Select-String -Path $webConfig -SimpleMatch "127.0.0.1:$cloudAgentPort" -Quiet))) {
  Write-Step "AVISO: web\dist no tiene PUBLIC_CLOUD_AGENT_URL=http://127.0.0.1:$cloudAgentPort. Añádela en web\shell\.env y ejecuta pnpm build:web."
}

if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$cloudAgentPort/lb/dashboard" }
Write-Host ''
Write-Host "Whisper en la nube (EC2): $(if ($mode -eq 'ec2') { '2 instancias EC2 por túnel SSH' } else { 'plan B, 3 contenedores en este equipo' }). Dashboard: http://127.0.0.1:$cloudAgentPort/lb/dashboard"
Write-Host "Whisper local: $(if ($NoLocalAgent) { 'no arrancado (-NoLocalAgent)' } elseif ($localReady) { "listo en http://127.0.0.1:$localAgentPort" } else { 'no está listo' })"
Write-Host 'En la página: «Reconocedor» y elegir la opción. Al terminar: demo-down.cmd o .\whisper-cloud\aws\demo-down.ps1'
