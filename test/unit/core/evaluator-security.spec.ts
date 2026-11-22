import Velin from '../../../src/velin-core';
import setupVelinStd from '../../../src/velin-standard';
import { describe, it, expect } from "vitest";

const { compile, evaluateAst } = Velin;
setupVelinStd(Velin);

const state = Velin.bind(document.createElement("div"), {});
const context = Velin.ø__internal.getWrapper(state)!;

describe('Evaluator Security Tests', () => {
  it('should throw an error when attempting to access the global object', () => {
    const ast = compile('window.alert("Hacked!")');

    // Expecting evaluateAst to throw any error for accessing global object
    expect(() => evaluateAst(ast, context)).toThrow();
  });

  it('should throw an error when attempting prototype pollution', () => {
    const ast = compile('Object.prototype.hacked = true');

    // Expecting evaluateAst to throw any error for prototype pollution
    expect(() => evaluateAst(ast, context)).toThrow();
    expect((Object as any).prototype.hacked).toBeUndefined();
  });

  it('should throw an error when attempting to access DOM elements', () => {
    const ast = compile ('document.body.innerHTML = "<h1>Hacked!</h1>"');

    // Expecting evaluateAst to throw any error for accessing DOM elements
    expect(() => evaluateAst(ast, context)).toThrow();
  });

  it('should throw an error when encountering infinite loops', () => {
    const ast = compile('while(true) {}');

    // Expecting evaluateAst to throw any error for infinite loops
    expect(() => evaluateAst(ast, context)).toThrow();
  });

  it('should throw an error when attempting unsafe function calls', () => {
    const ast = compile('fetch("http://malicious-site.com")');

    // Expecting evaluateAst to throw any error for unsafe function calls
    expect(() => evaluateAst(ast, context)).toThrow();
  });

  it('should throw an error when attempting to access restricted properties', () => {
    const ast = compile('this.constructor.constructor("alert(\"Hacked!\")")()');

    // Expecting evaluateAst to throw any error for accessing restricted properties
    expect(() => evaluateAst(ast, context)).toThrow();
  });

  it('should throw an error for chained expressions with malicious intent', () => {
    const ast = compile('(x = 1, y = 2, z = window.alert("Hacked!"))');

    // Expecting evaluateAst to throw any error for chained expressions with malicious intent
    expect(() => evaluateAst(ast, context)).toThrow();
  });
});
// The earlier cases above throw for incidental reasons (`this` is undefined,
// `fetch`/`window` are not in scope). These pin the real property: no path
// from the state to Function, with or without CSP.
describe('VLN038: constructor, __proto__ and prototype are unreachable', () => {
  const run = (expr: string, state: any = {}) => {
    const div = document.createElement('div');
    div.innerHTML = `<i vln-text="${expr.replace(/"/g, '&quot;')}"></i>`;
    document.body.appendChild(div);
    const errors: string[] = [];
    const orig = console.error;
    console.error = (...a: any[]) => errors.push(a.map(String).join(' '));
    try { Velin.bind(div, state); } finally { console.error = orig; }
    return { text: div.querySelector('i')!.textContent, errors };
  };

  it('a bare constructor identifier on an empty state does not reach Function', () => {
    const r = run("constructor.constructor('return 6*7')()");
    expect(r.text).toBe('');
    expect(r.errors.some((e) => e.includes('VLN038'))).toBe(true);
  });

  it('member access to constructor is refused', () => {
    const r = run("user.constructor.constructor('return 1')()", { user: { name: 'a' } });
    expect(r.text).toBe('');
    expect(r.errors.some((e) => e.includes('VLN038'))).toBe(true);
  });

  it('computed keys are refused too', () => {
    const r = run("user['const' + 'ructor']", { user: {} });
    expect(r.errors.some((e) => e.includes('VLN038'))).toBe(true);
  });

  it('__proto__ as an object-literal key and as an assignment target is refused', () => {
    const ctx = Velin.ø__internal.getWrapper(Velin.bind(document.createElement('div'), { x: {}, a: {} }))!;
    expect(() => evaluateAst(compile('{ __proto__: x }'), ctx)).toThrow(/VLN038/);
    expect(() => evaluateAst(compile('__proto__ = x'), ctx)).toThrow(/VLN038/);
    expect(() => evaluateAst(compile('a.prototype'), ctx)).toThrow(/VLN038/);
  });

  it('ordinary names still work', () => {
    const r = run("user.name + list.length", { user: { name: 'ok' }, list: [1, 2] });
    expect(r.text).toBe('ok2');
    expect(r.errors).toEqual([]);
  });
});
