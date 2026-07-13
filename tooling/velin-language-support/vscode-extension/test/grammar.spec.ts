import { describe, expect, it, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as oniguruma from 'vscode-oniguruma';
import * as vsctm from 'vscode-textmate';

const grammarPath = path.resolve(
  __dirname,
  '../syntaxes/html-velin.injection.json',
);

let grammar: vsctm.IGrammar;

beforeAll(async () => {
  const wasmBin = fs.readFileSync(
    require.resolve('vscode-oniguruma/release/onig.wasm'),
  ).buffer;
  await oniguruma.loadWASM(wasmBin);

  const registry = new vsctm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
      createOnigString: (s) => new oniguruma.OnigString(s),
    }),
    loadGrammar: async (scopeName) => {
      if (scopeName === 'html-velin.injection') {
        const raw = fs.readFileSync(grammarPath, 'utf8');
        return vsctm.parseRawGrammar(raw, grammarPath);
      }
      if (scopeName === 'source.js') {
        // Stub for tests. Real VS Code provides the actual JS grammar.
        return vsctm.parseRawGrammar(
          JSON.stringify({
            scopeName: 'source.js',
            patterns: [{ match: '.+', name: 'source.js' }],
          }),
          'stub.source.js.json',
        );
      }
      return null;
    },
  });

  grammar = (await registry.loadGrammar('html-velin.injection'))!;
});

function tokenize(text: string) {
  return grammar.tokenizeLine(text, vsctm.INITIAL);
}

function findScope(text: string, scope: string, expected: string) {
  const { tokens } = tokenize(text);
  const tok = tokens.find((t) => t.scopes.includes(scope));
  return tok ? text.slice(tok.startIndex, tok.endIndex) : null;
}

describe('html-velin injection grammar', () => {
  it('loads', () => {
    expect(grammar).toBeDefined();
  });

  it('scopes vln- prefix as an HTML attribute name, directive name as a tag', () => {
    // `entity.other.attribute-name.velin` inherits the theme's attribute-name
    // styling, so `vln-` looks like `class`/`id` and only the directive name
    // stands out.
    const line = ' vln-text="expr"';
    expect(findScope(line, 'entity.other.attribute-name.velin', 'vln-')).toBe('vln-');
    expect(findScope(line, 'entity.name.tag.velin.directive', 'text')).toBe('text');
  });

  it('scopes loop subkey as a variable declaration', () => {
    const line = ' vln-loop:item="items"';
    expect(findScope(line, 'variable.parameter.velin.declaration', 'item')).toBe(
      'item',
    );
    expect(findScope(line, 'entity.name.tag.velin.directive', 'loop')).toBe('loop');
  });

  it('scopes var subkey as a variable declaration', () => {
    const line = ' vln-var:user="currentUser"';
    expect(findScope(line, 'variable.parameter.velin.declaration', 'user')).toBe(
      'user',
    );
  });

  it('scopes event subkey (vln-on:click) as a modifier, not a declaration', () => {
    const line = ' vln-on:click="handler()"';
    expect(findScope(line, 'support.type.property-name.velin.modifier', 'click')).toBe(
      'click',
    );
    expect(findScope(line, 'variable.parameter.velin.declaration', '')).toBe(null);
  });

  it('scopes attr subkey (vln-attr:src) as a modifier', () => {
    const line = ' vln-attr:src="user.avatar"';
    expect(findScope(line, 'support.type.property-name.velin.modifier', 'src')).toBe(
      'src',
    );
  });

  it('embeds source.js inside directive expressions', () => {
    const line = ' vln-text="user.name + 1"';
    const { tokens } = tokenize(line);
    const jsTok = tokens.find((t) =>
      t.scopes.some((s) => s.startsWith('meta.embedded.expression.velin')),
    );
    expect(jsTok).toBeDefined();
  });

  it('recognizes schema comment forms', () => {
    const forms = [
      '<!-- @velin-schema: ./s.ts#T -->',
      '<!-- @vln-type {./s.ts#T} -->',
      '<!-- @velin-type {T} -->',
    ];
    for (const line of forms) {
      const { tokens } = tokenize(line);
      const kw = tokens.find((t) =>
        t.scopes.some((s) => s === 'keyword.control.velin-schema'),
      );
      expect(kw, `no keyword scope in: ${line}`).toBeDefined();
    }
  });
});
