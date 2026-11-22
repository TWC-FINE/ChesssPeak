# Checks of demo-up.ps1 that need no port, window or network, so demo-checks.test.ps1 can run them anywhere, also in CI
# (Windows PowerShell 5.1 and PowerShell 7). Dot-source it: . (Join-Path $PSScriptRoot 'demo-checks.ps1')

# R2 and R3 of the review of #89: the local config (demo.json) with clear messages when it is missing, empty, not
# valid JSON or holds a path written with \, which JSON reads as an escape: \U breaks the file, \r or \t pass silently
# and leave a control character in the path.
function Read-DemoConfig([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "No existe $Path. Copia ahí whisper-cloud/aws/demo.example.json y escribe la ruta de la .pem y las 2 IP elásticas (cuidado con que el Bloc de notas no lo guarde como demo.json.txt)."
  }
  $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($text)) { throw "$Path está vacío. Usa la plantilla whisper-cloud/aws/demo.example.json." }
  try {
    $config = $text | ConvertFrom-Json
  } catch {
    throw "$Path no es JSON válido. Si la ruta de keyPath lleva \, escríbela con / (C:/carpeta/clave.pem) o con \\. Detalle: $($_.Exception.Message)"
  }
  if ($null -eq $config) { throw "$Path está vacío. Usa la plantilla whisper-cloud/aws/demo.example.json." }
  $keyPath = [string]$config.keyPath
  if ($keyPath -match '[\x00-\x1F]') {
    throw "keyPath de $Path tiene un carácter de control: en JSON, \r, \t o \n dentro de una ruta no son barras. Escribe la ruta con / (C:/carpeta/clave.pem) o con \\."
  }
  [pscustomobject]@{ keyPath = $keyPath; hostIps = @($config.hostIps | Where-Object { $null -ne $_ } | ForEach-Object { [string]$_ }) }
}

# R1 of the review of #89: an agent already on 8765 is reused for «Whisper local» only if it is in process mode. One in
# URL mode (the old demo procedure) would send the audio of «Whisper local» out of the machine. $Health is the parsed
# /health of that port, or $null when it did not answer.
function Assert-LocalAgentReusable($Health, [int]$Port = 8765) {
  if ($null -eq $Health) {
    throw "El puerto $Port está ocupado, pero no responde como agente (/health). Cierra lo que lo usa y vuelve a ejecutar demo-up."
  }
  if ([string]$Health.mode -ne 'process') {
    $mode = if ([string]::IsNullOrWhiteSpace([string]$Health.mode)) { 'desconocido' } else { [string]$Health.mode }
    throw "El agente del $Port está en modo $mode, no en modo procesos: «Whisper local» enviaría el audio fuera del equipo. Ciérralo (Ctrl+C en su ventana, o demo-down) y vuelve a ejecutar demo-up, que lo arranca en modo procesos."
  }
}

# The web of the demo (web/dist on 127.0.0.1:5500), which demo-up.ps1 serves unless -NoWeb. These checks run before any
# tunnel or agent starts. Read-WebConfig stops when web/dist was never built: demo-up.ps1 does not build it on its own.
function Read-WebConfig([string]$DistPath) {
  foreach ($name in @('index.html', 'config.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $DistPath $name) -PathType Leaf)) {
      throw "Falta web\dist\${name}: ejecuta pnpm build:web y vuelve a ejecutar demo-up (o demo-up -NoWeb, sin la web)."
    }
  }
  Get-Content -LiteralPath (Join-Path $DistPath 'config.js') -Raw -Encoding UTF8
}

# the values of config.js (window.CS_CONFIG = {...};), or $null when the text is not that
function ConvertFrom-WebConfig([string]$Text) {
  if ($Text -notmatch '^\s*window\.CS_CONFIG\s*=\s*(\{[\s\S]*\})\s*;?\s*$') { return $null }
  try { $Matches[1] | ConvertFrom-Json } catch { $null }
}

# what in config.js would spoil the demo: no server, or no agent for one of the Whisper choices. Warnings, not stops.
function Get-WebConfigWarnings([string]$Text, [int]$LocalAgentPort = 8765, [int]$CloudAgentPort = 8766) {
  $config = ConvertFrom-WebConfig $Text
  if ($null -eq $config) { return @('web\dist\config.js no tiene la forma window.CS_CONFIG = {...}: vuelve a ejecutar pnpm build:web.') }
  $warnings = @()
  $api = [string]$config.PUBLIC_API_URL
  if ([string]::IsNullOrWhiteSpace($api)) {
    $warnings += 'PUBLIC_API_URL está vacío: la página no puede crear partidas. Ponlo en web\shell\.env (https://chessspeak-server.onrender.com) y ejecuta pnpm build:web.'
  } elseif ($api -match '^https?://(127\.0\.0\.1|localhost)(:|/|$)') {
    $warnings += "PUBLIC_API_URL es $api, un servidor de este equipo, no Render. Si no es lo que quieres, cámbialo en web\shell\.env y ejecuta pnpm build:web."
  }
  if (-not ([string]$config.PUBLIC_AGENT_URL).Contains("127.0.0.1:$LocalAgentPort")) {
    $warnings += "PUBLIC_AGENT_URL no es http://127.0.0.1:${LocalAgentPort}: «Whisper local» no llegará a su agente. Cámbialo en web\shell\.env y ejecuta pnpm build:web."
  }
  if (-not ([string]$config.PUBLIC_CLOUD_AGENT_URL).Contains("127.0.0.1:$CloudAgentPort")) {
    $warnings += "web\dist no tiene PUBLIC_CLOUD_AGENT_URL=http://127.0.0.1:${CloudAgentPort}: la página no ofrecerá «Whisper en la nube (EC2)». Añádela en web\shell\.env y ejecuta pnpm build:web."
  }
  $warnings
}

# the sources changed after the build ($BuiltAt, the time of config.js): web/dist may be out of date
function Get-NewerSources([datetime]$BuiltAt, $Items) {
  @($Items | Where-Object { $null -ne $_ -and $_.LastWriteTime -gt $BuiltAt })
}

# a port 5500 already in use is reused only if it serves the config.js of a ChessSpeak build; $Served is what it answered
# to /config.js, or $null when it did not answer
function Assert-WebPortUsable($Served, [int]$Port = 5500) {
  if ($null -eq (ConvertFrom-WebConfig ([string]$Served))) {
    throw "El puerto $Port está ocupado por otra cosa (¿Live Server con otra carpeta?): no sirve la web de ChessSpeak. Ciérralo y vuelve a ejecutar demo-up (o demo-up -NoWeb, sin la web)."
  }
}
