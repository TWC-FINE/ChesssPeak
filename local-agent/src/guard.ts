import { spawn, type ChildProcess } from 'node:child_process';

// Every whisper-server runs under a tiny Node "guard" connected to the agent by an IPC channel.
// If the agent dies in any way (Ctrl+C, a crash, or a hard kill that runs no handler at all), the
// operating system closes that channel; the guard sees 'disconnect' and kills its whisper-server.
// A poll on the parent PID is the fallback. Plain JavaScript run with `node -e`, so it needs no loader.
export const GUARD_SCRIPT = `
const { spawn } = require('node:child_process');
const cfg = JSON.parse(process.argv[1]);
const child = spawn(cfg.command, cfg.args, { cwd: cfg.cwd, stdio: 'ignore', windowsHide: true });
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  try { child.kill(); } catch {}
  setTimeout(() => process.exit(1), 3000).unref();
};
child.once('spawn', () => process.send && process.send({ pid: child.pid }));
child.once('error', (error) => {
  if (process.send) process.send({ error: error.message });
  process.exit(1);
});
child.once('exit', (code) => process.exit(code === null ? 1 : code));
process.once('disconnect', stop);
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
setInterval(() => {
  try { process.kill(cfg.parentPid, 0); } catch { stop(); }
}, 500);
`;

export interface GuardedProcess {
  /** PID of the guarded program (whisper-server), not of the guard. */
  readonly pid: number;
  /** Resolves once the guard has exited (it only exits after its child). */
  readonly exited: Promise<void>;
  /** Asks the guard to kill its child and waits; kills both directly if that takes too long. */
  stop(): Promise<void>;
  /** Synchronous best effort, for the agent's 'exit' handler. */
  killNow(): void;
}

export function spawnGuarded(command: string, args: string[], cwd: string, stopTimeoutMs = 5000): Promise<GuardedProcess> {
  const config = JSON.stringify({ command, args, cwd, parentPid: process.pid });
  const guard: ChildProcess = spawn(process.execPath, ['-e', GUARD_SCRIPT, config], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true,
  });
  let gone = false;
  const exited = new Promise<void>((resolve) => {
    guard.once('exit', () => {
      gone = true;
      resolve();
    });
  });

  return new Promise<GuardedProcess>((resolve, reject) => {
    guard.once('error', reject);
    void exited.then(() => reject(new Error(`${command} terminó al arrancar`)));
    guard.once('message', (message: { pid?: number; error?: string }) => {
      if (message.pid === undefined) {
        reject(new Error(`No pude lanzar ${command}: ${message.error ?? 'error desconocido'}`));
        return;
      }
      const pid = message.pid;
      const killNow = (): void => {
        if (gone) return;
        for (const kill of [() => process.kill(pid), () => guard.kill()]) {
          try {
            kill();
          } catch {
            // already gone
          }
        }
      };
      const stop = async (): Promise<void> => {
        if (gone) return;
        if (guard.connected) guard.disconnect();
        const timer = setTimeout(killNow, stopTimeoutMs);
        await exited;
        clearTimeout(timer);
      };
      resolve({ pid, exited, stop, killNow });
    });
  });
}
