import Velin from '../../../src/velin-core';
import { describe, it, expect } from "vitest";

const { tokenize, parse, evalAst } = Velin.ø__internal.ast;

describe('Evaluator Security Tests', () => {
  it('should throw an error when attempting to access the global object', () => {
    const tokens = tokenize('window.alert("Hacked!")');
    const ast = parse(tokens);
    const context = {};

    // Expecting evalAst to throw any error for accessing global object
    expect(() => evalAst(ast, context)).toThrow();
  });

  it('should throw an error when attempting prototype pollution', () => {
    const tokens = tokenize('Object.prototype.hacked = true');
    const ast = parse(tokens);
    const context = {};

    // Expecting evalAst to throw any error for prototype pollution
    expect(() => evalAst(ast, context)).toThrow();
    expect((Object as any).prototype.hacked).toBeUndefined();
  });

  it('should throw an error when attempting to access DOM elements', () => {
    const tokens = tokenize('document.body.innerHTML = "<h1>Hacked!</h1>"');
    const ast = parse(tokens);
    const context = {};

    // Expecting evalAst to throw any error for accessing DOM elements
    expect(() => evalAst(ast, context)).toThrow();
  });

  it('should throw an error when encountering infinite loops', () => {
    const tokens = tokenize('while(true) {}');
    const ast = parse(tokens);
    const context = {};

    // Expecting evalAst to throw any error for infinite loops
    expect(() => evalAst(ast, context)).toThrow();
  });

  it('should throw an error when attempting unsafe function calls', () => {
    const tokens = tokenize('fetch("http://malicious-site.com")');
    const ast = parse(tokens);
    const context = {};

    // Expecting evalAst to throw any error for unsafe function calls
    expect(() => evalAst(ast, context)).toThrow();
  });

  it('should throw an error when attempting to access restricted properties', () => {
    const tokens = tokenize('this.constructor.constructor("alert(\"Hacked!\")")()');
    const ast = parse(tokens);
    const context = {};

    // Expecting evalAst to throw any error for accessing restricted properties
    expect(() => evalAst(ast, context)).toThrow();
  });

  it('should throw an error for chained expressions with malicious intent', () => {
    const tokens = tokenize('(x = 1, y = 2, z = window.alert("Hacked!"))');
    const ast = parse(tokens);
    const context = {};

    // Expecting evalAst to throw any error for chained expressions with malicious intent
    expect(() => evalAst(ast, context)).toThrow();
  });
});