# Local cleanup after an EC2 session. It touches nothing in AWS (there is no AWS CLI here): the instance, its
# volume, the security group and the key pair are removed from the console, following the README checklist.
#   .\whisper-cloud\aws\cleanup-local.ps1 -HostIps <ip1>,<ip2>
# Closes any tunnel left open on the local port and forgets the instance host keys in known_hosts.
param(
  [string[]]$HostIps = @(),
  [int]$LocalPort = 18201
)
$ErrorActionPreference = 'Stop'

$tunnels = Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" | Where-Object { $_.CommandLine -like "*127.0.0.1:${LocalPort}:127.0.0.1:8080*" }
foreach ($t in $tunnels) { Stop-Process -Id $t.ProcessId -Force; "Túnel cerrado (PID $($t.ProcessId))" }
if (-not $tunnels) { 'No había ningún túnel abierto.' }
if (Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue) { "AVISO: el puerto $LocalPort sigue ocupado." }

foreach ($ip in $HostIps) {
  if (-not [System.Net.IPAddress]::TryParse($ip, [ref]$null)) { "Se ignora «$ip»: no es una IP."; continue }
  & ssh-keygen -R $ip 2>$null | Out-Null
  "known_hosts: entrada de $ip eliminada (si existía)."
}

''
'Falta en la consola de AWS (us-east-2), según whisper-cloud/aws/README.md, sección «Limpieza final»:'
'  1. EC2 > Instancias: terminar la instancia (o pararla si queda otra sesión).'
'  2. EC2 > Volúmenes: ningún volumen con la etiqueta Project=chessspeak.'
'  3. EC2 > Grupos de seguridad: borrar chessspeak-whisper-ssh.'
'  4. EC2 > Pares de claves: borrar chessspeak-ec2 (y, si quieres, el .pem local).'
'  5. Facturación > Inicio y Créditos: revisar el gasto y el saldo de créditos.'
