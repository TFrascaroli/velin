import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const velinCoreSrc = fs.readFileSync(
  path.join(process.cwd(), 'src', 'velin-core.js'),
  'utf-8'
);

const tokenizeMatch = velinCoreSrc.match(/function tokenize\(expr\) \{[\s\S]+?\n\}/);
const tokenizeFn = tokenizeMatch ? tokenizeMatch[0] : null;

const parseMatch = velinCoreSrc.match(/function parse\(tokens\) \{[\s\S]+?^\}/m);
const parseFn = parseMatch ? parseMatch[0] : null;

const evalFunctionsMatch = velinCoreSrc.match(/function eval[A-Z][a-zA-Z]*\([\s\S]+?\n\}/g);
const evalFunctions = evalFunctionsMatch ? evalFunctionsMatch.join('\n\n') : '';

function createParser() {
  const code = `
    ${tokenizeFn}
    ${parseFn}
    ${evalFunctions}

    return { tokenize, parse, evalAst };
  `;

  const fn = new Function(code);
  return fn();
}

describe('Postfix chains after Call and computed Member', () => {
  let tokenize, parse, evalAst;

  beforeEach(() => {
    const parser = createParser();
    tokenize = parser.tokenize;
    parse = parser.parse;
    evalAst = parser.evalAst;
  });

  const run = (src: string, context: any) => {
    return evalAst(parse(tokenize(src)), context);
  };

  describe('Parser AST shape', () => {
    it('parses .foo after a call', () => {
      const ast = parse(tokenize('getUser(id).name'));
      expect(ast.type).toBe('Member');
      expect(ast.property).toBe('name');
      expect(ast.computed).toBe(false);
      expect(ast.object.type).toBe('Call');
    });

    it('parses [i] after a call', () => {
      const ast = parse(tokenize("path.split('/')[2]"));
      expect(ast.type).toBe('Member');
      expect(ast.computed).toBe(true);
      expect(ast.object.type).toBe('Call');
    });

    it('parses .foo after a computed member', () => {
      const ast = parse(tokenize('arr[0].foo'));
      expect(ast.type).toBe('Member');
      expect(ast.property).toBe('foo');
      expect(ast.object.type).toBe('Member');
      expect(ast.object.computed).toBe(true);
    });

    it('parses (args) after a computed member', () => {
      const ast = parse(tokenize('handlers[0](evt)'));
      expect(ast.type).toBe('Call');
      expect(ast.callee.type).toBe('Member');
      expect(ast.callee.computed).toBe(true);
    });

    it('parses a full mixed chain without throwing', () => {
      expect(() => parse(tokenize('a.b().c.d(1)[e].f'))).not.toThrow();
      const ast = parse(tokenize('a.b().c.d(1)[e].f'));
      // Tail is `.f`
      expect(ast.type).toBe('Member');
      expect(ast.property).toBe('f');
    });
  });

  describe('Evaluator end-to-end', () => {
    it('getUser(id).name evaluates to the property', () => {
      const context = {
        id: 42,
        getUser: (id: number) => ({ id, name: 'x' }),
      };
      expect(run('getUser(id).name', context)).toBe('x');
    });

    it('items.filter(fn)[0] returns the first match', () => {
      const context = {
        items: [
          { id: 1, active: false },
          { id: 2, active: true },
          { id: 3, active: true },
        ],
        fn: (u: any) => u.active,
      };
      expect(run('items.filter(fn)[0]', context)).toEqual({ id: 2, active: true });
    });

    it("path.split('/')[2] returns the third segment", () => {
      const context = { path: '/user/42/posts' };
      expect(run("path.split('/')[2]", context)).toBe('42');
    });

    it('arr[0].foo reads a property off the first element', () => {
      const context = { arr: [{ foo: 'hello' }, { foo: 'world' }] };
      expect(run('arr[0].foo', context)).toBe('hello');
    });

    it('a.b().c.d(1)[e].f — full mixed chain evaluates', () => {
      const context = {
        e: 0,
        a: {
          b() {
            return {
              c: {
                d(n: number) {
                  return [{ f: 'got-' + n }];
                },
              },
            };
          },
        },
      };
      expect(run('a.b().c.d(1)[e].f', context)).toBe('got-1');
    });

    it('chained method calls: .method().chained.access', () => {
      const context = {
        obj: {
          make() {
            return { inner: { value: 7 } };
          },
        },
      };
      expect(run('obj.make().inner.value', context)).toBe(7);
    });

    it('call after computed member: handlers[0](evt)', () => {
      const context = {
        evt: { kind: 'click' },
        handlers: [(e: any) => 'handled-' + e.kind],
      };
      expect(run('handlers[0](evt)', context)).toBe('handled-click');
    });
  });

  describe('vln-loop failure mode (call-returning source)', () => {
    it('binds x to the item, not the collection', () => {
      const context = {
        getAll: () => [{ n: 1 }, { n: 2 }],
      };
      // vln-loop synthesises `${expr}[${i}]` internally; verify the parser
      // now handles `[i]` after a call so `x` is bound to an item.
      expect(run('getAll()[0]', context)).toEqual({ n: 1 });
      expect(run('getAll()[1].n', context)).toBe(2);
    });
  });
});
