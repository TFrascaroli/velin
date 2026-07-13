import { describe, expect, it, beforeAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { URI } from 'vscode-uri';
import {
  TypeScriptService,
  extractPropertyChainAt,
  extractHopsAt,
} from '../src/typescript-service';

const FIXTURES = path.resolve(__dirname, 'fixtures');

// The service resolves the schema source path relative to the document's
// directory. Point the "document" at fixtures/ so ./UserState.ts resolves.
const documentUri = URI.file(path.join(FIXTURES, 'test.html')).toString();

const tsSchema = {
  type: 'typescript' as const,
  source: './UserState.ts',
  typeName: 'UserStateInterface',
};

describe('TypeScriptService.getCompletions (root)', () => {
  const svc = new TypeScriptService();

  it('lists top-level properties of the interface', async () => {
    const items = await svc.getCompletions(tsSchema, '', 0, documentUri);
    const labels = items.map((i) => i.label);
    expect(labels).toContain('user');
    expect(labels).toContain('users');
    expect(labels).toContain('currentUserId');
    expect(labels).toContain('isLoading');
    expect(labels).toContain('error');
  });

  it('lists methods as callable items', async () => {
    const items = await svc.getCompletions(tsSchema, '', 0, documentUri);
    const updateUser = items.find((i) => i.label === 'updateUser');
    expect(updateUser).toBeDefined();
    expect(updateUser!.insertText).toBe('updateUser()');
  });
});

describe('TypeScriptService.getCompletions (nested paths)', () => {
  const svc = new TypeScriptService();

  it('completes "user." with user fields', async () => {
    const expr = 'user.';
    const items = await svc.getCompletions(tsSchema, expr, expr.length, documentUri);
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(
      expect.arrayContaining(['name', 'email', 'isActive', 'profile']),
    );
  });

  it('completes "user.profile." with profile fields', async () => {
    const expr = 'user.profile.';
    const items = await svc.getCompletions(tsSchema, expr, expr.length, documentUri);
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(
      expect.arrayContaining(['avatar', 'bio', 'preferences']),
    );
  });

  it('completes "user.profile.preferences." with preference fields', async () => {
    const expr = 'user.profile.preferences.';
    const items = await svc.getCompletions(tsSchema, expr, expr.length, documentUri);
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['theme', 'notifications']));
  });

  it('filters by the currently-typed prefix', async () => {
    const expr = 'user.pro';
    const items = await svc.getCompletions(tsSchema, expr, expr.length, documentUri);
    const labels = items.map((i) => i.label);
    expect(labels).toContain('profile');
    expect(labels).not.toContain('name');
  });

  it('returns [] for a nonexistent property path', async () => {
    const expr = 'user.doesNotExist.';
    const items = await svc.getCompletions(tsSchema, expr, expr.length, documentUri);
    expect(items).toEqual([]);
  });
});

describe('extractPropertyChainAt', () => {
  it('returns null when the cursor is in a gap between identifiers', () => {
    // Position 5 is the '+' — not part of any identifier.
    expect(extractPropertyChainAt('user + 1', 5)).toBeNull();
  });

  it('treats the position immediately after an identifier as on it', () => {
    // Standard editor convention: cursor after `user` still targets `user`.
    expect(extractPropertyChainAt('user + 1', 4)).toEqual({
      path: [],
      target: 'user',
    });
  });

  it('returns the identifier when the cursor is on a bare name', () => {
    expect(extractPropertyChainAt('user', 2)).toEqual({ path: [], target: 'user' });
  });

  it('splits a dotted chain into path + target', () => {
    // Cursor mid-`profile` inside "user.profile.avatar"
    const expr = 'user.profile.avatar';
    const cursor = 8; // inside "profile"
    expect(extractPropertyChainAt(expr, cursor)).toEqual({
      path: ['user'],
      target: 'profile',
    });
  });

  it('handles the tail of a chain', () => {
    const expr = 'user.profile.avatar';
    const cursor = expr.length - 1;
    expect(extractPropertyChainAt(expr, cursor)).toEqual({
      path: ['user', 'profile'],
      target: 'avatar',
    });
  });

  it('handles expressions surrounded by other tokens', () => {
    const expr = "'x' + user.name + 1";
    const cursor = expr.indexOf('name') + 2;
    expect(extractPropertyChainAt(expr, cursor)).toEqual({
      path: ['user'],
      target: 'name',
    });
  });
});

describe('TypeScriptService.getDefinition', () => {
  const svc = new TypeScriptService();

  it('resolves user.name to its declaration in the interface', async () => {
    const expr = 'user.name';
    const loc = await svc.getDefinition(
      tsSchema,
      expr,
      expr.length - 1, // inside "name"
      documentUri,
    );
    expect(loc).not.toBeNull();
    expect(loc!.uri).toMatch(/UserState\.ts$/);
    // "name" is declared on line 3 (0-based line 2) of the interface file.
    expect(loc!.range.start.line).toBe(2);
  });

  it('returns null for a nonexistent property', async () => {
    const expr = 'user.doesNotExist';
    const loc = await svc.getDefinition(
      tsSchema,
      expr,
      expr.length - 1,
      documentUri,
    );
    expect(loc).toBeNull();
  });
});

describe('extractHopsAt (AST chain analysis)', () => {
  it('returns a bare identifier chain', () => {
    expect(extractHopsAt('user', 2)).toEqual({ root: 'user', hops: [] });
  });

  it('splits a dotted chain into root + prop hops', () => {
    // Cursor mid-`avatar` in "user.profile.avatar"
    const expr = 'user.profile.avatar';
    expect(extractHopsAt(expr, expr.length - 1)).toEqual({
      root: 'user',
      hops: [
        { kind: 'prop', name: 'profile' },
        { kind: 'prop', name: 'avatar' },
      ],
    });
  });

  it('handles call expression followed by property access', () => {
    // getCurrentUser().name — cursor on `name`
    const expr = 'getCurrentUser().name';
    const cursor = expr.length - 2;
    expect(extractHopsAt(expr, cursor)).toEqual({
      root: 'getCurrentUser',
      hops: [{ kind: 'call' }, { kind: 'prop', name: 'name' }],
    });
  });

  it('handles element access', () => {
    // users[0].name — cursor on `name`
    const expr = 'users[0].name';
    const cursor = expr.length - 2;
    expect(extractHopsAt(expr, cursor)).toEqual({
      root: 'users',
      hops: [{ kind: 'index' }, { kind: 'prop', name: 'name' }],
    });
  });
});

describe('TypeScriptService.getDefinition (call chains)', () => {
  const svc = new TypeScriptService();

  it('follows a call expression to its return type property', async () => {
    // getCurrentUser() returns UserStateInterface['users'][0] | null, whose
    // properties include id/name/email. Cursor on `name`.
    const expr = 'getCurrentUser().name';
    const loc = await svc.getDefinition(
      tsSchema,
      expr,
      expr.length - 1,
      documentUri,
    );
    expect(loc).not.toBeNull();
    expect(loc!.uri).toMatch(/UserState\.ts$/);
  });
});

describe('TypeScriptService.getCompletions (inline-script)', () => {
  const svc = new TypeScriptService();

  it('infers state shape from Velin.bind() and completes user.', async () => {
    const script = `
      const state = {
        user: { name: 'Alice', email: 'a@b.c' },
        users: [{ id: '1', name: 'Alice' }],
        greet() { return 'hi'; },
      };
      Velin.bind(document.getElementById('app'), state);
    `;
    const inlineSchema = {
      type: 'inline-script' as const,
      source: script,
      sourceOffset: 0,
    };
    const expr = 'user.';
    const items = await svc.getCompletions(
      inlineSchema,
      expr,
      expr.length,
      documentUri,
    );
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['name', 'email']));
  });

  it('exposes top-level methods on the inferred state', async () => {
    const script = `
      const state = {
        count: 0,
        greet(name) { return 'hi ' + name; },
      };
      Velin.bind(null, state);
    `;
    const inlineSchema = {
      type: 'inline-script' as const,
      source: script,
      sourceOffset: 0,
    };
    const items = await svc.getCompletions(
      inlineSchema,
      '',
      0,
      documentUri,
    );
    const greet = items.find((i) => i.label === 'greet');
    expect(greet).toBeDefined();
    expect(greet!.insertText).toBe('greet()');
  });
});

describe('TypeScriptService.getCompletions (linked script)', () => {
  const svc = new TypeScriptService();

  it('reads a bare-path linked file (no <script> in HTML needed)', async () => {
    // Path comes straight from the schema comment, not from a <script src>.
    // Useful when the runtime bundle differs from the compile-time source.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velin-bare-'));
    const tsPath = path.join(dir, 'app.ts');
    fs.writeFileSync(
      tsPath,
      `interface AppState { count: number; name: string; }
       declare const Velin: { bind(el: unknown, s: AppState): unknown };
       const state: AppState = { count: 0, name: 'x' };
       Velin.bind(document.body, state);`,
      'utf8',
    );
    const htmlUri = URI.file(path.join(dir, 'index.html')).toString();

    const inlineSchema = {
      type: 'inline-script' as const,
      linkedPath: './app.ts',
    };
    const items = await svc.getCompletions(
      inlineSchema,
      '',
      0,
      htmlUri,
    );
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['count', 'name']));
  });

  it('reads a linked .js file and infers the Velin.bind state', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velin-linked-'));
    const jsPath = path.join(dir, 'state.js');
    fs.writeFileSync(
      jsPath,
      `const state = {
         user: { name: 'x', email: 'y' },
         users: [{ id: 1 }],
         greet() {},
       };
       Velin.bind(document.body, state);`,
      'utf8',
    );
    const htmlUri = URI.file(path.join(dir, 'index.html')).toString();

    const inlineSchema = {
      type: 'inline-script' as const,
      typeName: 'state',
      linkedPath: './state.js',
    };
    const expr = 'user.';
    const items = await svc.getCompletions(
      inlineSchema,
      expr,
      expr.length,
      htmlUri,
    );
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['name', 'email']));
  });
});

describe('TypeScriptService.getCompletions (nested loop scope)', () => {
  const svc = new TypeScriptService();

  it('resolves vln-loop:o="u.orders" through the parent loop var', async () => {
    // Regression for P0.7: elementTypeOfProperty used to receive "u.orders"
    // as a single property name and fail to resolve. The chain resolver must
    // walk `u` (a loop-scope var) and then `.orders`.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velin-nested-'));
    const schemaPath = path.join(dir, 'State.ts');
    fs.writeFileSync(
      schemaPath,
      `export interface State {
         users: Array<{
           id: string;
           orders: Array<{ total: number; sku: string }>;
         }>;
       }`,
      'utf8',
    );

    const html = [
      '<!-- @velin-schema: ./State.ts#State -->',
      '<div vln-loop:u="users">',
      '  <div vln-loop:o="u.orders">',
      '    <span vln-text="o."></span>',
      '  </div>',
      '</div>',
    ].join('\n');
    const htmlPath = path.join(dir, 'index.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    const htmlUri = URI.file(htmlPath).toString();

    const nestedSchema = {
      type: 'typescript' as const,
      source: './State.ts',
      typeName: 'State',
    };
    const expr = 'o.';
    const items = await svc.getCompletions(
      nestedSchema, expr, expr.length, htmlUri, 3, html,
    );
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['total', 'sku']));
    expect(labels).not.toContain('orders');
  });
});

describe('TypeScriptService.getCompletions (loop scope)', () => {
  const svc = new TypeScriptService();

  it('resolves a vln-loop variable to the array element type', async () => {
    // Simulate a document where line 2 sits inside <div vln-loop:u="users">.
    const html = [
      '<!-- @velin-schema: ./UserState.ts#UserStateInterface -->',
      '<div vln-loop:u="users">',
      '  <span vln-text="u."></span>',
      '</div>',
    ].join('\n');

    const tmp = path.join(os.tmpdir(), `velin-loop-${Date.now()}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    const loopUri = URI.file(tmp).toString();

    // Also copy UserState.ts alongside so the relative resolve works.
    fs.copyFileSync(
      path.join(FIXTURES, 'UserState.ts'),
      path.join(path.dirname(tmp), 'UserState.ts'),
    );

    const expr = 'u.';
    const items = await svc.getCompletions(
      tsSchema,
      expr,
      expr.length,
      loopUri,
      2, // line inside the loop
      html,
    );
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['id', 'name', 'email']));
  });
});
