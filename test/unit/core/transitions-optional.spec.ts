import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Velin from '../../../src/velin-all';

/**
 * Verifies plugin bundles behave correctly when the optional
 * velin-transitions module isn't loaded. We simulate the "not loaded"
 * state by temporarily clearing `Velin.transitions` — this matches
 * what a user gets when they pull `velin-standard`, `velin-router`,
 * or `velin-templates-and-fragments` without also loading
 * `velin-transitions`.
 */
describe('directives without Velin.transitions loaded', () => {
  let container: HTMLDivElement;
  let saved: typeof Velin.transitions;

  beforeEach(() => {
    saved = Velin.transitions;
    // @ts-expect-error deliberately clearing the optional field
    Velin.transitions = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    Velin.transitions = saved;
    container.remove();
  });

  it('vln-if removes synchronously even with a CSS transition set', () => {
    container.innerHTML = `<span vln-if="show" style="transition-duration: 200ms">x</span>`;
    const state = Velin.bind(container, { show: true });
    const span = container.querySelector('span')!;

    state.show = false;

    expect(span.isConnected).toBe(false);
    expect(container.querySelector('span')).toBeNull();
  });

  it('vln-loop removes items synchronously even with a CSS transition', () => {
    container.innerHTML = `<li vln-loop:item="items" vln-text="item" style="transition-duration: 200ms"></li>`;
    const state = Velin.bind(container, { items: ['a', 'b', 'c'] });
    expect(container.querySelectorAll('li').length).toBe(3);

    state.items = ['a'];

    expect(container.querySelectorAll('li').length).toBe(1);
  });

  it('vln-fragment template swap wipes previous DOM synchronously', () => {
    container.innerHTML = `
      <template vln-template="'a'">
        <p class="tpl-a" style="transition-duration: 200ms">A</p>
      </template>
      <template vln-template="'b'">
        <p class="tpl-b" style="transition-duration: 200ms">B</p>
      </template>
      <div id="host" vln-fragment="which"></div>
    `;
    const state = Velin.bind(container, { which: 'a' });
    const host = container.querySelector('#host')!;
    expect(host.querySelector('.tpl-a')).not.toBeNull();

    state.which = 'b';

    expect(host.querySelector('.tpl-a')).toBeNull();
    expect(host.querySelector('.tpl-b')).not.toBeNull();
  });

  it('does not add vln-entering or vln-leaving classes', () => {
    container.innerHTML = `<span vln-if="show" style="transition-duration: 200ms">x</span>`;
    const state = Velin.bind(container, { show: true });
    const span = container.querySelector('span')!;

    expect(span.classList.contains('vln-entering')).toBe(false);

    state.show = false;
    // Node is already gone; check that nothing lingering carries the class.
    expect(container.querySelector('.vln-leaving')).toBeNull();
    expect(container.querySelector('.vln-entering')).toBeNull();
  });
});
