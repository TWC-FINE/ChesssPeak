import { LitElement, html, type PropertyValues } from 'lit';
import { resolve, type Resolution } from '@chessspeak/voice-parser';
import { CS_EVENT_INIT, releaseDelayOf, type CsEventDetail, type CsEventName, type VoiceAttemptPayload, type VoiceInputContext } from '@chessspeak/shared';
import { buildAttempt } from './attempt.js';
import { createRecognizer, type RecognizerChoice } from './recognizers/create.js';
import type { Listening, RecognitionOutcome, SpeechRecognizer } from './recognizers/recognizer.js';
import { agentAnswers } from './recognizers/whisper.js';
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

/** ADR 5: measured in the spike, on an i5-12400F, without recording or transport. */
const WHISPER_LATENCY = 'Whisper local es más lento: p50 de 2,91 s y p95 de 3,06 s solo de inferencia, en un i5-12400F; en tu equipo será distinto. El audio no sale de tu equipo.';

function failureMessage(outcome: RecognitionOutcome): string {
  switch (outcome.failure) {
    case 'not-allowed':
      return 'El navegador no deja usar el micrófono. Permítelo o usa la caja de texto.';
    case 'network':
      return 'No hay conexión con el reconocedor. Usa la caja de texto.';
    case 'unavailable':
      return 'El reconocedor no está disponible. Usa la caja de texto.';
    case 'busy':
      return `El agente local está ocupado. Inténtalo de nuevo${outcome.retryAfterSeconds === undefined ? ' en unos segundos' : ` en ${outcome.retryAfterSeconds} s`} o usa la caja de texto.`;
    case 'agent-unreachable':
      return 'No se pudo contactar con el agente local. Comprueba que está en marcha y que permite este origen; desde una web pública, el navegador también puede bloquearlo. Usa otro reconocedor o la caja de texto.';
    default:
      return 'No se pudo reconocer. Inténtalo de nuevo o usa la caja de texto.';
  }
}

const GATE_MESSAGES = {
  'too-short': 'La frase fue muy corta. Mantén pulsado mientras hablas.',
  'too-quiet': 'Se oyó muy bajo. Habla más cerca del micrófono.',
} as const;

/**
 * Voice and text box: phrase → parser → candidate → explicit confirmation (RF8). Nothing is ever played without it.
 * It has no socket: it only talks through cs:* events, <mf-game> sends the confirmed move and the shell forwards the telemetry.
 */
export class MfVoiceInput extends LitElement {
  static override properties = { context: { attribute: false }, speech: { attribute: false } };
  declare context: VoiceInputContext | undefined;
  /** Overrides the recognizer of the context, for tests. */
  declare speech: SpeechRecognizer | undefined;

  private fromContext: { key: string; recognizer: SpeechRecognizer | undefined } = { key: '', recognizer: undefined };
  private choice: RecognizerChoice | undefined;
  private selectorOpen = false;
  private agentState: 'checking' | 'up' | 'down' = 'checking';
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
    this.fromContext.recognizer?.dispose?.();
    super.disconnectedCallback();
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (!changed.has('context')) return;
    this.chooseRecognizer();
    // a route change: what was being said or proposed belongs to the previous game, and the next one has not ended
    if (this.position !== undefined && this.position.gameId !== this.context?.gameId) {
      this.abortTalk();
      this.dropCandidate('position-changed');
      this.position = undefined;
      this.ended = false;
      this.message = '';
    }
  }

  /** The shell sends a new context on every change, and a recognizer is only replaced when it would be different. */
  private chooseRecognizer(): void {
    const context = this.context;
    const key = `${context?.recognizer}|${context?.lang}|${releaseDelayOf(context)}|${context?.agentUrl}|${this.choice}`;
    if (key === this.fromContext.key) return;
    this.fromContext.recognizer?.dispose?.();
    this.fromContext = { key, recognizer: createRecognizer(context, this.choice) };
    if (this.noVoiceInBrowser()) this.setStatus('unavailable');
  }

  private get recognizer(): SpeechRecognizer | undefined {
    return this.speech ?? this.fromContext.recognizer;
  }

  /** RF13: the context asks for a recognizer that this browser does not have. */
  private noVoiceInBrowser(): boolean {
    const recognizer = this.recognizer;
    return recognizer !== undefined && !recognizer.isAvailable();
  }

  protected override render() {
    const context = this.context;
    return html`<div class="csv-root">
      <h2 class="csv-title">Tu jugada</h2>
      ${this.renderSelector()}
      ${this.recognizer?.isAvailable() === true ? this.renderTalkButton() : ''}
      ${this.noVoiceInBrowser() ? html`<p class="csv-notice" data-voice-unavailable>Este navegador no tiene reconocimiento de voz. Usa la caja de texto, o abre la página en Edge.</p>` : ''}
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
      <p class="csv-info">idioma: ${context?.lang ?? '—'} · reconocedor: ${this.recognizer?.name ?? context?.recognizer ?? '—'} · retardo al soltar: ${context === undefined ? '—' : `${releaseDelayOf(context)} ms`}</p>
    </div>`;
  }

  /** Only when the shell knows an agent. The agent is asked only here, on opening: from a public page that can trigger a browser prompt. */
  private renderSelector() {
    const agentUrl = this.context?.agentUrl;
    if (agentUrl == null || this.context?.recognizer === 'text' || this.speech !== undefined) return '';
    const active = this.fromContext.recognizer?.name;
    const busy = this.talk !== undefined || this.processing;
    return html`<div class="csv-selector">
      <button type="button" data-action="choose-recognizer" aria-expanded=${this.selectorOpen} ?disabled=${busy} @click=${this.toggleSelector}>
        Reconocedor: ${active === 'whisper' ? 'Whisper local' : 'Web Speech'}
      </button>
      ${this.selectorOpen
        ? html`<fieldset class="csv-options">
            <legend>Elige el reconocedor</legend>
            <label><input type="radio" name="recognizer" value="webspeech" .checked=${active !== 'whisper'} ?disabled=${busy} @change=${this.onChoose} /> Web Speech (por defecto)</label>
            <label>
              <input type="radio" name="recognizer" value="whisper" .checked=${active === 'whisper'} ?disabled=${busy || this.agentState !== 'up'} @change=${this.onChoose} />
              Whisper local
              <span data-agent-state=${this.agentState}>${this.agentState === 'checking' ? '(comprobando…)' : this.agentState === 'up' ? '(disponible)' : '(no responde)'}</span>
            </label>
            ${this.agentState === 'down' ? html`<p class="csv-notice" data-agent-down>No responde el agente local en ${agentUrl}. Arráncalo, o el navegador puede estar bloqueándolo desde una web pública.</p>` : ''}
            <p class="csv-info" data-whisper-latency>${WHISPER_LATENCY}</p>
          </fieldset>`
        : ''}
    </div>`;
  }

  private readonly toggleSelector = (): void => {
    this.selectorOpen = !this.selectorOpen;
    this.requestUpdate();
    const agentUrl = this.context?.agentUrl;
    if (!this.selectorOpen || agentUrl == null) return;
    this.agentState = 'checking';
    void agentAnswers(agentUrl).then((up) => {
      this.agentState = up ? 'up' : 'down';
      this.requestUpdate();
    });
  };

  private readonly onChoose = (event: Event): void => {
    this.choice = (event.target as HTMLInputElement).value as RecognizerChoice;
    this.message = '';
    this.chooseRecognizer();
    this.requestUpdate();
  };

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
    const speech = this.recognizer;
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
      this.message = failureMessage(outcome);
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
        recognizer: this.recognizer?.name ?? 'fake',
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
      this.message = outcome.gate === undefined ? this.describeNoMove(resolution, transcript) : GATE_MESSAGES[outcome.gate];
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
