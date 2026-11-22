import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Velin from '../../../src/velin-all';

/**
 * VLN037 (development builds): a binding that re-runs without re-capturing
 * read a path it did not read when its dependencies were captured. That is
 * the getter-that-short-circuits-on-first-run bug from ADR 0003: the skipped
 * input is never tracked, and the binding goes stale silently. The warning
 * fires on the first re-run that reaches the skipped input, once per binding.
 */
describe('VLN037: read of an uncaptured dependency', () => {
  let container: HTMLDivElement;
  let warn: ReturnType<typeof vi.spyOn>;
  const warnings = () => warn.mock.calls.map((c) => String(c[0])).filter((m) => m.startsWith('[VLN037]'));

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('warns when a getter short-circuits past an input on its first run', () => {
    container.innerHTML = `<button vln-attr:disabled="can ? null : true"></button>`;
    const s = Velin.bind(container, {
      snap: { a: null as string | null, m: false },
      get can() { return this.snap.a !== null && this.snap.m; },
    }) as any;
    expect(warnings()).toEqual([]);
    s.snap.a = 'x'; // wakes the binding; the getter now reaches snap.m, which was never captured
    const w = warnings();
    expect(w.length).toBe(1);
    expect(w[0]).toContain(`vln-attr:disabled="can ? null : true"`);
    expect(w[0]).toContain(`'snap.m'`);
  });

  it('warns once per binding', () => {
    container.innerHTML = `<i vln-text="can ? 'y' : 'n'"></i>`;
    const s = Velin.bind(container, {
      snap: { a: null as string | null, m: false },
      get can() { return this.snap.a !== null && this.snap.m; },
    }) as any;
    s.snap.a = 'x';
    s.snap.a = 'y';
    s.snap.a = 'z';
    expect(warnings().length).toBe(1);
  });

  it('a getter that reads every input up front does not warn', () => {
    container.innerHTML = `<button vln-attr:disabled="can ? null : true"></button>`;
    const s = Velin.bind(container, {
      snap: { a: null as string | null, m: false },
      get can() { const a = this.snap.a; const m = this.snap.m; return a !== null && m; },
    }) as any;
    s.snap.a = 'x';
    s.snap.m = true;
    expect(warnings()).toEqual([]);
    expect(container.querySelector('button')!.hasAttribute('disabled')).toBe(false);
  });

  it('template && is eager, so it does not warn', () => {
    container.innerHTML = `<i vln-text="snap.a !== null && snap.m ? 'y' : 'n'"></i>`;
    const s = Velin.bind(container, { snap: { a: null as string | null, m: false } }) as any;
    s.snap.a = 'x';
    s.snap.m = true;
    expect(warnings()).toEqual([]);
    expect(container.querySelector('i')!.textContent).toBe('y');
  });

  it('a structural write re-captures instead of warning', () => {
    container.innerHTML = `<i vln-text="user ? user.name : '-'"></i>`;
    const s = Velin.bind(container, { user: null as any }) as any;
    s.user = { name: 'ann' };
    s.user.name = 'bob';
    expect(warnings()).toEqual([]);
    expect(container.querySelector('i')!.textContent).toBe('bob');
  });

  it('loop rows do not warn on ordinary item writes', () => {
    container.innerHTML = `<div vln-loop:it="items"><i vln-text="it.done ? it.name : '-'"></i></div>`;
    const s = Velin.bind(container, { items: [{ name: 'a', done: false }, { name: 'b', done: true }] }) as any;
    s.items[1].name = 'B';
    s.items[0].done = true; // primitive write; `it.name` was read eagerly by the ternary? no: it was skipped
    // The row's ternary skipped `it.name` on first run, so this IS the bug the
    // warning exists for: assert it fires exactly once and names the row.
    const w = warnings();
    expect(w.length).toBe(1);
    expect(w[0]).toContain(`items[0].name`);
  });
});
