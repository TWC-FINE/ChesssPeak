# SSH tunnel from this machine to the whisper-server of one EC2 worker (docs/whisper-cloud-criteria.md, section 6).
#   .\whisper-cloud\aws\tunnel.ps1 -HostIp <public IP> -KeyPath $HOME\.ssh\chessspeak-ec2.pem
# Leave the window open while measuring; Ctrl+C closes the tunnel. The agent or the benchmark then use
# http://127.0.0.1:18201. Nothing else of the instance is reachable: the container listens on its 127.0.0.1.
param(
  [Parameter(Mandatory)][string]$HostIp,
  [Parameter(Mandatory)][string]$KeyPath,
  [int]$LocalPort = 18201,
  [string]$User = 'ubuntu'
)
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$key = (Resolve-Path $KeyPath).Path
if ($key.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'La clave privada no puede estar dentro del repo.' }
if (-not [System.Net.IPAddress]::TryParse($HostIp, [ref]$null)) { throw "HostIp no es una IP: $HostIp" }
if (Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue) { throw "El puerto local $LocalPort ya está ocupado (¿otro túnel abierto?)." }

Write-Host "Túnel 127.0.0.1:$LocalPort -> $User@$HostIp -> 127.0.0.1:8080. Ctrl+C para cerrarlo."
# ExitOnForwardFailure: fail instead of running without the forward; keepalives detect a dead link in about 90 s
ssh -i $key -N `
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new `
  -L "127.0.0.1:${LocalPort}:127.0.0.1:8080" "$User@$HostIp"
