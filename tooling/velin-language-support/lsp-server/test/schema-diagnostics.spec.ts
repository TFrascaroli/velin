import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { SchemaParser } from '@velin/shared';
import { diagnoseSchemaRefs, describeSchemaFailure } from '../src/schema-diagnostics';

const parser = new SchemaParser();

function tmpUri(prefix: string): { dir: string; uri: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const uri = URI.file(path.join(dir, 'doc.html')).toString();
  return { dir, uri };
}

describe('diagnoseSchemaRefs', () => {
  it('warns when @velin-schema points at a missing source file', () => {
    const { uri } = tmpUri('velin-diag-missing-');
    const text = '<!-- @velin-schema: ./nope.ts#Foo -->\n<div></div>';
    const diags = diagnoseSchemaRefs(parser, text, uri);
    expect(diags).toHaveLength(1);
    expect(diags[0].line).toBe(0);
    expect(diags[0].message).toMatch(/not found/i);
    expect(diags[0].message).toContain('./nope.ts');
    expect(diags[0].code).toBe('schema-unresolved');
  });

  it('warns when the type name is not declared in the source file', () => {
    const { dir, uri } = tmpUri('velin-diag-missing-type-');
    fs.writeFileSync(path.join(dir, 'State.ts'), 'export interface Bar { x: number }', 'utf8');
    const text = '<!-- @velin-schema: ./State.ts#Foo -->\n<div></div>';
    const diags = diagnoseSchemaRefs(parser, text, uri);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toMatch(/Foo/);
    expect(diags[0].message).toMatch(/not declared/i);
  });

  it('is silent when the type exists', () => {
    const { dir, uri } = tmpUri('velin-diag-ok-');
    fs.writeFileSync(path.join(dir, 'State.ts'), 'export interface Foo { x: number }', 'utf8');
    const text = '<!-- @velin-schema: ./State.ts#Foo -->\n<div></div>';
    expect(diagnoseSchemaRefs(parser, text, uri)).toEqual([]);
  });

  it('warns when @velin-schema: script has no matching <script>', () => {
    const { uri } = tmpUri('velin-diag-no-script-');
    const text = '<!-- @velin-schema: script -->\n<div></div>';
    const diags = diagnoseSchemaRefs(parser, text, uri);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toMatch(/no <script>/i);
  });

  it('warns when @velin-schema: script#id has no matching id', () => {
    const { uri } = tmpUri('velin-diag-no-id-');
    const text = [
      '<!-- @velin-schema: script#other -->',
      '<script id="different">const x = 1;</script>',
    ].join('\n');
    const diags = diagnoseSchemaRefs(parser, text, uri);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toMatch(/other/);
  });

  it('does not flag JSDoc types in .js sources as missing declarations', () => {
    const { dir, uri } = tmpUri('velin-diag-jsdoc-');
    // The @typedef lives inside a comment — our AST walk cannot see it.
    // We must not warn "not declared" for JSDoc/JS sources.
    fs.writeFileSync(
      path.join(dir, 'state.js'),
      '/** @typedef {{ x: number }} Foo */\nexport const noop = 0;',
      'utf8',
    );
    const text = '<!-- @velin-schema: ./state.js#Foo -->\n<div></div>';
    expect(diagnoseSchemaRefs(parser, text, uri)).toEqual([]);
  });

  it('warns when a bare linked-path schema points at a missing file', () => {
    const { uri } = tmpUri('velin-diag-linked-missing-');
    const text = '<!-- @velin-schema: ./nope.js -->\n<div></div>';
    const diags = diagnoseSchemaRefs(parser, text, uri);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toMatch(/Linked script not found/);
  });
});

describe('describeSchemaFailure', () => {
  it('returns null for a global-type reference (not diagnosed here)', () => {
    // global-type search is deliberately not diagnosed — too expensive.
    expect(
      describeSchemaFailure({ type: 'global-type', typeName: 'Anything' }, 'file:///x.html'),
    ).toBeNull();
  });
});
