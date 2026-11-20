import { CLOCK_INCREMENTS, CLOCK_MINUTES, type CreateGameRequest } from '@chessspeak/shared';

export interface SessionBarState {
  displayName: string | null;
  gameId: string | null;
  online: boolean;
  /** Link to send to the other player. */
  inviteUrl: string;
  message: string;
}

export interface SessionBarActions {
  signIn(displayName: string): void;
  /** `clockMinutes` is undefined for a game without a clock, and `incrementSeconds` for a clock without an increment. */
  createGame(
    color: NonNullable<CreateGameRequest['color']>,
    clockMinutes: CreateGameRequest['clockMinutes'],
    incrementSeconds?: CreateGameRequest['incrementSeconds'],
  ): void;
  signOut(): void;
}

function button(label: string, onClick: () => void, name: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.dataset.action = name;
  element.addEventListener('click', onClick);
  return element;
}

function option(value: string, text: string): HTMLOptionElement {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = text;
  return element;
}

/** "Sin reloj" or the minutes of the contract; the value is read when a color is chosen. */
function clockSelect(): HTMLSelectElement {
  const select = document.createElement('select');
  select.name = 'clock';
  select.dataset.clock = '';
  select.setAttribute('aria-label', 'Reloj');
  select.append(option('', 'Sin reloj'), ...CLOCK_MINUTES.map((minutes) => option(String(minutes), `${minutes} min`)));
  return select;
}

/** The seconds added per move; only used with a clock, so it is off without one. */
function incrementSelect(clock: HTMLSelectElement): HTMLSelectElement {
  const select = document.createElement('select');
  select.name = 'increment';
  select.dataset.increment = '';
  select.setAttribute('aria-label', 'Incremento por jugada');
  select.append(...CLOCK_INCREMENTS.map((seconds) => option(String(seconds), `+${seconds} s`)));
  const follow = () => (select.disabled = clock.value === '');
  clock.addEventListener('change', follow);
  follow();
  return select;
}

/** The seconds of an option of the increment select, or undefined for +0 s and anything the contract does not offer. */
export function incrementSecondsOf(value: string): CreateGameRequest['incrementSeconds'] {
  const seconds = Number(value);
  return CLOCK_INCREMENTS.find((offered) => offered !== 0 && offered === seconds);
}

/** The minutes of an option of the clock select, or undefined for "Sin reloj" and anything the contract does not offer. */
export function clockMinutesOf(value: string): CreateGameRequest['clockMinutes'] {
  const minutes = Number(value);
  return CLOCK_MINUTES.find((offered) => offered === minutes);
}

function signInForm(actions: SessionBarActions): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'cs-form';
  const label = document.createElement('label');
  label.textContent = 'Tu nombre ';
  const input = document.createElement('input');
  input.name = 'displayName';
  input.maxLength = 24;
  input.required = true;
  input.autocomplete = 'off';
  input.placeholder = 'Ingresa tu nombre…';
  label.append(input);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Entrar como invitado';
  form.append(label, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    actions.signIn(input.value);
  });
  return form;
}

/** The part of the page that belongs to the shell: who you are, and how to start or share a game. */
export function renderSessionBar(host: HTMLElement, state: SessionBarState, actions: SessionBarActions): void {
  const children: HTMLElement[] = [];
  if (state.displayName === null) {
    children.push(signInForm(actions));
  } else {
    const who = document.createElement('p');
    who.className = 'cs-who';
    who.textContent = `${state.displayName} · ${state.online ? 'conectado' : 'sin conexión'}`;
    who.append(' ', button('Salir', actions.signOut, 'sign-out'));
    children.push(who);
    if (state.gameId === null) {
      const start = document.createElement('p');
      start.className = 'cs-start';
      start.textContent = 'Crear partida con: ';
      const clock = clockSelect();
      const increment = incrementSelect(clock);
      const create = (color: NonNullable<CreateGameRequest['color']>) => () => {
        const minutes = clockMinutesOf(clock.value);
        actions.createGame(color, minutes, minutes === undefined ? undefined : incrementSecondsOf(increment.value));
      };
      start.append(
        clock,
        ' ',
        increment,
        ' ',
        button('Blancas', create('white'), 'create-white'),
        ' ',
        button('Negras', create('black'), 'create-black'),
        ' ',
        button('Al azar', create('random'), 'create-random'),
      );
      children.push(start);
    } else {
      const invite = document.createElement('p');
      invite.className = 'cs-invite';
      invite.textContent = 'Enlace para el otro jugador: ';
      const link = document.createElement('code');
      link.dataset.invite = '';
      link.textContent = state.inviteUrl;
      invite.append(link);
      children.push(invite);
    }
  }
  if (state.message !== '') {
    const message = document.createElement('p');
    message.className = 'cs-message';
    message.setAttribute('role', 'alert');
    message.textContent = state.message;
    children.push(message);
  }
  host.replaceChildren(...children);
}
