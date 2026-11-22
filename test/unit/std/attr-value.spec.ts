import { describe, it, expect, beforeEach } from 'vitest';
import Velin from '../../../src/velin-all';

/**
 * `vln-attr:value` used to call setAttribute only. The `value` attribute is
 * the control's *default* value: it does not move a <select> or a range
 * input after first render, does nothing on <progress>, and is ignored once
 * the user has typed. For nodes that expose `value` as a property, the
 * directive assigns the property too, the way the boolean list already does.
 */
describe('vln-attr:value on form controls', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('moves a <select> to the option matching state', () => {
    container.innerHTML = `<select vln-attr:value="pick"><option value="a">A</option><option value="b">B</option></select>`;
    const state = Velin.bind(container, { pick: 'a' }) as { pick: string };
    const sel = container.querySelector('select')!;
    expect(sel.value).toBe('a');
    state.pick = 'b';
    expect(sel.value).toBe('b');
  });

  it('follows state after the user has typed', () => {
    container.innerHTML = `<input vln-attr:value="name">`;
    const state = Velin.bind(container, { name: 'ann' }) as { name: string };
    const input = container.querySelector('input')!;
    input.value = 'typed by user'; // sets the dirty flag; the attribute no longer syncs
    state.name = 'bob';
    expect(input.value).toBe('bob');
    expect(input.getAttribute('value')).toBe('bob');
  });

  it('drives <progress>', () => {
    container.innerHTML = `<progress max="10" vln-attr:value="done"></progress>`;
    const state = Velin.bind(container, { done: 3 }) as { done: number };
    const bar = container.querySelector('progress')!;
    expect(bar.value).toBe(3);
    state.done = 7;
    expect(bar.value).toBe(7);
  });

  it('null removes the attribute and clears the property', () => {
    container.innerHTML = `<input vln-attr:value="name">`;
    const state = Velin.bind(container, { name: 'ann' }) as { name: string | null };
    const input = container.querySelector('input')!;
    state.name = null;
    expect(input.hasAttribute('value')).toBe(false);
    expect(input.value).toBe('');
  });

  it('is a plain attribute on elements without a value property', () => {
    container.innerHTML = `<div vln-attr:value="v"></div>`;
    Velin.bind(container, { v: 'x' });
    expect(container.querySelector('div')!.getAttribute('value')).toBe('x');
  });
});
