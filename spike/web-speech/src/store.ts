import type { AttemptRecord, ResultsFile, ResultsMeta } from '@chessspeak/voice-parser';

const KEY = 'chessspeak.spike.web-speech.session';

export interface StoredSession {
  sessionId: string;
  createdAt: string;
  attempts: AttemptRecord[];
  /** Trial ids already recorded as WAV in record-only mode. */
  recordedOnly: string[];
}

export function newSession(now: Date = new Date()): StoredSession {
  return {
    sessionId: now.toISOString().replace(/[:.]/g, '-'),
    createdAt: now.toISOString(),
    attempts: [],
    recordedOnly: [],
  };
}

// localStorage is only a convenience (it survives a page reload); the exported
// JSON file is the real record. Every access is guarded.
export function loadSession(): StoredSession | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? undefined : (JSON.parse(raw) as StoredSession);
  } catch {
    return undefined;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // storage full or blocked: the export button still works
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function toResultsFile(session: StoredSession, meta: Omit<ResultsMeta, 'schema' | 'sessionId' | 'createdAt' | 'recognizer'>): ResultsFile {
  return {
    meta: {
      schema: 1,
      sessionId: session.sessionId,
      recognizer: 'webspeech',
      createdAt: session.createdAt,
      ...meta,
    },
    attempts: session.attempts,
  };
}

// Improvised attempts live apart from the measured session: "Empezar sesión nueva"
// does not touch them and they are exported to their own file.
const IMPROVISED_KEY = 'chessspeak.spike.web-speech.improvised';

export interface ImprovisedSession {
  sessionId: string;
  createdAt: string;
  attempts: AttemptRecord[];
}

export function newImprovised(now: Date = new Date()): ImprovisedSession {
  return { sessionId: now.toISOString().replace(/[:.]/g, '-'), createdAt: now.toISOString(), attempts: [] };
}

export function loadImprovised(): ImprovisedSession | undefined {
  try {
    const raw = localStorage.getItem(IMPROVISED_KEY);
    return raw === null ? undefined : (JSON.parse(raw) as ImprovisedSession);
  } catch {
    return undefined;
  }
}

export function saveImprovised(session: ImprovisedSession): void {
  try {
    localStorage.setItem(IMPROVISED_KEY, JSON.stringify(session));
  } catch {
    // storage full or blocked: the export button still works
  }
}

export function toImprovisedFile(
  session: ImprovisedSession,
  meta: Omit<ResultsMeta, 'schema' | 'sessionId' | 'createdAt' | 'recognizer'>,
): ResultsFile {
  return {
    meta: { schema: 1, sessionId: session.sessionId, recognizer: 'webspeech', createdAt: session.createdAt, ...meta, improvised: true } as ResultsMeta,
    attempts: session.attempts,
  };
}

export function downloadJson(name: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
