# C2 of the EC2 addendum: the first clip on a freshly started instance (docs/whisper-cloud-criteria.md, section 6).
#   .\whisper-cloud\aws\measure-c2.ps1 -KeyPath $HOME\.ssh\chessspeak-ec2.pem -OutDir <folder outside the repo> `
#     -ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas
# Start with the instance STOPPED. The script asks you to press Enter when you click Start in the console, then
# for the new public IP. It opens the tunnel, probes /health every 15 s (never faster: it is a cloud instance),
# and as soon as it answers sends ONE clip. C2: that first clip within 30 s. The time from Start to /health is
# recorded with no threshold. It sends exactly one WAV, and only with the confirmation switch.
param(
  [Parameter(Mandatory)][string]$KeyPath,
  [Parameter(Mandatory)][string]$OutDir,
  [Parameter(Mandatory)][switch]$ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas,
  [string]$Wav = 'spike\recordings\p05-01_quiet_r1_runB.wav',
  [int]$LocalPort = 18201,
  [string]$User = 'ubuntu',
  [int]$TimeoutMinutes = 15
)
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas.IsPresent) { throw 'Sin confirmación no se envía ningún clip a la nube.' }
$key = (Resolve-Path $KeyPath).Path
if ($key.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'La clave privada no puede estar dentro del repo.' }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$out = (Resolve-Path $OutDir).Path
if ($out.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'OutDir debe estar fuera del repo: la evidencia se limpia antes de publicarla.' }
$wavPath = (Resolve-Path (Join-Path $repo $Wav)).Path
if (Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue) { throw "El puerto local $LocalPort ya está ocupado (¿otro túnel abierto?)." }

Read-Host 'Pulsa Start en la consola de EC2 y, en ese mismo momento, Enter aquí'
$t0 = Get-Date
$ip = Read-Host 'Escribe la IP pública nueva de la instancia en cuanto aparezca'
if (-not [System.Net.IPAddress]::TryParse($ip, [ref]$null)) { throw "No es una IP: $ip" }

$sshArgs = @('-i', $key, '-N', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'ConnectTimeout=10', '-L', "127.0.0.1:${LocalPort}:127.0.0.1:8080", "$User@$ip")
$tunnel = $null
$deadline = $t0.AddMinutes($TimeoutMinutes)
$healthAt = $null
try {
  while ((Get-Date) -lt $deadline) {
    if ($null -eq $tunnel -or $tunnel.HasExited) {
      $tunnel = Start-Process -FilePath 'ssh' -ArgumentList $sshArgs -PassThru -WindowStyle Hidden
      Start-Sleep -Seconds 3
    }
    $ok = try { (Invoke-WebRequest "http://127.0.0.1:$LocalPort/health" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { $false }
    if ($ok) { $healthAt = Get-Date; break }
    Start-Sleep -Seconds 15
  }
  if ($null -eq $healthAt) { throw "La instancia no respondió a /health en $TimeoutMinutes min. Revisa la consola y PARA." }

  # the first clip, as the benchmark sends it: the image fixes language and prompt on the server side
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $status = & curl.exe -s -o NUL -w '%{http_code}' -F "file=@$wavPath;type=audio/wav" -F 'response_format=json' -F 'temperature=0.0' `
    --max-time 120 "http://127.0.0.1:$LocalPort/inference"
  $watch.Stop()
  $firstClip = [math]::Round($watch.Elapsed.TotalSeconds, 2)
  $toHealth = [math]::Round(($healthAt - $t0).TotalSeconds, 0)
  $c2 = if ($status -eq '200' -and $firstClip -le 30) { 'CUMPLE' } else { 'NO CUMPLE' }

  $report = @(
    "C2 · instancia recién arrancada · $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))"
    "De Start a /health 200 (sin umbral, con sondeo cada 15 s): $toHealth s"
    "Primer clip ($(Split-Path $Wav -Leaf)): HTTP $status en $firstClip s (umbral 30 s) -> $c2"
  )
  $report | Out-File (Join-Path $out "c2-$($t0.ToString('yyyyMMdd-HHmmss')).txt") -Encoding utf8
  $report
} finally {
  if ($null -ne $tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
}
