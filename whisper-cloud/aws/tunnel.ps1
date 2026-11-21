# SSH tunnel from this machine to the whisper-server of one EC2 worker (docs/whisper-cloud-criteria.md, sections 6 and 8).
#   .\whisper-cloud\aws\tunnel.ps1 -HostIp <public IP> -KeyPath $HOME\.ssh\chessspeak-ec2.pem
# Leave the window open; Ctrl+C closes the tunnel. The agent or the benchmark then use http://127.0.0.1:18201.
# Nothing else of the instance is reachable: the container listens on its 127.0.0.1.
#
# Section 8 (T-stop): keepalives every 5 s, and ssh exits after 2 of them go unanswered. A dead link then closes the
# local port in about 10 s instead of 90 s, so the agent sees the worker fail and retries the request elsewhere.
# When ssh exits, it is started again after -RetryDelaySeconds. The retries have a cap: after -MaxRetries attempts
# in a row that did not stay up -StableSeconds, the script gives up. -MaxRetries 0 keeps the old behaviour.
param(
  [Parameter(Mandatory)][string]$HostIp,
  [Parameter(Mandatory)][string]$KeyPath,
  [int]$LocalPort = 18201,
  [string]$User = 'ubuntu',
  [ValidateRange(0, 100)][int]$MaxRetries = 40,
  [ValidateRange(1, 60)][int]$RetryDelaySeconds = 5,
  [ValidateRange(10, 3600)][int]$StableSeconds = 60
)
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$key = (Resolve-Path $KeyPath).Path
if ($key.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'La clave privada no puede estar dentro del repo.' }
if (-not [System.Net.IPAddress]::TryParse($HostIp, [ref]$null)) { throw "HostIp no es una IP: $HostIp" }
if (Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue) { throw "El puerto local $LocalPort ya está ocupado (¿otro túnel abierto?)." }

function Write-Event([string]$Message) { Write-Host "$(Get-Date -Format 'HH:mm:ss') $Message" }

Write-Host "Túnel 127.0.0.1:$LocalPort -> $User@$HostIp -> 127.0.0.1:8080. Ctrl+C para cerrarlo."
Write-Host "Si ssh se cae, se reconecta cada $RetryDelaySeconds s; se rinde tras $MaxRetries intentos seguidos fallidos."
$failures = 0
while ($true) {
  $started = Get-Date
  Write-Event 'conectando'
  # BatchMode: an unattended reconnection never waits for a password prompt
  # ConnectTimeout: a stopped instance fails each attempt in 10 s instead of the TCP default
  ssh -i $key -N `
    -o BatchMode=yes -o ConnectTimeout=10 -o ExitOnForwardFailure=yes `
    -o ServerAliveInterval=5 -o ServerAliveCountMax=2 -o StrictHostKeyChecking=accept-new `
    -L "127.0.0.1:${LocalPort}:127.0.0.1:8080" "$User@$HostIp"
  $code = $LASTEXITCODE
  $lasted = [int]((Get-Date) - $started).TotalSeconds
  # an attempt that stayed up long enough was a working tunnel, so the count of failures starts again
  if ($lasted -ge $StableSeconds) { $failures = 0 } else { $failures++ }
  if ($failures -gt $MaxRetries) {
    Write-Event "ssh terminó (código $code) tras $lasted s. Sin más reintentos: $MaxRetries seguidos sin conectar."
    exit 1
  }
  Write-Event "ssh terminó (código $code) tras $lasted s. Reintento $failures de $MaxRetries en $RetryDelaySeconds s."
  Start-Sleep -Seconds $RetryDelaySeconds
}
