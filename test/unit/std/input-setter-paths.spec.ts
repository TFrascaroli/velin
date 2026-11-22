import { describe, it, expect, beforeEach } from 'vitest';
import Velin from '../../../src/velin-all';

/**
 * getSetter used to split the path at the last dot, so `items[0]` became a
 * root key literally named "items[0]", and a loop variable over primitives
 * (`vln-input="item"` under `vln-loop:item="names"`) wrote a root key named
 * "names[0]" instead of names[0]. The setter now compiles the path and
 * follows scope variables to the expression they stand for.
 */
describe('vln-input writes where it reads', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  const type = (input: Element, value: string) => {
    (input as HTMLInputElement).value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('a loop over primitives', () => {
    container.innerHTML = `<ul><li vln-loop:item="names"><input vln-input="item"></li></ul>`;
    const s = Velin.bind(container, { names: ['a', 'b'] }) as any;
    type(container.querySelectorAll('input')[1], 'z');
    expect(s.names).toEqual(['a', 'z']);
    expect(Object.keys(s)).toEqual(['names']);
  });

  it('a bracket path', () => {
    container.innerHTML = `<input vln-input="items[0]">`;
    const s = Velin.bind(container, { items: ['x'] }) as any;
    type(container.querySelector('input')!, 'y');
    expect(s.items).toEqual(['y']);
    expect(Object.keys(s)).toEqual(['items']);
  });

  it('a dotted path through a loop variable', () => {
    container.innerHTML = `<div vln-loop:row="rows"><input vln-input="row.name"></div>`;
    const s = Velin.bind(container, { rows: [{ name: 'a' }, { name: 'b' }] }) as any;
    type(container.querySelectorAll('input')[0], 'A');
    expect(s.rows[0].name).toBe('A');
  });

  it('a loop variable read from inside a nested vln-if scope', () => {
    container.innerHTML = `<div vln-loop:item="names"><span vln-if="show"><input vln-input="item"></span></div>`;
    const s = Velin.bind(container, { show: true, names: ['a'] }) as any;
    type(container.querySelector('input')!, 'q');
    expect(s.names).toEqual(['q']);
  });

  it('a computed key', () => {
    container.innerHTML = `<input vln-input="cells[idx]">`;
    const s = Velin.bind(container, { idx: 1, cells: [0, 0, 0] }) as any;
    type(container.querySelector('input')!, '7');
    expect(s.cells).toEqual([0, '7', 0]);
  });

  it('a vln-use alias still writes to the aliased property', () => {
    container.innerHTML = `<div vln-use:u="user.name"><input vln-input="u"></div>`;
    const s = Velin.bind(container, { user: { name: 'a' } }) as any;
    type(container.querySelector('input')!, 'b');
    expect(s.user.name).toBe('b');
  });

  it('a keyed loop over objects', () => {
    container.innerHTML = `<div vln-loop:row="{ collection: rows, key: 'id' }"><input vln-input="row.name"></div>`;
    const s = Velin.bind(container, { rows: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] }) as any;
    type(container.querySelectorAll('input')[1], 'B');
    expect(s.rows[1].name).toBe('B');
  });

  it('an expression with no place to write throws VLN016 at bind', () => {
    container.innerHTML = `<input vln-input="a + b">`;
    const errors: string[] = [];
    const orig = console.error;
    console.error = (...x: any[]) => errors.push(x.map(String).join(' '));
    try { Velin.bind(container, { a: 1, b: 2 }); } finally { console.error = orig; }
    expect(errors.some((e) => e.includes('VLN016'))).toBe(true);
  });
});
