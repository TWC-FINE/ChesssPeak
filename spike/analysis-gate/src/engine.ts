import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { parseBestMove, parseInfo, toWhitePov } from './uci.js';

export interface EngineResult {
  evalWhite: number;
  bestMove: string;
  /** Depth of the line the evaluation came from: lower than asked only if the engine stopped early (mate, no moves). */
  depthReached: number;
}

interface Waiter {
  match(line: string): boolean;
  resolve(line: string): void;
  reject(error: Error): void;
}

/** One Stockfish process, spoken to over stdin/stdout, doing one search at a time. */
export class Engine {
  private readonly child: ChildProcessWithoutNullStreams;
  private waiter: Waiter | undefined;
  private lastInfo: { depth: number; score: number } | undefined;
  private exitError: Error | undefined;

  constructor(path: string) {
    this.child = spawn(path, [], { cwd: dirname(path), windowsHide: true });
    createInterface({ input: this.child.stdout }).on('line', (line) => this.onLine(line));
    const fail = (message: string): void => {
      this.exitError = new Error(message);
      this.waiter?.reject(this.exitError);
      this.waiter = undefined;
    };
    this.child.once('error', (error) => fail(`No pude lanzar Stockfish: ${error.message}`));
    this.child.once('exit', (code) => fail(`Stockfish terminó (código ${code})`));
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  async init(threads: number, hashMb: number): Promise<void> {
    this.send('uci');
    await this.waitFor((line) => line === 'uciok');
    this.send(`setoption name Threads value ${threads}`);
    this.send(`setoption name Hash value ${hashMb}`);
    this.send('isready');
    await this.waitFor((line) => line === 'readyok');
  }

  async analyse(fen: string, depth: number): Promise<EngineResult> {
    this.lastInfo = undefined;
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
    const line = await this.waitFor((candidate) => parseBestMove(candidate) !== undefined);
    if (this.lastInfo === undefined) throw new Error(`Stockfish no dio evaluación para ${fen}`);
    const info: { depth: number; score: number } = this.lastInfo;
    return { evalWhite: toWhitePov(info.score, fen), bestMove: parseBestMove(line)!, depthReached: info.depth };
  }

  /** Asks it to quit and waits; kills it if it does not leave in time. */
  async quit(timeoutMs = 5000): Promise<void> {
    if (this.child.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => this.child.once('exit', () => resolve()));
    const timer = setTimeout(() => this.child.kill(), timeoutMs);
    this.send('quit');
    await exited;
    clearTimeout(timer);
  }

  private send(command: string): void {
    if (this.exitError !== undefined) throw this.exitError;
    this.child.stdin.write(`${command}\n`);
  }

  private waitFor(match: (line: string) => boolean): Promise<string> {
    if (this.exitError !== undefined) return Promise.reject(this.exitError);
    return new Promise((resolve, reject) => {
      this.waiter = { match, resolve, reject };
    });
  }

  private onLine(line: string): void {
    const info = parseInfo(line);
    // the last line wins: it is the deepest finished iteration
    if (info !== undefined) this.lastInfo = info;
    if (this.waiter?.match(line)) {
      const { resolve } = this.waiter;
      this.waiter = undefined;
      resolve(line);
    }
  }
}
