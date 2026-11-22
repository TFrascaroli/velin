import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Velin from '../../../src/velin-all';

/**
 * Diagnostics from the Lyghts field notes: VLN017 printed `AST:Call Not a
 * function` for a template calling a global, naming neither the expression
 * nor the callee, and VLN023 could not tell the raw state object from any
 * other wrong argument.
 */
describe('error messages name the thing that failed', () => {
  let container: HTMLDivElement;
  let error: ReturnType<typeof vi.spyOn>;
  const logged = () => error.mock.calls.map((c) => c.map(String).join(' '));

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => error.mockRestore());

  it('VLN017 from a tracker names the expression and the callee', () => {
    container.innerHTML = `<i vln-text="label(Number(x) || 1)"></i>`;
    Velin.bind(container, { x: '3', label: (n: number) => 'n' + n });
    const msgs = logged().filter((m) => m.includes('[VLN017]'));
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]).toContain(`label(Number(x) || 1)`);
    expect(msgs[0]).toContain('Number is not a function');
    expect(msgs[0]).not.toContain('AST:');
  });

  it('a missing method on a member is named too', () => {
    container.innerHTML = `<i vln-text="user.greet()"></i>`;
    Velin.bind(container, { user: { name: 'x' } });
    expect(logged().some((m) => m.includes('greet is not a function'))).toBe(true);
  });

  it('VLN023 recognises the raw object given to bind()', () => {
    const raw = { n: 1 };
    container.innerHTML = `<i vln-text="n"></i>`;
    Velin.bind(container, raw);
    expect(() => Velin.getController(raw)).toThrow(/object you passed to Velin\.bind\(\)/);
    expect(() => Velin.getController({ n: 1 })).toThrow(/not a Velin state/);
  });
});
