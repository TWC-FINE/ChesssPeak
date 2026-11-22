# Tests of demo-checks.ps1, with no framework so they run the same in Windows PowerShell 5.1 and in PowerShell 7 (CI):
#   powershell -NoProfile -ExecutionPolicy Bypass -File whisper-cloud\aws\demo-checks.test.ps1
#   pwsh -NoProfile -File whisper-cloud/aws/demo-checks.test.ps1
# Exits with 1 if any case fails. It only writes temporary files, and deletes them.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'demo-checks.ps1')

$failures = 0
$dir = Join-Path ([System.IO.Path]::GetTempPath()) ("demo-checks-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir | Out-Null

function Write-Case([string]$Name, [string]$Text, [bool]$Bom = $false) {
  $path = Join-Path $dir "$Name.json"
  [System.IO.File]::WriteAllText($path, $Text, (New-Object System.Text.UTF8Encoding($Bom)))
  $path
}
function Test-Case([string]$Name, [scriptblock]$Check) {
  try { & $Check; Write-Host "ok     $Name" } catch { $script:failures++; Write-Host "FALLA  ${Name}: $($_.Exception.Message)" }
}
# the block must throw, and the message must contain every expected piece
function Assert-Throws([scriptblock]$Block, [string[]]$Expected) {
  $message = $null
  try { & $Block } catch { $message = $_.Exception.Message }
  if ($null -eq $message) { throw 'no lanzó ningún error' }
  foreach ($piece in $Expected) { if (-not $message.Contains($piece)) { throw "el mensaje no contiene «$piece»: $message" } }
}
function Assert-Equal($Actual, $Expected) { if ($Actual -ne $Expected) { throw "esperaba «$Expected» y obtuve «$Actual»" } }

try {
  # R3: a missing or empty config says so, instead of «Falta la clave .pem»
  Test-Case 'R3 sin demo.json' { Assert-Throws { Read-DemoConfig (Join-Path $dir 'no-existe.json') } @('No existe', 'demo.example.json', 'demo.json.txt') }
  Test-Case 'R3 demo.json vacío' { $p = Write-Case 'vacio' ''; Assert-Throws { Read-DemoConfig $p } @('está vacío') }
  Test-Case 'R3 demo.json solo con espacios' { $p = Write-Case 'espacios' "  `r`n "; Assert-Throws { Read-DemoConfig $p } @('está vacío') }
  Test-Case 'R3 una carpeta no es demo.json' { Assert-Throws { Read-DemoConfig $dir } @('No existe') }

  # R2: a path written with \ is either invalid JSON (\U) or valid JSON with a control character (\r, \t)
  Test-Case 'R2 ruta con \U: JSON no válido' {
    $p = Write-Case 'barra-u' '{ "keyPath": "C:\Users\demo\clave.pem", "hostIps": ["192.0.2.1", "192.0.2.2"] }'
    Assert-Throws { Read-DemoConfig $p } @('no es JSON válido', 'escríbela con /')
  }
  Test-Case 'R2 ruta con \r y \t: JSON válido pero con un carácter de control' {
    $p = Write-Case 'barra-r' '{ "keyPath": "C:\repo\tmp.pem", "hostIps": ["192.0.2.1", "192.0.2.2"] }'
    Assert-Throws { Read-DemoConfig $p } @('carácter de control', 'con /')
  }
  Test-Case 'R2 texto que no es JSON' { $p = Write-Case 'texto' 'hola'; Assert-Throws { Read-DemoConfig $p } @('no es JSON válido') }

  # the paths that must keep working: / and \\, with or without BOM (the Bloc de notas writes one)
  Test-Case 'válido con /' {
    $c = Read-DemoConfig (Write-Case 'barras' '{ "keyPath": "C:/carpeta/clave.pem", "hostIps": ["192.0.2.1", "192.0.2.2"] }')
    Assert-Equal $c.keyPath 'C:/carpeta/clave.pem'
    Assert-Equal $c.hostIps.Count 2
    Assert-Equal $c.hostIps[1] '192.0.2.2'
  }
  Test-Case 'válido con \\' {
    $c = Read-DemoConfig (Write-Case 'dobles' '{ "keyPath": "C:\\carpeta\\clave.pem", "hostIps": ["192.0.2.1", "192.0.2.2"] }')
    Assert-Equal $c.keyPath 'C:\carpeta\clave.pem'
  }
  Test-Case 'válido con BOM' {
    $c = Read-DemoConfig (Write-Case 'bom' '{ "keyPath": "C:/carpeta/clave.pem", "hostIps": ["192.0.2.1", "192.0.2.2"] }' $true)
    Assert-Equal $c.keyPath 'C:/carpeta/clave.pem'
  }
  Test-Case 'la plantilla del repo se lee, y sus IP de ejemplo no son IP' {
    $c = Read-DemoConfig (Join-Path $PSScriptRoot 'demo.example.json')
    Assert-Equal $c.hostIps.Count 2
    Assert-Equal ([System.Net.IPAddress]::TryParse($c.hostIps[0], [ref]$null)) $false
  }
  Test-Case 'sin hostIps da una lista vacía' {
    $c = Read-DemoConfig (Write-Case 'sin-ips' '{ "keyPath": "C:/carpeta/clave.pem" }')
    Assert-Equal $c.hostIps.Count 0
  }

  # R1: an agent already on 8765 is reused only in process mode
  Test-Case 'R1 agente en modo procesos: se reutiliza' { Assert-LocalAgentReusable ([pscustomobject]@{ ok = $true; mode = 'process' }) }
  Test-Case 'R1 agente en modo URLs: para' { Assert-Throws { Assert-LocalAgentReusable ([pscustomobject]@{ ok = $true; mode = 'url' }) } @('modo url', 'fuera del equipo', 'demo-down') }
  Test-Case 'R1 sin modo en /health: para' { Assert-Throws { Assert-LocalAgentReusable ([pscustomobject]@{ ok = $true }) } @('modo desconocido') }
  Test-Case 'R1 el puerto no responde como agente: para' { Assert-Throws { Assert-LocalAgentReusable $null 8765 } @('8765', 'no responde como agente') }

  # the web: config.js as build-web.mjs writes it
  $good = "window.CS_CONFIG = {`n  `"PUBLIC_API_URL`": `"https://chessspeak-server.onrender.com`",`n  `"PUBLIC_AGENT_URL`": `"http://127.0.0.1:8765`",`n  `"PUBLIC_CLOUD_AGENT_URL`": `"http://127.0.0.1:8766`",`n  `"PUBLIC_MF_TIMEOUT_MS`": `"5000`"`n};`n"
  Test-Case 'web sin web/dist: para' { Assert-Throws { Read-WebConfig (Join-Path $dir 'dist-no-existe') } @('index.html', 'pnpm build:web', '-NoWeb') }
  Test-Case 'web sin config.js: para' {
    $dist = Join-Path $dir 'dist-sin-config'
    New-Item -ItemType Directory -Path $dist | Out-Null
    Set-Content -LiteralPath (Join-Path $dist 'index.html') -Value '<!doctype html>'
    Assert-Throws { Read-WebConfig $dist } @('config.js', 'pnpm build:web')
  }
  Test-Case 'web con index.html y config.js: devuelve config.js' {
    $dist = Join-Path $dir 'dist-completo'
    New-Item -ItemType Directory -Path $dist | Out-Null
    Set-Content -LiteralPath (Join-Path $dist 'index.html') -Value '<!doctype html>'
    [System.IO.File]::WriteAllText((Join-Path $dist 'config.js'), $good, (New-Object System.Text.UTF8Encoding($false)))
    Assert-Equal (Read-WebConfig $dist) $good
  }
  Test-Case 'config.js completo: sin avisos' { Assert-Equal @(Get-WebConfigWarnings $good).Count 0 }
  Test-Case 'config.js sin el 8766: avisa' {
    $w = @(Get-WebConfigWarnings ($good -replace '"http://127.0.0.1:8766"', '""'))
    Assert-Equal $w.Count 1
    if (-not $w[0].Contains('PUBLIC_CLOUD_AGENT_URL')) { throw $w[0] }
  }
  Test-Case 'config.js con PUBLIC_API_URL vacío: avisa' {
    $w = @(Get-WebConfigWarnings ($good -replace '"https://chessspeak-server.onrender.com"', '""'))
    Assert-Equal $w.Count 1
    if (-not $w[0].Contains('vacío')) { throw $w[0] }
  }
  Test-Case 'config.js con PUBLIC_API_URL local: avisa' {
    $w = @(Get-WebConfigWarnings ($good -replace 'https://chessspeak-server.onrender.com', 'http://localhost:3000'))
    Assert-Equal $w.Count 1
    if (-not $w[0].Contains('no Render')) { throw $w[0] }
  }
  Test-Case 'config.js sin PUBLIC_AGENT_URL: avisa' {
    $w = @(Get-WebConfigWarnings ($good -replace '"http://127.0.0.1:8765"', '""'))
    Assert-Equal $w.Count 1
    if (-not $w[0].Contains('Whisper local')) { throw $w[0] }
  }
  Test-Case 'config.js que no es CS_CONFIG: avisa' { Assert-Equal @(Get-WebConfigWarnings 'hola').Count 1 }
  Test-Case 'build desactualizado: solo las fuentes posteriores al build' {
    $built = [datetime]'2026-11-22T10:00:00'
    $items = @([pscustomobject]@{ Name = 'antes'; LastWriteTime = $built.AddMinutes(-5) }, [pscustomobject]@{ Name = 'despues'; LastWriteTime = $built.AddMinutes(5) })
    $newer = @(Get-NewerSources $built $items)
    Assert-Equal $newer.Count 1
    Assert-Equal $newer[0].Name 'despues'
    Assert-Equal @(Get-NewerSources $built @()).Count 0
  }
  Test-Case '5500 con la web de ChessSpeak: se reutiliza' { Assert-WebPortUsable $good 5500 }
  Test-Case '5500 ocupado por otra cosa: para' { Assert-Throws { Assert-WebPortUsable '<html>Live Server</html>' 5500 } @('5500', 'otra cosa', '-NoWeb') }
  Test-Case '5500 ocupado sin responder: para' { Assert-Throws { Assert-WebPortUsable $null 5500 } @('5500', 'otra cosa') }
} finally {
  Remove-Item -LiteralPath $dir -Recurse -Force
}

if ($failures -gt 0) { Write-Host "$failures caso(s) fallaron."; exit 1 }
Write-Host 'Todos los casos pasan.'
exit 0
