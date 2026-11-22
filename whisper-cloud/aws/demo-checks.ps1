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
