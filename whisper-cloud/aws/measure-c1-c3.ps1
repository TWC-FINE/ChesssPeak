# C1 and C3 of the EC2 addendum: 3 repetitions of the 78 valid clips of the test split, through the SSH tunnel
# (docs/whisper-cloud-criteria.md, section 6). Run tunnel.ps1 in another window first, and C2 before this,
# so the instance is warm.
#   .\whisper-cloud\aws\measure-c1-c3.ps1 -OutDir <folder outside the repo> `
#     -ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas -VpnApagada
# It stops at the first failed repetition. At the end it prints C1 (p95 of the worst repetition) and C3.
param(
  [Parameter(Mandatory)][string]$OutDir,
  [Parameter(Mandatory)][switch]$ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas,
  [Parameter(Mandatory)][switch]$VpnApagada,
  [int]$LocalPort = 18201,
  [ValidateRange(1, 3)][int[]]$Repeticiones = @(1, 2, 3)
)
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas.IsPresent) { throw 'Sin confirmación no se envía ningún clip a la nube.' }
if (-not $VpnApagada.IsPresent) { throw 'El criterio mide C1 con la VPN apagada.' }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$out = (Resolve-Path $OutDir).Path
if ($out.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'OutDir debe estar fuera del repo: la evidencia se limpia antes de publicarla.' }

$url = "http://127.0.0.1:$LocalPort"
$ok = try { (Invoke-WebRequest "$url/health" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { $false }
if (-not $ok) { throw "No responde $url/health: abre antes el túnel con tunnel.ps1." }

$logs = @()
Push-Location $repo
try {
  foreach ($n in $Repeticiones) {
    $label = "ec2-c7i-flex-r$n"
    # environment record without process lists: only what goes to the evidence
    @(
      "Corrida: $label"
      "Fecha: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))"
      "RAM libre en el equipo del responsable: {0:N0} MB" -f ((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB)
      'VPN: apagada (confirmado por el responsable al lanzar el script)'
      "Destino: whisper-server de la instancia EC2 a través del túnel SSH ($url)"
    ) | Out-File (Join-Path $out "entorno-$label.txt") -Encoding utf8

    Write-Host "=== $label"
    $log = Join-Path $out "benchmark-$label.txt"
    $lines = & pnpm --filter '@chessspeak/spike-whisper-local' benchmark --url $url --models small --prompt on --label $label --out-dir $out
    $code = $LASTEXITCODE
    $lines | Out-File $log -Encoding utf8
    $lines | Select-Object -Last 12
    if ($code -ne 0) { throw "La repetición $n terminó con código $code. PARA y revisa $log." }
    $logs += $log
  }
} finally {
  Pop-Location
}

& node (Join-Path $PSScriptRoot 'summarize-c1-c3.mjs') @logs
