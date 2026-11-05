# Prueba de viabilidad del análisis post-partida

Código desechable: responde si vale la pena construir el análisis con un pool de Stockfish. Lanza el motor directamente y no toca el producto. Los criterios están en [docs/analysis-criteria.md](../../docs/analysis-criteria.md) y la decisión en [docs/analysis-gate.md](../../docs/analysis-gate.md).

```bash
pnpm --filter @chessspeak/spike-analysis-gate download    # Stockfish sf_19 en stockfish/ (fuera de git), con SHA-256 verificado
pnpm --filter @chessspeak/spike-analysis-gate preflight   # comprueba la CPU en reposo y los programas abiertos
pnpm --filter @chessspeak/spike-analysis-gate calibrate   # elige la profundidad con la partida de calibración
pnpm --filter @chessspeak/spike-analysis-gate measure     # 9 corridas; salta las que ya tienen resultado
pnpm --filter @chessspeak/spike-analysis-gate report      # tabla y decisión a partir de results/
```
