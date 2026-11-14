# Experimento con una instancia EC2 en `us-east-2`

Guía para lanzar **un** worker de Whisper en AWS EC2 y medir C1, C2, C3 y C5 de la [adenda de EC2](../../docs/whisper-cloud-criteria.md), sección 6. Esa adenda y su tabla de precios se fijaron antes de lanzar nada. C4 necesita 2 instancias y no forma parte de este experimento.

**Todo lo hace el responsable del repo**, desde la consola de AWS y desde su equipo. Aquí no hay CLI de AWS ni credenciales, y ningún script toca AWS. Lo marcado `[S]` no está verificado.

| Archivo | Qué hace |
|---|---|
| [`user-data.sh`](user-data.sh) | Primer arranque de la instancia: instala Docker, construye la imagen de la fase A desde el `Dockerfile` fijado (comprobado con SHA-256) y la arranca publicada **solo en `127.0.0.1`** |
| [`tunnel.ps1`](tunnel.ps1) | Túnel SSH `127.0.0.1:18201` → instancia → `127.0.0.1:8080` |
| [`measure-c2.ps1`](measure-c2.ps1) | C2: primer clip en una instancia recién arrancada |
| [`measure-c1-c3.ps1`](measure-c1-c3.ps1) | C1 y C3: 3 repeticiones de los 78 clips a través del túnel |
| [`summarize-c1-c3.mjs`](summarize-c1-c3.mjs) | Aplica C1 (p95 de la peor repetición) y C3 (top-1 ≥ 68 en cada repetición) a los registros. Probado con los de la fase A |
| [`cleanup-local.ps1`](cleanup-local.ps1) | Cierra túneles y limpia `known_hosts`, y recuerda los pasos de limpieza en la consola |

## 0. Antes de empezar

- [ ] Región **`us-east-2` (Ohio)** seleccionada arriba a la derecha de la consola, en todos los pasos.
- [ ] El presupuesto de 5 USD existe y tiene alertas. Las alertas avisan, pero **no limitan** el gasto.
- [ ] Facturación: la cuenta está en el plan gratuito, con su saldo de créditos a la vista.
- [ ] Has leído los precios de la adenda. Con todo encendido, cuesta unos **0,09 USD por hora**.
- [ ] Para medir: VPN apagada y aplicaciones pesadas cerradas.
- [ ] Los clips de `spike/recordings` son grabaciones tuyas, y das el OK para enviarlos **en esta prueba**. Los scripts lo exigen con `-ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas`.

## 1. Par de claves

1. EC2 > **Pares de claves** > Crear par de claves.
2. Nombre `chessspeak-ec2`, tipo **ED25519**, formato **.pem**.
3. Guarda el `.pem` **fuera del repo**, por ejemplo en `%USERPROFILE%\.ssh\chessspeak-ec2.pem`. Los scripts se niegan a usar una clave que esté dentro del repo.
4. Deja que solo tu usuario pueda leerla. Si otros usuarios pueden leer la clave, OpenSSH la rechaza:

   ```powershell
   icacls $HOME\.ssh\chessspeak-ec2.pem /inheritance:r /grant:r "$($env:USERNAME):R"
   ```

## 2. Grupo de seguridad

1. EC2 > **Grupos de seguridad** > Crear. Nombre `chessspeak-whisper-ssh`, en la VPC por defecto.
2. **Una sola regla de entrada:** SSH, TCP 22, origen **Mi IP**. Comprueba que termina en **`/32`**. Nunca `0.0.0.0/0`.
3. Salida: la de por defecto. La instancia necesita descargar paquetes, el `Dockerfile`, whisper.cpp y el modelo.
4. No añadas ninguna regla para el 8080: Whisper no se expone.

Si tu IP cambia, edita esa regla con la nueva `/32`.

## 3. Lanzar la instancia

EC2 > **Instancias** > Lanzar instancias:

| Campo | Valor |
|---|---|
| Nombre | `chessspeak-whisper-1` |
| Etiqueta adicional | `Project` = `chessspeak` |
| AMI | **Ubuntu Server 24.04 LTS**, 64 bits (x86), marcada como apta para la capa gratuita |
| Tipo | **`c7i-flex.large`** |
| Par de claves | `chessspeak-ec2` |
| Red | VPC por defecto, **asignar IP pública: habilitar**, grupo de seguridad existente `chessspeak-whisper-ssh` |
| Almacenamiento | **16 GiB gp3**, sin IOPS ni rendimiento extra, **eliminar al terminar: sí** |
| Detalles avanzados > Metadatos | IMDSv2 **obligatorio** |
| Detalles avanzados > Datos de usuario | Pega el contenido completo de `user-data.sh` |

Lanza la instancia y apunta la hora.

## 4. Esperar a la imagen

La instancia descarga y compila whisper.cpp, y después descarga el modelo `small`. Calcula **unos 15–40 min** `[S]`.

```powershell
ssh -i $HOME\.ssh\chessspeak-ec2.pem ubuntu@<IP pública>
sudo tail -f /var/log/chessspeak-userdata.log     # termina con «listo <fecha>»
sudo ss -ltnp | grep 8080                          # debe decir 127.0.0.1:8080, nunca 0.0.0.0
```

Desde tu equipo, `Test-NetConnection <IP pública> -Port 8080` debe **fallar**.

Si el registro termina en error, o el puerto escucha en `0.0.0.0`: **para la instancia y PARA**.

## 5. Medir

Hazlo en este orden: C2 sirve también de calentamiento para C1.

1. **Para la instancia** (Estado de instancia > Detener) y espera a que figure como «Detenida». Al arrancar de nuevo, su IP pública cambia.
2. **C2.** Pulsa Start en la consola cuando el script te lo pida:

   ```powershell
   .\whisper-cloud\aws\measure-c2.ps1 -KeyPath $HOME\.ssh\chessspeak-ec2.pem -OutDir C:\chessspeak-ec2 -ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas
   ```

3. **El túnel**, en otra ventana, con la IP nueva. Déjala abierta:

   ```powershell
   .\whisper-cloud\aws\tunnel.ps1 -HostIp <IP pública> -KeyPath $HOME\.ssh\chessspeak-ec2.pem
   ```

4. **C1 y C3:** 3 repeticiones de 78 clips, unos 30 min en total `[S]`:

   ```powershell
   .\whisper-cloud\aws\measure-c1-c3.ps1 -OutDir C:\chessspeak-ec2 -ConfirmoQueSonMisGrabacionesYAutorizoEnviarlas -VpnApagada
   ```

   Al final se imprimen C1 y C3. Para volver a calcularlos:

   ```powershell
   node whisper-cloud\aws\summarize-c1-c3.mjs C:\chessspeak-ec2\benchmark-ec2-c7i-flex-r1.txt C:\chessspeak-ec2\benchmark-ec2-c7i-flex-r2.txt C:\chessspeak-ec2\benchmark-ec2-c7i-flex-r3.txt
   ```

5. **C5:** al terminar, Facturación > **Inicio** y **Créditos**. Anota el gasto de la prueba y el saldo de créditos, y comprueba que no hay cargos a la tarjeta. El coste llega con varias horas de retraso, así que repítelo al día siguiente.

**Si algo falla** (un script lanza un error, `/health` no responde o una repetición termina con error): **para la instancia y PARA**. No repitas a ciegas.

## 6. Después de cada sesión

- [ ] Cierra el túnel con Ctrl+C.
- [ ] Para la instancia (Detener). Detenida no cobra horas de instancia ni la IP pública asignada `[S]`, pero **sí el volumen**: 16 GB × 0,08 USD/GB-mes.
- [ ] EC2 > Instancias: el estado es «Detenida».
- [ ] Facturación > Inicio: el gasto acumulado.

## 7. Limpieza final (tras la prueba o tras la entrega)

1. EC2 > Instancias > **Terminar** `chessspeak-whisper-1`.
2. EC2 > **Volúmenes**: no queda ninguno de esa instancia (se borra al terminarla, si marcaste «eliminar al terminar»).
3. EC2 > **Grupos de seguridad**: borra `chessspeak-whisper-ssh`.
4. EC2 > **Pares de claves**: borra `chessspeak-ec2`. Si quieres, borra también el `.pem` local.
5. En tu equipo: `.\whisper-cloud\aws\cleanup-local.ps1 -HostIps <IP1>,<IP2>`.
6. Facturación > Inicio y Créditos: ningún recurso cobrando y ningún cargo a la tarjeta. Vuelve a mirarlo al día siguiente.

## 8. Evidencia

Los registros quedan en `-OutDir`, fuera del repo. Antes de publicarlos en `docs/evidence/`:

- cambia las rutas por `<repo>` y `<carpeta-de-salida>`;
- **quita la IP pública** de la instancia;
- no incluyas listas de procesos ni nombres de programas;
- normaliza a LF y sin BOM, y genera `SHA256SUMS` con `sha256sum -t`;
- comprueba los hashes contra los blobs de git.
