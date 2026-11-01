import { describe, expect, it } from 'vitest';
import { checkRunFiles, type CheckFile } from '../src/check.js';

const attempts = (block: string, n: number, extra: object = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: `${block}:p05-${i + 1}:r1`, ...extra }));
const file = (name: string, block: string, n: number, meta: object = {}, extra: object = {}): CheckFile => ({
  name,
  meta: { sessionId: 's', userAgent: 'Edge', ...meta },
  attempts: attempts(block, n, extra),
});
const full = (extra: object = {}, meta: object = {}): CheckFile[] => [
  file('q.json', 'test-quiet', 48, meta, extra),
  file('n.json', 'test-noisy', 48, meta, extra),
  file('s.json', 'silence', 10, meta, extra),
  file('r.json', 'noise', 10, meta, extra),
];

describe('checkRunFiles', () => {
  it('treats files from before the run label as run A with no delay', () => {
    const report = checkRunFiles(full());
    expect(report).toMatchObject({ ok: true, run: 'A', warnings: [] });
  });

  it('accepts a complete run B with delay, WAV and start-up times', () => {
    const report = checkRunFiles(full({ run: 'B', releaseDelayMs: 400, startupMs: 250, audioFile: 'x.wav' }));
    expect(report).toMatchObject({ ok: true, run: 'B', warnings: [] });
    expect(report.info.join(' ')).toContain('mediana 250 ms');
  });

  it('refuses to mix runs A and B', () => {
    const report = checkRunFiles([...full().slice(0, 1), file('b.json', 'test-noisy', 48, { run: 'B', releaseDelayMs: 400 })]);
    expect(report.ok).toBe(false);
    expect(report.errors.join(' ')).toContain('mezcla corridas');
  });

  it('refuses duplicated attempts, as when a session was not restarted between exports', () => {
    const quiet = file('q.json', 'test-quiet', 48);
    const report = checkRunFiles([quiet, { ...quiet, name: 'q2.json' }]);
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toContain('duplicado');
  });

  it('checks the delay of each run', () => {
    expect(checkRunFiles(full({ run: 'B', releaseDelayMs: 0 })).errors.join(' ')).toContain('se fijó en 400');
    expect(checkRunFiles(full({ run: 'A', releaseDelayMs: 400 })).errors.join(' ')).toContain('no tiene retardo');
  });

  it('refuses synthetic and improvised files and warns about wrong block sizes', () => {
    expect(checkRunFiles([file('x.fake.json', 'test-quiet', 48)]).ok).toBe(false);
    expect(checkRunFiles([file('i.json', 'imp', 10, { improvised: true })]).ok).toBe(false);
    expect(checkRunFiles([file('q.json', 'test-quiet', 47)]).warnings.join(' ')).toContain('47 intentos');
  });
});
