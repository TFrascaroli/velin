import { describe, it, expect } from 'vitest';
import { extractDeclaredTemplateVars } from '../src/vln-vars';

describe('extractDeclaredTemplateVars', () => {
  describe('array form', () => {
    it('extracts single-quoted names', () => {
      expect(extractDeclaredTemplateVars("['a', 'b', 'c']")).toEqual(['a', 'b', 'c']);
    });

    it('extracts double-quoted names', () => {
      expect(extractDeclaredTemplateVars('["a", "b"]')).toEqual(['a', 'b']);
    });

    it('tolerates whitespace and returns [] for empty arrays', () => {
      expect(extractDeclaredTemplateVars('[  ]')).toEqual([]);
      expect(extractDeclaredTemplateVars('[]')).toEqual([]);
    });
  });

  describe('object (transformer) form', () => {
    it('extracts identifier keys', () => {
      expect(extractDeclaredTemplateVars('{ a: fn, b: fn }')).toEqual(['a', 'b']);
    });

    it('extracts string-literal keys', () => {
      expect(extractDeclaredTemplateVars("{ 'a': fn, \"b\": fn }")).toEqual(['a', 'b']);
    });

    it('handles arrow-function values', () => {
      expect(
        extractDeclaredTemplateVars('{ a: (v) => v * 2, b: () => 1, c: x => x }'),
      ).toEqual(['a', 'b', 'c']);
    });

    it('ignores nested-object keys', () => {
      expect(
        extractDeclaredTemplateVars('{ user: { name: fn }, count: fn }'),
      ).toEqual(['user', 'count']);
    });

    it('ignores nested-array element strings', () => {
      expect(
        extractDeclaredTemplateVars('{ items: ["x", "y"], count: fn }'),
      ).toEqual(['items', 'count']);
    });

    it('returns [] for empty object', () => {
      expect(extractDeclaredTemplateVars('{}')).toEqual([]);
      expect(extractDeclaredTemplateVars('{ }')).toEqual([]);
    });
  });

  describe('unsupported / edge inputs', () => {
    it('returns [] for expressions that are not array/object literals', () => {
      expect(extractDeclaredTemplateVars('someHelper()')).toEqual([]);
      expect(extractDeclaredTemplateVars('null')).toEqual([]);
      expect(extractDeclaredTemplateVars('')).toEqual([]);
    });

    it('quietly skips spread / computed keys (deferred surface)', () => {
      // Spread + computed keys aren't in-scope for hover/completions yet;
      // the extractor just returns whatever plain keys it can identify.
      expect(extractDeclaredTemplateVars('{ ...base, a: fn }')).toEqual(['a']);
      expect(extractDeclaredTemplateVars('{ [dyn]: fn, a: fn }')).toEqual(['a']);
    });

    it('handles string values without confusing them for keys', () => {
      expect(extractDeclaredTemplateVars('{ a: "b: c" }')).toEqual(['a']);
    });
  });
});
