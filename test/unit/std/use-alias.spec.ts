import { describe, it, expect, beforeEach } from 'vitest';
import Velin from '../../../src/velin-all';

describe('vln-use alias plugin', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('creates a scoped alias for nested state (reads work)', () => {
    container.innerHTML = `
      <div vln-use:user="generalState.identity.local.currentUser">
        <h1 vln-text="user.name"></h1>
        <p vln-text="user.email"></p>
      </div>
    `;

    Velin.bind(container, {
      generalState: {
        identity: {
          local: {
            currentUser: { name: 'Alice', email: 'alice@example.com' },
          },
        },
      },
    });

    expect(container.querySelector('h1')!.textContent).toBe('Alice');
    expect(container.querySelector('p')!.textContent).toBe('alice@example.com');
  });

  it('updates DOM when original state changes through alias target', () => {
    container.innerHTML = `
      <div vln-use:user="generalState.identity.local.currentUser">
        <h1 vln-text="user.name"></h1>
      </div>
    `;

    const state = Velin.bind(container, {
      generalState: {
        identity: {
          local: {
            currentUser: { name: 'Alice' },
          },
        },
      },
    });

    const h1 = container.querySelector('h1')!;
    expect(h1.textContent).toBe('Alice');

    state.generalState.identity.local.currentUser.name = 'Bob';

    expect(h1.textContent).toBe('Bob');
  });
});
