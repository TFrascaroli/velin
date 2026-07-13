import { describe, it, expect, beforeEach, vi } from 'vitest';
import Velin from '../../../src/velin-all';

describe('vln-watch', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('calls handler with new value when watched expression changes', () => {
    // Handler name must be lowercase — HTML parsers lowercase attribute names.
    container.innerHTML = `<div vln-watch:logchange="count"></div>`;

    const seen: number[] = [];
    const state = Velin.bind(container, {
      count: 0,
      logchange(n: number) { seen.push(n); },
    });

    expect(seen).toEqual([0]);

    state.count = 5;
    expect(seen).toEqual([0, 5]);

    state.count = 5;
    expect(seen).toEqual([0, 5]);

    state.count = 7;
    expect(seen).toEqual([0, 5, 7]);
  });

  it('resolves dotted handler paths in the subkey', () => {
    container.innerHTML = `<div vln-watch:handlers.onfilter="filter"></div>`;

    const seen: string[] = [];
    const state = Velin.bind(container, {
      filter: 'a',
      handlers: {
        onfilter(v: string) { seen.push(v); },
      },
    });

    expect(seen).toEqual(['a']);

    state.filter = 'b';
    expect(seen).toEqual(['a', 'b']);
  });

  it('passes composite expression values (arrays)', () => {
    container.innerHTML = `<div vln-watch:onchange="[a, b]"></div>`;

    const seen: [number, number][] = [];
    const state = Velin.bind(container, {
      a: 1,
      b: 2,
      onchange(tuple: [number, number]) { seen.push(tuple); },
    });

    expect(seen).toEqual([[1, 2]]);

    state.a = 10;
    expect(seen[seen.length - 1]).toEqual([10, 2]);

    state.b = 20;
    expect(seen[seen.length - 1]).toEqual([10, 20]);
  });

  it('warns when subkey resolves to non-function', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    container.innerHTML = `<div vln-watch:notafn="x"></div>`;

    Velin.bind(container, { x: 1, notafn: 42 });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('did not resolve to a function'),
    );
    warnSpy.mockRestore();
  });

  it('warns when subkey is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    container.innerHTML = `<div vln-watch="x"></div>`;

    Velin.bind(container, { x: 1 });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('requires a handler'),
    );
    warnSpy.mockRestore();
  });
});
