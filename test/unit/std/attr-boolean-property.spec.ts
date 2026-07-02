import { describe, it, expect, beforeEach } from 'vitest';
import Velin from '../../../src/velin-all';

/**
 * Regression: `vln-attr:checked` on a checkbox used to call setAttribute("checked")
 * which sets defaultChecked, not the live .checked property. After user
 * interaction the attribute and property diverge, so reactive writes to
 * `state.foo = false` no longer visually uncheck the box.
 *
 * These tests pin: for boolean attrs that also exist as a form-control
 * property, vln-attr assigns the property in addition to setting/removing
 * the attribute.
 */
describe('vln-attr on boolean form properties', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('reactive writes to checked survive user interaction', () => {
    container.innerHTML = `<input type="checkbox" vln-attr:checked="on" />`;
    const state = Velin.bind(container, { on: false }) as { on: boolean };
    const box = container.querySelector('input')!;

    // Turn on reactively.
    state.on = true;
    expect(box.checked).toBe(true);

    // User manually unchecks — sets the .checked *property* only; the
    // checkbox's "dirty checkedness" flag is now set, so future changes to
    // the attribute no longer sync into the property.
    box.checked = false;

    // Reactive write flips state to false, then back to true. Under the
    // old code only the attribute moved; the property stayed at the user's
    // last value. Under the fix, the property is assigned too.
    state.on = false;
    state.on = true;
    expect(box.checked).toBe(true);
  });

  it('disabled property is assigned on <button>', () => {
    container.innerHTML = `<button vln-attr:disabled="lock">go</button>`;
    const state = Velin.bind(container, { lock: false }) as { lock: boolean };
    const btn = container.querySelector('button')!;
    expect(btn.disabled).toBe(false);
    state.lock = true;
    expect(btn.disabled).toBe(true);
  });

  it('does not throw for boolean attrs on elements without the matching property', () => {
    // <div> has no `disabled` property; the branch that assigns it should
    // be skipped safely via `subkey in node`.
    container.innerHTML = `<div vln-attr:disabled="lock">x</div>`;
    expect(() => Velin.bind(container, { lock: true })).not.toThrow();
    const div = container.querySelector('div')!;
    expect(div.getAttribute('disabled')).toBe('');
  });
});
