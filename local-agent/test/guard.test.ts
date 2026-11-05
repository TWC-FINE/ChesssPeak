import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { GUARD_SCRIPT, spawnGuarded } from '../src/guard.js';

// A stand-in for whisper-server: a Node process that never exits on its own.
const FOREVER = ['-e', 'setInterval(() => {}, 1000)'];

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function waitUntil(condition: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return condition();
}

describe('guarded worker processes', () => {
  it('stop() kills the guarded process', async () => {
    const proc = await spawnGuarded(process.execPath, FOREVER, process.cwd());
    expect(alive(proc.pid)).toBe(true);
    await proc.stop();
    expect(await waitUntil(() => !alive(proc.pid))).toBe(true);
  });

  it('reports the guard as exited when the guarded process dies on its own', async () => {
    const proc = await spawnGuarded(process.execPath, ['-e', 'setTimeout(() => {}, 100)'], process.cwd());
    await expect(proc.exited).resolves.toBeUndefined();
  });

  it('rejects when the program cannot be started', async () => {
    await expect(spawnGuarded('definitely-not-a-real-binary-xyz', [], process.cwd())).rejects.toThrow();
  });

  it('kills the guarded process when its parent is killed hard (no handler runs)', async () => {
    // a parent that starts a guard the same way spawnGuarded does, prints the guard's message as one JSON line and waits
    const parentScript = `
      const { spawn } = require('node:child_process');
      const cfg = JSON.stringify({ command: process.execPath, args: ${JSON.stringify(FOREVER)}, cwd: process.cwd(), parentPid: process.pid });
      const guard = spawn(process.execPath, ['-e', ${JSON.stringify(GUARD_SCRIPT)}, cfg], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      guard.on('message', (m) => console.log(JSON.stringify(m)));
      setInterval(() => {}, 1000);
    `;
    const parent = spawn(process.execPath, ['-e', parentScript], { stdio: ['ignore', 'pipe', 'inherit'] });
    try {
      // stdout may arrive in pieces: wait for a whole line
      const line = await new Promise<string>((resolve, reject) => {
        let buffer = '';
        parent.stdout.on('data', (chunk: Buffer) => {
          buffer += String(chunk);
          const end = buffer.indexOf('\n');
          if (end !== -1) resolve(buffer.slice(0, end).trim());
        });
        parent.once('exit', (code) => reject(new Error(`the parent exited (${code}) before reporting a PID`)));
      });
      const message = JSON.parse(line) as { pid?: number; error?: string };
      expect(message.error).toBeUndefined();
      const pid = message.pid!;
      expect(Number.isInteger(pid)).toBe(true);
      expect(await waitUntil(() => alive(pid), 500)).toBe(true);

      parent.kill('SIGKILL');
      expect(await waitUntil(() => !alive(pid))).toBe(true);
    } finally {
      // if an assertion failed before the kill, do not leave the parent, its guard and the child running
      if (parent.exitCode === null && parent.signalCode === null) parent.kill('SIGKILL');
    }
  });
});
