import { describe, it, expect, beforeEach } from 'vitest';
import Velin from '../../../src/velin-all';

/**
 * Regression: radios shared the checkbox role, so `vln-input="mode"` wrote
 * `checked = "new"` into every member of the group (the last one won) and
 * read `checked` back, putting `true`/`false` into the model instead of the
 * radio's value. The documented example (three radios bound to `size`)
 * could not work.
 */
describe('vln-input on radio groups', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  const group = () => `
    <input id="a" type="radio" name="k" value="new" vln-input="mode">
    <input id="b" type="radio" name="k" value="edit" vln-input="mode">
    <input id="c" type="radio" name="k" value="view" vln-input="mode">`;
  const radio = (id: string) => container.querySelector('#' + id) as HTMLInputElement;

  it('checks the member whose value equals the model, and only that one', () => {
    container.innerHTML = group();
    Velin.bind(container, { mode: 'new' });
    expect(radio('a').checked).toBe(true);
    expect(radio('b').checked).toBe(false);
    expect(radio('c').checked).toBe(false);
  });

  it('a model that matches no member leaves the group unchecked', () => {
    container.innerHTML = group();
    Velin.bind(container, { mode: null });
    expect([radio('a'), radio('b'), radio('c')].some((r) => r.checked)).toBe(false);
  });

  it('a reactive write moves the check', () => {
    container.innerHTML = group();
    const state = Velin.bind(container, { mode: 'new' }) as { mode: string };
    state.mode = 'view';
    expect(radio('a').checked).toBe(false);
    expect(radio('c').checked).toBe(true);
  });

  it('clicking a member writes its value to the model', () => {
    container.innerHTML = group();
    const state = Velin.bind(container, { mode: 'new' }) as { mode: string };
    radio('b').click();
    expect(state.mode).toBe('edit');
    expect(radio('b').checked).toBe(true);
    expect(radio('a').checked).toBe(false);
  });

  it('compares numbers by their string form', () => {
    container.innerHTML = `<input id="one" type="radio" name="n" value="1" vln-input="n"><input id="two" type="radio" name="n" value="2" vln-input="n">`;
    Velin.bind(container, { n: 2 });
    expect(radio('two').checked).toBe(true);
    expect(radio('one').checked).toBe(false);
  });

  it('checkboxes keep the boolean contract', () => {
    container.innerHTML = `<input id="cb" type="checkbox" vln-input="on">`;
    const state = Velin.bind(container, { on: true }) as { on: boolean };
    expect(radio('cb').checked).toBe(true);
    radio('cb').click();
    expect(state.on).toBe(false);
  });
});
