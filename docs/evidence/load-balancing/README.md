# Evidencia de la prueba de carga de Whisper

Archivos originales de las corridas citadas en [docs/load-balancing.md](../../load-balancing.md). Las cifras de ese documento salen de ellos y no se editaron a mano. Se revisó que no tengan rutas personales ni datos sensibles.

| Dónde se cita | Archivos |
|---|---|
| Secciones 6.1 a 6.4 y filas «4 nov» de la 6.5 | `load-2026-11-04T18-43-34-563Z-monolito.json` · `load-2026-11-04T18-47-15-289Z-balanceado.json` |
| Filas «5 nov (rep. 2)» de la 6.5 | `load-2026-11-06T03-00-18-944Z-rep2-monolito.json` · `load-2026-11-06T03-03-06-605Z-rep2-balanceado.json` |
| Filas «5 nov (rep. 3)» de la 6.5 | `load-2026-11-06T03-06-18-722Z-rep3-monolito.json` · `load-2026-11-06T03-09-03-404Z-rep3-balanceado.json` |
| Ensayo de la demo, sección 7 | `load-2026-11-06T03-12-14-706Z-demo-kill-w2.json` |
| Salida en consola de las repeticiones y del ensayo, incluidos la muerte de w2 y los contadores finales | `comparacion-y-ensayo-2026-11-05.txt` |

- **Fechas:** los nombres usan UTC. Las corridas con fecha 6 de noviembre en el nombre se hicieron la noche del 5, hora local (UTC−5).
- **RAM libre:** el log la mide antes de arrancar el agente, y los JSON con el agente ya cargado. Por eso no coinciden.
- **Único cambio en el log:** un final de línea CRLF pasó a LF, porque así lo guarda git en este repositorio.
- **Sin evidencia aquí:** las pruebas de la primera tabla de la sección 7 no guardaron archivos.

Para comprobar los archivos, desde esta carpeta: `sha256sum -c SHA256SUMS`.
