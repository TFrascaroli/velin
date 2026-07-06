import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { SchemaParser } from '@velin/shared';
import { TypeScriptService } from '../src/typescript-service';

const schemaParser = new SchemaParser();

describe('TypeScriptService.getDefinition (inline-script offset translation)', () => {
  const svc = new TypeScriptService();

  it('maps a hop back to its HTML line, not the compiled inline file', async () => {
    // The declaration for `user` lives on line 3 of the HTML document
    // (inside the <script> body). The inline compiler prepends a runtime
    // prelude to that source; locationOfDecl must undo the prelude offset
    // and add sourceOffset back to land on the HTML line.
    const html = [
      '<!-- @velin-schema: script -->',                     // line 0
      '<div vln-text="user.name"></div>',                    // line 1
      '<script>',                                            // line 2
      '  const state = { user: { name: "Alice" } };',        // line 3 — decl of `user`
      '  Velin.bind(document.body, state);',                 // line 4
      '</script>',                                           // line 5
    ].join('\n');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velin-inline-offset-'));
    const htmlPath = path.join(dir, 'doc.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    const htmlUri = URI.file(htmlPath).toString();

    // Resolve the schema comment through the real parser so `source` and
    // `sourceOffset` are populated the same way the LSP does at runtime.
    const { schemaRef } = schemaParser.findSchemaContext(html, 1);
    expect(schemaRef).not.toBeNull();

    const expr = 'user.name';
    const loc = await svc.getDefinition(
      schemaRef!,
      expr,
      expr.length - 1, // cursor on `name`
      htmlUri,
      1,
      html,
    );

    expect(loc).not.toBeNull();
    expect(loc!.uri).toBe(htmlUri);
    // The declaration of `name` lives on HTML line 3.
    expect(loc!.range.start.line).toBe(3);
  });
});

describe('TypeScriptService LRU eviction (file-backed)', () => {
  it('evicts the oldest file-backed program once the cap is exceeded', async () => {
    // Use a tiny cap so the test doesn't have to instantiate 65 real TS
    // programs (each pulls the full lib.d.ts and blows past the heap).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velin-lru-'));
    const svc = new TypeScriptService({ maxFileBackedPrograms: 3 });

    const makeSchema = (i: number) => {
      const p = path.join(dir, `S${i}.ts`);
      fs.writeFileSync(p, `export interface State${i} { v${i}: number }`, 'utf8');
      return {
        htmlUri: URI.file(path.join(dir, `doc${i}.html`)).toString(),
        ref: { type: 'typescript' as const, source: `./S${i}.ts`, typeName: `State${i}` },
      };
    };

    const first = makeSchema(0);
    const firstA = await svc.resolveRootType(first.ref, first.htmlUri);
    expect(firstA).not.toBeNull();

    // Fill past the cap of 3 file-backed programs.
    for (let i = 1; i <= 3; i++) {
      const s = makeSchema(i);
      const r = await svc.resolveRootType(s.ref, s.htmlUri);
      expect(r).not.toBeNull();
    }

    // First entry should now be evicted — a new resolve gets a fresh program.
    const firstB = await svc.resolveRootType(first.ref, first.htmlUri);
    expect(firstB).not.toBeNull();
    expect(firstB!.program).not.toBe(firstA!.program);
  }, 30_000);

  it('re-serves the same program instance on repeated resolves within the cap', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velin-lru-hot-'));
    fs.writeFileSync(path.join(dir, 'State.ts'), 'export interface State { x: number }', 'utf8');
    const svc = new TypeScriptService();
    const ref = { type: 'typescript' as const, source: './State.ts', typeName: 'State' };
    const uri = URI.file(path.join(dir, 'doc.html')).toString();

    const a = await svc.resolveRootType(ref, uri);
    const b = await svc.resolveRootType(ref, uri);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.program).toBe(b!.program);
  });
});

describe('TypeScriptService cache invalidation', () => {
  it('invalidateFileBackedPrograms drops file-backed but keeps inline', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velin-inv-'));
    fs.writeFileSync(path.join(dir, 'State.ts'), 'export interface State { x: number }', 'utf8');
    const svc = new TypeScriptService();
    const fileRef = { type: 'typescript' as const, source: './State.ts', typeName: 'State' };
    const htmlUri = URI.file(path.join(dir, 'doc.html')).toString();

    // Prime file-backed.
    const fileA = await svc.resolveRootType(fileRef, htmlUri);
    expect(fileA).not.toBeNull();

    // Prime inline.
    const inlineRef = {
      type: 'inline-script' as const,
      source: 'const state = { x: 1 }; Velin.bind(null, state);',
      sourceOffset: 0,
    };
    const inlineA = await svc.resolveRootType(inlineRef, htmlUri);
    expect(inlineA).not.toBeNull();

    svc.invalidateFileBackedPrograms();

    // Inline hits the same program (content-hash key untouched).
    const inlineB = await svc.resolveRootType(inlineRef, htmlUri);
    expect(inlineB!.program).toBe(inlineA!.program);

    // File-backed rebuilt.
    const fileB = await svc.resolveRootType(fileRef, htmlUri);
    expect(fileB!.program).not.toBe(fileA!.program);
  });
});
