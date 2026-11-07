import { LitElement, html } from 'lit';
import { resolve } from '@chessspeak/voice-parser';
import { CS_EVENT_INIT, releaseDelayOf, type CsEventDetail, type CsEventName, type VoiceInputContext } from '@chessspeak/shared';
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
}

/**
 * Text box: text → parser → candidate → explicit confirmation (RF8). Voice will use the same flow.
 * It has no socket: it only talks through cs:* events, and <mf-game> sends the confirmed move.
 */
export class MfVoiceInput extends LitElement {
  static override properties = { context: { attribute: false } };
  declare context: VoiceInputContext | undefined;

  private position: Position | undefined;
  private candidate: Candidate | undefined;
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
    super.disconnectedCallback();
  }

  protected override render() {
    const context = this.context;
    return html`<div class="csv-root">
      <h2 class="csv-title">Tu jugada</h2>
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
      this.candidate = { ply: this.position.plyCount + 1, uci: result.uci, san: result.san };
      this.message = '';
      this.emitEvent('cs:move-candidate', { v: 1, gameId: this.position.gameId, ...this.candidate, source: 'text' });
      this.setStatus('awaiting-confirmation');
    } else {
      this.dropCandidate('user');
      this.message =
        result.kind === 'ambiguous'
          ? `Puede ser: ${result.candidates.map((candidate) => candidate.san).join(', ')}. Sé más preciso.`
          : 'No entendí esa jugada. Prueba con algo como «caballo efe tres».';
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
    this.emitEvent('cs:move-confirmed', { v: 1, gameId: position.gameId, ply: candidate.ply, uci: candidate.uci, source: 'text' });
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
  }

  private readonly onPosition = (event: Event): void => {
    const next = (event as CustomEvent<Position>).detail;
    if (next.gameId !== this.context?.gameId) return;
    // a candidate is only valid for the position it was resolved in
    if (this.candidate !== undefined && next.plyCount + 1 !== this.candidate.ply) {
      this.dropCandidate('position-changed');
      this.message = 'La posición cambió: vuelve a escribir la jugada.';
    }
    this.position = next;
    this.requestUpdate();
  };

  private readonly onEnded = (event: Event): void => {
    if ((event as CustomEvent<CsEventDetail<'cs:game-ended'>>).detail.gameId !== this.context?.gameId) return;
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
