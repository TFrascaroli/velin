import { describe, it, expect } from 'vitest';
import Velin from '../../../src/velin-all';

// Two things the docs and the contract promised that the code did not do:
// spread inside array literals, and binding a DocumentFragment.

describe('array spread in expressions', () => {
  const ev = (expr: string, state: any) => Velin.evaluateAst(Velin.compile(expr), Velin.ø__internal.getWrapper(Velin.bind(document.createElement('div'), state))!);

  it('spreads arrays into array literals', () => {
    expect(ev('[...a, 9]', { a: [1, 2] })).toEqual([1, 2, 9]);
    expect(ev('[0, ...a, ...b]', { a: [1], b: [2, 3] })).toEqual([0, 1, 2, 3]);
  });

  it('spreads any iterable', () => {
    expect(ev("[...s]", { s: 'ab' })).toEqual(['a', 'b']);
  });

  it('is reactive like any other read', () => {
    const div = document.createElement('div');
    div.innerHTML = `<i vln-text="[...a, 9].length"></i>`;
    document.body.appendChild(div);
    const s = Velin.bind(div, { a: [1] }) as any;
    expect(div.querySelector('i')!.textContent).toBe('2');
    s.a.push(5);
    expect(div.querySelector('i')!.textContent).toBe('3');
  });
});

describe('Velin.bind on a DocumentFragment', () => {
  it('binds the fragment\'s elements', () => {
    const frag = document.createDocumentFragment();
    const span = document.createElement('span');
    span.setAttribute('vln-text', 'x');
    const other = document.createElement('b');
    other.setAttribute('vln-attr:title', 'x');
    frag.append(span, other);
    const s = Velin.bind(frag, { x: 'hi' }) as any;
    expect(span.textContent).toBe('hi');
    expect(other.getAttribute('title')).toBe('hi');
    s.x = 'bye';
    expect(span.textContent).toBe('bye');
    document.body.appendChild(frag);
    expect(span.textContent).toBe('bye');
  });
});

describe('spread in call arguments', () => {
  it('passes spread arguments through', () => {
    const div = document.createElement('div');
    div.innerHTML = `<i vln-text="sum(...nums, 10)"></i>`;
    document.body.appendChild(div);
    Velin.bind(div, { nums: [1, 2], sum: (...xs: number[]) => xs.reduce((a, b) => a + b, 0) });
    expect(div.querySelector('i')!.textContent).toBe('13');
  });
});
