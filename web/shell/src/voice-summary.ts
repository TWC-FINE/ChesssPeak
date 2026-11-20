import { voiceSummaryResponseSchema, type Rate, type RecognizerSummary, type VoiceSummaryResponse } from '@chessspeak/shared';
import { ApiError } from './api.js';

type Fetch = typeof fetch;

const RECOGNIZER_TEXT: Record<RecognizerSummary['recognizer'], string> = {
  webspeech: 'Web Speech',
  whisper: 'Whisper local',
  text: 'Texto',
  fake: 'Falso (pruebas)',
};

/** GET /voice-metrics/summary, checked against the contract. */
export async function fetchVoiceSummary(apiUrl: string, fetcher: Fetch = fetch): Promise<VoiceSummaryResponse> {
  let response: Response;
  try {
    response = await fetcher(`${apiUrl}/voice-metrics/summary`);
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.');
  }
  if (!response.ok) throw new ApiError('No se pudo leer la telemetría de voz.');
  const body = voiceSummaryResponseSchema.safeParse(await response.json().catch(() => null));
  if (!body.success) throw new ApiError('El servidor respondió algo inesperado.');
  return body.data;
}

/** "87,2 %": a share as the rest of the docs write it. */
export function percentText(value: number): string {
  return `${(value * 100).toFixed(1).replace('.', ',')} %`;
}

/** "87,2 % (IC95 78,0–93,0)", or a dash without cases. */
export function rateText(rate: Rate | null): string {
  if (rate === null) return '—';
  return `${percentText(rate.value)} (IC95 ${(rate.low * 100).toFixed(1).replace('.', ',')}–${(rate.high * 100).toFixed(1).replace('.', ',')})`;
}

/** "0,57 / 0,62 s", or a dash without times. */
export function latencyText(times: RecognizerSummary['recognitionMs']): string {
  if (times === null) return '—';
  const seconds = (ms: number) => (ms / 1000).toFixed(2).replace('.', ',');
  return `${seconds(times.p50)} / ${seconds(times.p95)} s`;
}

export interface VoiceSummaryState {
  summary: VoiceSummaryResponse | null;
  error: string;
}

function cell(tag: 'th' | 'td', text: string): HTMLTableCellElement {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

/** The page of the route #/voz: one row per recognizer, and what the numbers mean. */
export function renderVoiceSummary(host: HTMLElement, state: VoiceSummaryState, refresh: () => void): void {
  // the section head of the shell already names the page
  const again = document.createElement('button');
  again.type = 'button';
  again.dataset.action = 'refresh-voice';
  again.textContent = 'Actualizar';
  again.addEventListener('click', refresh);
  const head = document.createElement('div');
  head.className = 'cs-voice-head';
  head.append(again);
  const children: HTMLElement[] = [head];

  const note = (text: string, alert = false) => {
    const element = document.createElement('p');
    element.className = 'cs-voice-note';
    if (alert) element.setAttribute('role', 'alert');
    element.textContent = text;
    children.push(element);
  };

  const summary = state.summary;
  if (state.error !== '') note(state.error, true);
  if (summary === null) {
    if (state.error === '') note('Cargando…');
  } else if (summary.attempts === 0) {
    note('Aún no hay intentos de voz guardados.');
  } else {
    const since = new Date(summary.since!).toLocaleString('es-CO');
    const until = new Date(summary.until!).toLocaleString('es-CO');
    note(`Los ${summary.attempts} intentos más recientes de partidas (como mucho ${summary.limit}), del ${since} al ${until}.`);
    const table = document.createElement('table');
    table.className = 'cs-voice-table';
    const header = document.createElement('tr');
    for (const text of ['Reconocedor', 'Intentos', 'Silencios', 'Propuestas', 'Confirmadas', 'Ambiguas', 'No entendidas', 'Comandos', 'Reconocimiento p50 / p95', 'Total p50 / p95']) {
      header.append(cell('th', text));
    }
    const body = document.createElement('tbody');
    for (const row of summary.recognizers) {
      const line = document.createElement('tr');
      line.dataset.recognizer = row.recognizer;
      line.append(
        cell('td', RECOGNIZER_TEXT[row.recognizer]),
        cell('td', String(row.attempts)),
        cell('td', String(row.silences)),
        cell('td', String(row.proposed)),
        cell('td', `${row.confirmed} · ${rateText(row.confirmedRate)}`),
        cell('td', String(row.outcomes.ambiguous)),
        cell('td', String(row.outcomes.nomatch)),
        cell('td', String(row.outcomes.command)),
        cell('td', latencyText(row.recognitionMs)),
        cell('td', latencyText(row.totalMs)),
      );
      body.append(line);
    }
    const thead = document.createElement('thead');
    thead.append(header);
    table.append(thead, body);
    const wrap = document.createElement('div');
    wrap.className = 'cs-voice-wrap';
    wrap.append(table);
    children.push(wrap);
    note(
      '«Confirmadas» son las jugadas propuestas que el jugador confirmó: no es precisión, porque no se sabe qué quiso decir. ' +
        'Las latencias dejan fuera los silencios. Lo escrito en la caja de texto no se registra.',
    );
  }
  host.replaceChildren(...children);
}
