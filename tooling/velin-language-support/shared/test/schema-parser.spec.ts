import { describe, expect, it } from 'vitest';
import { SchemaParser } from '../src/schema-parser';

const p = new SchemaParser();

describe('SchemaParser.parseSchemaComment', () => {
  it('parses @velin-schema: path#TypeName (colon form)', () => {
    const ref = p.parseSchemaComment(
      '<!-- @velin-schema: ./state.ts#UserState -->',
    );
    expect(ref).toEqual({
      type: 'typescript',
      source: './state.ts',
      typeName: 'UserState',
    });
  });

  it('parses @vln-type { path#TypeName } (braced form)', () => {
    const ref = p.parseSchemaComment(
      '<!-- @vln-type {./state.ts#UserState} -->',
    );
    expect(ref).toEqual({
      type: 'typescript',
      source: './state.ts',
      typeName: 'UserState',
    });
  });

  it('parses @velin-type with space separator', () => {
    const ref = p.parseSchemaComment(
      '<!-- @velin-type {./state.ts#UserState} -->',
    );
    expect(ref?.typeName).toBe('UserState');
  });

  it('parses a global type reference (bare TypeName)', () => {
    const ref = p.parseSchemaComment('<!-- @velin-type {UserState} -->');
    expect(ref).toEqual({ type: 'global-type', typeName: 'UserState' });
  });

  it('parses a raw JSON schema path', () => {
    const ref = p.parseSchemaComment(
      '<!-- @velin-schema: ./schema.json -->',
    );
    expect(ref).toEqual({ type: 'json', source: './schema.json' });
  });

  it('classifies .js source as jsdoc (not typescript)', () => {
    const ref = p.parseSchemaComment(
      '<!-- @velin-schema: ./state.js#UserState -->',
    );
    expect(ref).toEqual({
      type: 'jsdoc',
      source: './state.js',
      typeName: 'UserState',
    });
  });

  it('parses @velin-schema: script (inline-script mode)', () => {
    const ref = p.parseSchemaComment('<!-- @velin-schema: script -->');
    expect(ref).toEqual({ type: 'inline-script' });
  });

  it('parses @velin-schema: script#id (targeted-script mode)', () => {
    const ref = p.parseSchemaComment('<!-- @velin-schema: script#state -->');
    expect(ref).toEqual({ type: 'inline-script', typeName: 'state' });
  });

  it('parses a bare JS/TS path as an inline-script linkedPath', () => {
    // The runtime <script src="..."> may point at a bundled asset — a bare
    // path in the comment lets the user pick the "reachable at compile time"
    // source instead.
    expect(p.parseSchemaComment('<!-- @velin-schema: ./src/app.ts -->')).toEqual({
      type: 'inline-script',
      linkedPath: './src/app.ts',
    });
    expect(p.parseSchemaComment('<!-- @velin-schema: ./state.js -->')).toEqual({
      type: 'inline-script',
      linkedPath: './state.js',
    });
    expect(p.parseSchemaComment('<!-- @velin-schema: ./state.mjs -->')).toEqual({
      type: 'inline-script',
      linkedPath: './state.mjs',
    });
  });

  it('returns null for unrelated comments', () => {
    expect(p.parseSchemaComment('<!-- just a comment -->')).toBeNull();
    expect(p.parseSchemaComment('<!-- @other-schema: foo.ts -->')).toBeNull();
    expect(p.parseSchemaComment('')).toBeNull();
  });
});

describe('SchemaParser.findSchemaContext', () => {
  it('returns null when no schema comment precedes the position', () => {
    const doc = ['<div>', '  <p>x</p>', '</div>'].join('\n');
    expect(p.findSchemaContext(doc, 1).schemaRef).toBeNull();
  });

  it('finds the nearest schema comment above the position', () => {
    const doc = [
      '<!-- @velin-schema: ./a.ts#TypeA -->',
      '<div>',
      '  <p vln-text="x"></p>',
      '</div>',
    ].join('\n');
    const ctx = p.findSchemaContext(doc, 2);
    expect(ctx.schemaRef?.typeName).toBe('TypeA');
  });

  it('ignores <script> mentions inside HTML comments (inline-script)', () => {
    const doc = [
      '<!--',
      '  This talks about the <script> block down there.',
      '-->',
      '<!-- @velin-schema: script -->',
      '<div vln-text="user.name"></div>',
      '<script>',
      '  const state = { user: { name: "x" } };',
      '  Velin.bind(document.body, state);',
      '</script>',
    ].join('\n');
    const ctx = p.findSchemaContext(doc, 4);
    expect(ctx.schemaRef?.type).toBe('inline-script');
    expect(ctx.schemaRef?.source).toContain('Velin.bind');
    expect(ctx.schemaRef?.source).not.toContain('talks about');
  });

  it('resolves inline-script mode by extracting the last <script> body', () => {
    const doc = [
      '<!-- @velin-schema: script -->',
      '<div vln-text="user.name"></div>',
      '<script>',
      '  const state = { user: { name: "x" } };',
      '  Velin.bind(document.body, state);',
      '</script>',
    ].join('\n');
    const ctx = p.findSchemaContext(doc, 1);
    expect(ctx.schemaRef?.type).toBe('inline-script');
    expect(ctx.schemaRef?.source).toContain('Velin.bind');
    expect(ctx.schemaRef?.sourceOffset).toBeGreaterThan(0);
  });

  it('picks the <script> by id when the comment is `script#id`', () => {
    const doc = [
      '<!-- @velin-schema: script#state -->',
      '<div vln-text="user.name"></div>',
      '<script id="other">const noise = {};</script>',
      '<script id="state">',
      '  const state = { user: { name: "x" } };',
      '  Velin.bind(document.body, state);',
      '</script>',
    ].join('\n');
    const ctx = p.findSchemaContext(doc, 1);
    expect(ctx.schemaRef?.type).toBe('inline-script');
    expect(ctx.schemaRef?.typeName).toBe('state');
    expect(ctx.schemaRef?.source).toContain('Velin.bind');
    expect(ctx.schemaRef?.source).not.toContain('noise');
  });

  it('records linkedPath when the targeted <script> has a src attribute', () => {
    const doc = [
      '<!-- @velin-schema: script#state -->',
      '<script id="state" src="./state.js"></script>',
    ].join('\n');
    const ctx = p.findSchemaContext(doc, 0);
    expect(ctx.schemaRef?.type).toBe('inline-script');
    expect(ctx.schemaRef?.linkedPath).toBe('./state.js');
    expect(ctx.schemaRef?.source).toBeUndefined();
  });

  it('prefers the more recent schema comment when multiple exist', () => {
    const doc = [
      '<!-- @velin-schema: ./a.ts#TypeA -->',
      '<div>',
      '  <p vln-text="x"></p>',
      '</div>',
      '<!-- @velin-schema: ./b.ts#TypeB -->',
      '<div>',
      '  <p vln-text="y"></p>',
      '</div>',
    ].join('\n');
    const ctx = p.findSchemaContext(doc, 6);
    expect(ctx.schemaRef?.typeName).toBe('TypeB');
  });
});
