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
