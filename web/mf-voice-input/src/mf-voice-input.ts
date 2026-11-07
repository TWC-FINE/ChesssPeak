import { LitElement, html, type PropertyValues } from 'lit';
import { resolve, type Resolution } from '@chessspeak/voice-parser';
import { CS_EVENT_INIT, releaseDelayOf, type CsEventDetail, type CsEventName, type VoiceAttemptPayload, type VoiceInputContext } from '@chessspeak/shared';
import { buildAttempt } from './attempt.js';
import type { Listening, RecognitionFailure, RecognitionOutcome, SpeechRecognizer } from './recognizers/recognizer.js';
import ownCss from './styles.css?inline';

// Light DOM means the styles are global: inject them once.
const STYLE_ID = 'csv-styles';
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = ownCss;
  document.head.append(style);
}

type Position = CsEventDetail<'cs:position'>;
interface Candidate {
  ply: number;
  uci: string;
  san: string;
  source: 'voice' | 'text';
}

const SILENCE: Resolution = { kind: 'nomatch', candidates: [] };

const FAILURE_MESSAGES: Record<Exclude<RecognitionFailure, 'no-speech' | 'aborted'>, string> = {
  'not-allowed': 'El navegador no deja usar el micrófono. Permítelo o usa la caja de texto.',
  network: 'No hay conexión con el reconocedor. Usa la caja de texto.',
  unavailable: 'El reconocedor no está disponible. Usa la caja de texto.',
  other: 'No se pudo reconocer. Inténtalo de nuevo o usa la caja de texto.',
};

/**
 * Voice and text box: phrase → parser → candidate → explicit confirmation (RF8). Nothing is ever played without it.
 * It has no socket: it only talks through cs:* events, <mf-game> sends the confirmed move and the shell forwards the telemetry.
 */
export class MfVoiceInput extends LitElement {
  static override properties = { context: { attribute: false }, speech: { attribute: false } };
  declare context: VoiceInputContext | undefined;
  declare speech: SpeechRecognizer | undefined;

  private position: Position | undefined;
  private candidate: Candidate | undefined;
  /** The telemetry of the spoken candidate: `accepted` is only known when it is confirmed or dropped. */
  private pendingAttempt: VoiceAttemptPayload | undefined;
  private talk: { position: Position; session: Listening } | undefined;
  private processing = false;
  private tries = { ply: 0, count: 0 };
  private ended = false;
  private message = '';

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('cs:position', this.onPosition);
    document.addEventListener('cs:game-ended', this.onEnded);
    const detail: CsEventDetail<'cs:mf-ready'> = { v: 1, name: 'mf-voice-input' };
    this.dispatchEvent(new CustomEvent('cs:mf-ready', { ...CS_EVENT_INIT, detail }));
  }

  override disconnectedCallback(): void {
    document.removeEventListener('cs:position', this.onPosition);
    document.removeEventListener('cs:game-ended', this.onEnded);
    this.abortTalk();
    super.disconnectedCallback();
  }

  protected override willUpdate(changed: PropertyValues): void {
    // a route change: what was being said or proposed belongs to the previous game
    if (changed.has('context') && this.position !== undefined && this.position.gameId !== this.context?.gameId) {
      this.abortTalk();
      this.dropCandidate('position-changed');
    }
  }

  protected override render() {
    const context = this.context;
    return html`<div class="csv-root">
      <h2 class="csv-title">Tu jugada</h2>
      ${this.speech?.isAvailable() === true ? this.renderTalkButton() : ''}
      <form class="csv-form" @submit=${this.onSubmit}>
        <label class="csv-label">Escribe la jugada o un comando
          <input class="csv-input" name="move" autocomplete="off" placeholder="caballo efe tres" ?disabled=${!this.canType()} />
        </label>
        <button type="submit" ?disabled=${!this.canType()}>Enviar</button>
      </form>
      ${this.candidate === undefined
        ? ''
        : html`<p class="csv-candidate" data-candidate=${this.candidate.uci}>
            ¿Jugar <strong>${this.candidate.san}</strong>?
            <button type="button" data-action="confirm" @click=${this.confirm}>Sí, jugar</button>
            <button type="button" data-action="cancel" @click=${this.cancelByUser}>Cancelar</button>
          </p>`}
      ${this.message === '' ? '' : html`<p class="csv-message" role="status">${this.message}</p>`}
      <p class="csv-info">idioma: ${context?.lang ?? '—'} · reconocedor: ${context?.recognizer ?? '—'} · retardo al soltar: ${context === undefined ? '—' : `${releaseDelayOf(context)} ms`}</p>
    </div>`;
  }

  private renderTalkButton() {
    const listening = this.talk !== undefined;
    return html`<button
      type="button"
      class="csv-talk"
      data-action="talk"
      data-state=${listening ? 'listening' : this.processing ? 'processing' : 'idle'}
      ?disabled=${(!this.canType() && !listening) || this.processing}
      @pointerdown=${this.press}
      @pointerup=${this.release}
      @pointercancel=${this.abortAndShow}
      @keydown=${this.onTalkKey}
      @keyup=${this.onTalkKey}
    >
      ${listening ? 'Escuchando… suelta al terminar' : this.processing ? 'Reconociendo…' : 'Mantén pulsado para hablar'}
    </button>`;
  }

  private canType(): boolean {
    const position = this.position;
    return position !== undefined && !this.ended && position.gameId === this.context?.gameId && position.turn === position.yourColor;
  }

  private emitEvent<K extends CsEventName>(name: K, detail: CsEventDetail<K>): void {
    this.dispatchEvent(new CustomEvent(name, { ...CS_EVENT_INIT, detail }));
  }

  private setStatus(state: CsEventDetail<'cs:voice-status'>['state']): void {
    this.emitEvent('cs:voice-status', { v: 1, state });
  }

  private emitAttempt(attempt: VoiceAttemptPayload): void {
    this.emitEvent('cs:voice-attempt', { v: 1, attempt });
  }

  private readonly onTalkKey = (event: KeyboardEvent): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.type === 'keydown') this.press(event);
    else this.release();
  };

  private readonly press = (event: Event): void => {
    event.preventDefault();
    const speech = this.speech;
    const position = this.position;
    if (speech === undefined || position === undefined || this.talk !== undefined || this.processing || !this.canType()) return;
    this.message = '';
    this.talk = { position, session: speech.listen() };
    window.addEventListener('blur', this.abortAndShow);
    this.setStatus('listening');
    this.requestUpdate();
  };

  private readonly release = (): void => {
    const talk = this.talk;
    if (talk === undefined) return;
    this.talk = undefined;
    window.removeEventListener('blur', this.abortAndShow);
    this.processing = true;
    this.setStatus('processing');
    this.requestUpdate();
    void talk.session.release().then((outcome) => {
      this.processing = false;
      if (this.isConnected) this.onRecognized(outcome, talk.position);
      this.requestUpdate();
    });
  };

  private abortTalk(): void {
    const talk = this.talk;
    if (talk === undefined) return;
    this.talk = undefined;
    window.removeEventListener('blur', this.abortAndShow);
    talk.session.abort();
  }

  private readonly abortAndShow = (): void => {
    if (this.talk === undefined) return;
    this.abortTalk();
    this.setStatus(this.candidate === undefined ? 'idle' : 'awaiting-confirmation');
    this.requestUpdate();
  };

  private onRecognized(outcome: RecognitionOutcome, spoken: Position): void {
    if (outcome.failure !== undefined && outcome.failure !== 'no-speech') {
      if (outcome.failure === 'aborted') {
        this.setStatus(this.candidate === undefined ? 'idle' : 'awaiting-confirmation');
        return;
      }
      this.message = FAILURE_MESSAGES[outcome.failure];
      this.emitEvent('cs:voice-status', { v: 1, state: 'error', message: this.message });
      return;
    }

    const transcript = (outcome.alternatives[0]?.transcript ?? '').trim();
    const started = performance.now();
    // only the first alternative: the spike measured that the N-best adds nothing (ADR 5)
    const resolution = transcript === '' ? SILENCE : resolve(spoken.fen, [{ transcript }]);
    const resolveMs = performance.now() - started;
    const ply = spoken.plyCount + 1;
    this.tries = this.tries.ply === ply ? { ply, count: this.tries.count + 1 } : { ply, count: 1 };
    const attempt = (accepted: boolean): VoiceAttemptPayload =>
      buildAttempt({
        gameId: spoken.gameId,
        ply,
        fen: spoken.fen,
        lang: this.context?.lang ?? 'es-CO',
        recognizer: this.speech?.name ?? 'fake',
        alternatives: outcome.alternatives,
        transcript,
        resolution,
        accepted,
        tryIndex: this.tries.count,
        recognitionMs: outcome.recognitionMs,
        resolveMs,
      });

    // the turn or the game changed while it was being recognized: it is measured, and nothing is proposed
    const current = this.position;
    if (this.ended || current === undefined || current.gameId !== spoken.gameId || current.plyCount !== spoken.plyCount) {
      this.emitAttempt(attempt(false));
      this.message = 'La posición cambió: vuelve a decir la jugada.';
      this.setStatus('idle');
      return;
    }

    if (resolution.kind === 'command') {
      const hadCandidate = this.candidate !== undefined;
      if (!hadCandidate) {
        this.message = 'No hay ninguna jugada que confirmar.';
        this.setStatus('idle');
      } else if (resolution.command === 'yes') {
        this.confirm();
      } else {
        this.cancelByUser();
      }
      this.emitAttempt(attempt(hadCandidate && resolution.command === 'yes'));
    } else if (resolution.kind === 'move') {
      this.dropCandidate('user');
      this.message = '';
      this.candidate = { ply, uci: resolution.uci, san: resolution.san, source: 'voice' };
      this.pendingAttempt = attempt(false);
      this.emitEvent('cs:move-candidate', { v: 1, gameId: spoken.gameId, ...this.candidate });
      this.setStatus('awaiting-confirmation');
    } else {
      // a misheard «sí» must not lose the move waiting for confirmation (RF7: it asks to repeat)
      this.emitAttempt(attempt(false));
      this.message = this.describeNoMove(resolution, transcript);
      this.setStatus(this.candidate === undefined ? 'idle' : 'awaiting-confirmation');
    }
  }

  private describeNoMove(resolution: Exclude<Resolution, { kind: 'move' | 'command' }>, transcript: string): string {
    if (resolution.kind === 'ambiguous') return `Puede ser: ${resolution.candidates.map((candidate) => candidate.san).join(', ')}. Sé más preciso.`;
    return transcript === '' ? 'No te oí. Mantén pulsado y repite la frase.' : 'No entendí esa jugada. Prueba con algo como «caballo efe tres».';
  }

  private readonly onSubmit = (event: Event): void => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const input = form.elements.namedItem('move') as HTMLInputElement;
    const text = input.value.trim();
    if (text === '' || this.position === undefined || !this.canType()) return;

    const result = resolve(this.position.fen, [{ transcript: text }]);
    if (result.kind === 'command') {
      if (this.candidate === undefined) {
        this.message = 'No hay ninguna jugada que confirmar.';
      } else if (result.command === 'yes') {
        this.confirm();
      } else {
        this.cancelByUser();
      }
    } else if (result.kind === 'move') {
      this.dropCandidate('user');
      this.candidate = { ply: this.position.plyCount + 1, uci: result.uci, san: result.san, source: 'text' };
      this.message = '';
      this.emitEvent('cs:move-candidate', { v: 1, gameId: this.position.gameId, ...this.candidate });
      this.setStatus('awaiting-confirmation');
    } else {
      this.dropCandidate('user');
      this.message = this.describeNoMove(result, text);
    }
    input.value = '';
    this.requestUpdate();
  };

  private readonly confirm = (): void => {
    const position = this.position;
    const candidate = this.candidate;
    if (position === undefined || candidate === undefined) return;
    this.candidate = undefined;
    this.message = '';
    this.emitEvent('cs:move-confirmed', { v: 1, gameId: position.gameId, ply: candidate.ply, uci: candidate.uci, source: candidate.source });
    this.flushAttempt(true);
    this.setStatus('idle');
    this.requestUpdate();
  };

  private readonly cancelByUser = (): void => {
    this.dropCandidate('user');
    this.message = '';
    this.setStatus('idle');
    this.requestUpdate();
  };

  private dropCandidate(reason: CsEventDetail<'cs:move-cancelled'>['reason']): void {
    const position = this.position;
    const candidate = this.candidate;
    if (position === undefined || candidate === undefined) return;
    this.candidate = undefined;
    this.emitEvent('cs:move-cancelled', { v: 1, gameId: position.gameId, ply: candidate.ply, reason });
    this.flushAttempt(false);
  }

  /** Sends what was said for the candidate, also when it was not played, so that `accepted: false` is not biased. */
  private flushAttempt(accepted: boolean): void {
    const pending = this.pendingAttempt;
    if (pending === undefined) return;
    this.pendingAttempt = undefined;
    this.emitAttempt({ ...pending, accepted });
  }

  private readonly onPosition = (event: Event): void => {
    const next = (event as CustomEvent<Position>).detail;
    if (next.gameId !== this.context?.gameId) return;
    // a candidate is only valid for the position it was resolved in
    if (this.candidate !== undefined && next.plyCount + 1 !== this.candidate.ply) {
      this.dropCandidate('position-changed');
      this.message = 'La posición cambió: vuelve a decir o escribir la jugada.';
    }
    this.position = next;
    this.requestUpdate();
  };

  private readonly onEnded = (event: Event): void => {
    if ((event as CustomEvent<CsEventDetail<'cs:game-ended'>>).detail.gameId !== this.context?.gameId) return;
    this.abortTalk();
    this.dropCandidate('game-ended');
    this.ended = true;
    this.requestUpdate();
  };
}

if (!customElements.get('mf-voice-input')) customElements.define('mf-voice-input', MfVoiceInput);

declare global {
  interface HTMLElementTagNameMap {
    'mf-voice-input': MfVoiceInput;
  }
}
