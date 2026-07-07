import Velin from '../../../src/velin-core';
import { describe, it, expect } from "vitest";

const { compile, evaluateAst } = Velin;

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