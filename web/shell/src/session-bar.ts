import type { CreateGameRequest } from '@chessspeak/shared';

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
  createGame(color: NonNullable<CreateGameRequest['color']>): void;
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
      start.append(
        button('Blancas', () => actions.createGame('white'), 'create-white'),
        ' ',
        button('Negras', () => actions.createGame('black'), 'create-black'),
        ' ',
        button('Al azar', () => actions.createGame('random'), 'create-random'),
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
