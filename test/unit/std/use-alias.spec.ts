import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('vln-use alias plugin', () => {
  let dom;
  let window;
  let document;
  let Velin;

  beforeEach(() => {
    const velinCode = fs.readFileSync(
      path.join(process.cwd(), 'playground', 'velin.js'),
      'utf-8'
    );

    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      runScripts: 'dangerously',
    });
    window = dom.window;
    document = window.document;

    const scriptEl = document.createElement('script');
    scriptEl.textContent = velinCode;
    document.head.appendChild(scriptEl);

    Velin = window.Velin;
  });

  it('creates a scoped alias for nested state (reads work)', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div vln-use:user="generalState.identity.local.currentUser">
        <h1 vln-text="user.name"></h1>
        <p vln-text="user.email"></p>
      </div>
    `;
    document.body.appendChild(container);

    const state = Velin.bind(container, {
      generalState: {
        identity: {
          local: {
            currentUser: { name: 'Alice', email: 'alice@example.com' }
          }
        }
      }
    });

    const h1 = container.querySelector('h1');
    const p = container.querySelector('p');

    expect(h1.textContent).toBe('Alice');
    expect(p.textContent).toBe('alice@example.com');
  });

  it('updates DOM when original state changes through alias target', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div vln-use:user="generalState.identity.local.currentUser">
        <h1 vln-text="user.name"></h1>
      </div>
    `;
    document.body.appendChild(container);

    const state = Velin.bind(container, {
      generalState: {
        identity: {
          local: {
            currentUser: { name: 'Alice' }
          }
        }
      }
    });

    const h1 = container.querySelector('h1');
    expect(h1.textContent).toBe('Alice');

    // Mutate the original object referenced by the alias
    state.generalState.identity.local.currentUser.name = 'Bob';

    expect(h1.textContent).toBe('Bob');
  });
});
