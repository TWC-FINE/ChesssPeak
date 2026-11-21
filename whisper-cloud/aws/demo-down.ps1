# Closes what demo-up.ps1 started: the agent window, the tunnel windows and, if it started them, the 3 local
# containers. Then it reminds you what is left in the EC2 console, which no script here touches.
#   .\whisper-cloud\aws\demo-down.ps1
#   .\whisper-cloud\aws\demo-down.ps1 -KeepContainers     (leaves the local containers running)
param([switch]$KeepContainers)
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$compose = Join-Path $repo 'whisper-cloud\compose.local.yml'
$stateFile = Join-Path $env:TEMP 'chessspeak-demo.json'
if (-not (Test-Path $stateFile)) { Write-Host 'No hay ninguna demo registrada por demo-up.ps1: no se cierra nada.'; exit 1 }
$state = Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json

# a pid is closed only while it is still a PowerShell window started after demo-up.ps1 began
$since = [datetime]$state.startedAt
foreach ($id in @(@($state.agentPid) + @($state.tunnelPids) | Where-Object { $null -ne $_ })) {
  $process = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($null -eq $process) { Write-Host "pid $id ya no existe."; continue }
  if ($process.ProcessName -ne 'powershell' -or $process.StartTime -lt $since) { Write-Host "pid $id no es una ventana de la demo: no se toca."; continue }
  # /T closes what runs inside the window too: pnpm and node for the agent, ssh for a tunnel
  & taskkill /PID $id /T /F | Out-Null
  Write-Host "Cerrada la ventana $id."
}
if ($state.composeStarted -and -not $KeepContainers) {
  & docker compose -f $compose down
  if ($LASTEXITCODE -ne 0) { throw "docker compose down terminó con código $LASTEXITCODE." }
}
Remove-Item $stateFile
Write-Host ''
Write-Host 'Falta, en la consola de EC2 (us-east-2), si se usó EC2:'
Write-Host '  - Detener (no Terminar) las 2 instancias y comprobar que figuran como «Detenida».'
Write-Host '  - Una IP elástica asociada se cobra también con la instancia parada (0,005 USD/h cada una).'
exit 0
