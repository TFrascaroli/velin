import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Load and evaluate the source file to get the internal functions
const velinCoreSrc = fs.readFileSync(
  path.join(process.cwd(), 'src', 'velin-core.js'),
  'utf-8'
);

// Extract the tokenize function
const tokenizeMatch = velinCoreSrc.match(/function tokenize\(expr\) \{[\s\S]+?\n\}/);
const tokenizeFn = tokenizeMatch ? tokenizeMatch[0] : null;

// Extract the parse function
const parseMatch = velinCoreSrc.match(/function parse\(tokens\) \{[\s\S]+?^\}/m);
const parseFn = parseMatch ? parseMatch[0] : null;

// Extract evalAst function
const evalAstMatch = velinCoreSrc.match(/function evalAst\(ast, context, reactiveState = null\) \{[\s\S]+?^}/m);
const evalAstFn = evalAstMatch ? evalAstMatch[0] : null;

// Create an environment to execute the functions
function createParser() {
  // Execute the function definitions in a safe scope
  const code = `
    ${tokenizeFn}
    ${parseFn}
    ${evalAstFn}

    return { tokenize, parse, evalAst };
  `;

  const fn = new Function(code);
  return fn();
}

describe('Parser Unit Tests', () => {
  let tokenize, parse, evalAst;

  beforeEach(() => {
    const parser = createParser();
    tokenize = parser.tokenize;
    parse = parser.parse;
    evalAst = parser.evalAst;
  });

  describe('Tokenizer', () => {
    it('should tokenize assignment operator', () => {
      const tokens = tokenize('x = 5');
      expect(tokens).toEqual([
        { type: 'IDENTIFIER', value: 'x' },
        { type: 'ASSIGNMENT', value: '=' },
        { type: 'NUMBER', value: 5 }
      ]);
    });

    it('should tokenize comma (punctuation)', () => {
      const tokens = tokenize('a, b, c');
      expect(tokens).toEqual([
        { type: 'IDENTIFIER', value: 'a' },
        { type: 'PUNCTUATION', value: ',' },
        { type: 'IDENTIFIER', value: 'b' },
        { type: 'PUNCTUATION', value: ',' },
        { type: 'IDENTIFIER', value: 'c' }
      ]);
    });

    it('should not confuse = with ==', () => {
      const tokens = tokenize('a = b == c');
      expect(tokens.map(t => t.value)).toEqual(['a', '=', 'b', '==', 'c']);
    });

    it('should not confuse = with ===', () => {
      const tokens = tokenize('a = b === c');
      expect(tokens.map(t => t.value)).toEqual(['a', '=', 'b', '===', 'c']);
    });
  });

  describe('Parser - Assignment', () => {
    it('should parse simple assignment', () => {
      const tokens = tokenize('x = 5');
      const ast = parse(tokens);

      expect(ast.type).toBe('Assignment');
      expect(ast.left).toEqual({ type: 'Identifier', name: 'x' });
      expect(ast.right).toEqual({ type: 'Literal', value: 5 });
    });

    it('should parse member assignment', () => {
      const tokens = tokenize('obj.prop = 10');
      const ast = parse(tokens);

      expect(ast.type).toBe('Assignment');
      expect(ast.left.type).toBe('Member');
      expect(ast.left.object).toEqual({ type: 'Identifier', name: 'obj' });
      expect(ast.left.property).toBe('prop');
      expect(ast.left.computed).toBe(false);
      expect(ast.right).toEqual({ type: 'Literal', value: 10 });
    });

    it('should parse computed member assignment', () => {
      const tokens = tokenize('obj[key] = value');
      const ast = parse(tokens);

      expect(ast.type).toBe('Assignment');
      expect(ast.left.type).toBe('Member');
      expect(ast.left.computed).toBe(true);
      expect(ast.left.property).toEqual({ type: 'Identifier', name: 'key' });
    });

    it('should be right-associative', () => {
      const tokens = tokenize('a = b = c');
      const ast = parse(tokens);

      expect(ast.type).toBe('Assignment');
      expect(ast.left).toEqual({ type: 'Identifier', name: 'a' });
      expect(ast.right.type).toBe('Assignment');
      expect(ast.right.left).toEqual({ type: 'Identifier', name: 'b' });
      expect(ast.right.right).toEqual({ type: 'Identifier', name: 'c' });
    });
  });

  describe('Parser - Sequence', () => {
    it('should parse sequence expression', () => {
      const tokens = tokenize('(a, b, c)');
      const ast = parse(tokens);

      expect(ast.type).toBe('Sequence');
      expect(ast.expressions).toHaveLength(3);
      expect(ast.expressions[0]).toEqual({ type: 'Identifier', name: 'a' });
      expect(ast.expressions[1]).toEqual({ type: 'Identifier', name: 'b' });
      expect(ast.expressions[2]).toEqual({ type: 'Identifier', name: 'c' });
    });

    it('should parse single expression without sequence', () => {
      const tokens = tokenize('(a)');
      const ast = parse(tokens);

      // Single expression should not create a Sequence node
      expect(ast.type).toBe('Identifier');
      expect(ast.name).toBe('a');
    });

    it('should not treat function args as sequence', () => {
      const tokens = tokenize('foo(a, b, c)');
      const ast = parse(tokens);

      expect(ast.type).toBe('Call');
      expect(ast.arguments).toHaveLength(3);
      expect(ast.arguments[0]).toEqual({ type: 'Identifier', name: 'a' });
      expect(ast.arguments[1]).toEqual({ type: 'Identifier', name: 'b' });
      expect(ast.arguments[2]).toEqual({ type: 'Identifier', name: 'c' });
    });

    it('should parse sequence with assignments', () => {
      const tokens = tokenize('(x = 1, y = 2)');
      const ast = parse(tokens);

      expect(ast.type).toBe('Sequence');
      expect(ast.expressions).toHaveLength(2);
      expect(ast.expressions[0].type).toBe('Assignment');
      expect(ast.expressions[1].type).toBe('Assignment');
    });
  });

  describe('Parser - Ternary (regression)', () => {
    it('should still parse ternary correctly', () => {
      const tokens = tokenize('a ? b : c');
      const ast = parse(tokens);

      expect(ast.type).toBe('Ternary');
      expect(ast.test).toEqual({ type: 'Identifier', name: 'a' });
      expect(ast.consequent).toEqual({ type: 'Identifier', name: 'b' });
      expect(ast.alternate).toEqual({ type: 'Identifier', name: 'c' });
    });

    it('should parse nested ternaries', () => {
      const tokens = tokenize('a ? b : c ? d : e');
      const ast = parse(tokens);

      expect(ast.type).toBe('Ternary');
      expect(ast.alternate.type).toBe('Ternary');
    });
  });

  describe('Parser - Binary operators (regression)', () => {
    it('should parse arithmetic with correct precedence', () => {
      const tokens = tokenize('a + b * c');
      const ast = parse(tokens);

      expect(ast.type).toBe('Binary');
      expect(ast.operator).toBe('+');
      expect(ast.right.type).toBe('Binary');
      expect(ast.right.operator).toBe('*');
    });

    it('should parse logical operators', () => {
      const tokens = tokenize('a && b || c');
      const ast = parse(tokens);

      expect(ast.type).toBe('Binary');
      expect(ast.operator).toBe('||');
      expect(ast.left.type).toBe('Binary');
      expect(ast.left.operator).toBe('&&');
    });

    it('should parse comparison operators', () => {
      const tokens = tokenize('a > b && c < d');
      const ast = parse(tokens);

      expect(ast.type).toBe('Binary');
      expect(ast.operator).toBe('&&');
      expect(ast.left.operator).toBe('>');
      expect(ast.right.operator).toBe('<');
    });
  });

  describe('Parser - Object literals (regression)', () => {
    it('should parse object literals', () => {
      const tokens = tokenize('{ a: 1, b: 2 }');
      const ast = parse(tokens);

      expect(ast.type).toBe('ObjectLiteral');
      expect(ast.properties).toHaveLength(2);
      expect(ast.properties[0].key).toBe('a');
      expect(ast.properties[0].value).toEqual({ type: 'Literal', value: 1 });
      expect(ast.properties[1].key).toBe('b');
      expect(ast.properties[1].value).toEqual({ type: 'Literal', value: 2 });
    });

    it('should parse shorthand properties', () => {
      const tokens = tokenize('{ a, b }');
      const ast = parse(tokens);

      expect(ast.type).toBe('ObjectLiteral');
      expect(ast.properties[0].value).toEqual({ type: 'Identifier', name: 'a' });
    });
  });

  describe('Evaluator - Assignment', () => {
    it('should evaluate simple assignment', () => {
      const tokens = tokenize('x = 5');
      const ast = parse(tokens);
      const context = { x: 0 };

      const result = evalAst(ast, context);

      expect(result).toBe(5);
      expect(context.x).toBe(5);
    });

    it('should evaluate member assignment', () => {
      const tokens = tokenize('obj.prop = 10');
      const ast = parse(tokens);
      const context = { obj: { prop: 0 } };

      const result = evalAst(ast, context);

      expect(result).toBe(10);
      expect(context.obj.prop).toBe(10);
    });

    it('should evaluate computed member assignment', () => {
      const tokens = tokenize('obj[key] = 42');
      const ast = parse(tokens);
      const context = { obj: {}, key: 'foo' };

      const result = evalAst(ast, context);

      expect(result).toBe(42);
      expect(context.obj.foo).toBe(42);
    });

    it('should handle chained assignment', () => {
      const tokens = tokenize('a = b = c = 100');
      const ast = parse(tokens);
      const context = { a: 0, b: 0, c: 0 };

      evalAst(ast, context);

      expect(context.a).toBe(100);
      expect(context.b).toBe(100);
      expect(context.c).toBe(100);
    });
  });

  describe('Evaluator - Sequence', () => {
    it('should evaluate all expressions in order', () => {
      const tokens = tokenize('(x = 1, y = 2, z = 3)');
      const ast = parse(tokens);
      const context = { x: 0, y: 0, z: 0 };

      const result = evalAst(ast, context);

      expect(context.x).toBe(1);
      expect(context.y).toBe(2);
      expect(context.z).toBe(3);
      expect(result).toBe(3); // Returns last value
    });

    it('should return last expression value', () => {
      const tokens = tokenize('(10, 20, 30)');
      const ast = parse(tokens);
      const context = {};

      const result = evalAst(ast, context);

      expect(result).toBe(30);
    });

    it('should work with function calls', () => {
      const tokens = tokenize('(inc(), inc(), inc())');
      const ast = parse(tokens);
      let count = 0;
      const context = { inc: () => ++count };

      evalAst(ast, context);

      expect(count).toBe(3);
    });
  });

  describe('Evaluator - Combined', () => {
    it('should handle sequence with assignments and operations', () => {
      const tokens = tokenize('(x = 10, y = x * 2, z = x + y)');
      const ast = parse(tokens);
      const context = { x: 0, y: 0, z: 0 };

      evalAst(ast, context);

      expect(context.x).toBe(10);
      expect(context.y).toBe(20);
      expect(context.z).toBe(30);
    });

    it('should handle assignment with ternary', () => {
      const tokens = tokenize('result = flag ? 100 : 200');
      const ast = parse(tokens);
      const context = { flag: true, result: 0 };

      evalAst(ast, context);
      expect(context.result).toBe(100);

      context.flag = false;
      evalAst(ast, context);
      expect(context.result).toBe(200);
    });
  });

  describe('Evaluator - Regression tests', () => {
    it('should still handle ternary correctly', () => {
      const tokens = tokenize('x > 5 ? 10 : 20');
      const ast = parse(tokens);

      const context1 = { x: 7 };
      expect(evalAst(ast, context1)).toBe(10);

      const context2 = { x: 3 };
      expect(evalAst(ast, context2)).toBe(20);
    });

    it('should still handle binary operators', () => {
      const tokens = tokenize('a + b * c');
      const ast = parse(tokens);
      const context = { a: 5, b: 3, c: 4 };

      expect(evalAst(ast, context)).toBe(17);
    });

    it('should still handle object literals', () => {
      const tokens = tokenize('{ x: 1, y: 2 }');
      const ast = parse(tokens);
      const context = {};

      const result = evalAst(ast, context);

      expect(result).toEqual({ x: 1, y: 2 });
    });

    it('should still handle member access', () => {
      const tokens = tokenize('obj.prop');
      const ast = parse(tokens);
      const context = { obj: { prop: 'value' } };

      expect(evalAst(ast, context)).toBe('value');
    });

    it('should still handle array indexing', () => {
      const tokens = tokenize('arr[1]');
      const ast = parse(tokens);
      const context = { arr: [10, 20, 30] };

      expect(evalAst(ast, context)).toBe(20);
    });

    it('should still handle function calls', () => {
      const tokens = tokenize('add(5, 3)');
      const ast = parse(tokens);
      const context = { add: (a, b) => a + b };

      expect(evalAst(ast, context)).toBe(8);
    });
  });
});
