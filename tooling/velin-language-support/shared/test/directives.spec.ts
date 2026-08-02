import { describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import {
  VELIN_DIRECTIVE_META,
  VELIN_DIRECTIVES,
  directivesValidAt,
  findDirectiveMeta,
  isValidDirectiveName,
  validateDirectivePlacement,
} from '../src/directives';

describe('VELIN_DIRECTIVE_META', () => {
  it('has unique names', () => {
    const seen = new Set<string>();
    for (const d of VELIN_DIRECTIVE_META) {
      expect(seen.has(d.name), `duplicate: ${d.name}`).toBe(false);
      seen.add(d.name);
    }
  });

  it('exposes VELIN_DIRECTIVES as a name list', () => {
    expect(VELIN_DIRECTIVES).toEqual(VELIN_DIRECTIVE_META.map((d) => d.name));
  });

  it('isValidDirectiveName / findDirectiveMeta agree', () => {
    for (const d of VELIN_DIRECTIVE_META) {
      expect(isValidDirectiveName(d.name)).toBe(true);
      expect(findDirectiveMeta(d.name)?.name).toBe(d.name);
    }
    expect(isValidDirectiveName('vln-nope')).toBe(false);
    expect(findDirectiveMeta('vln-nope')).toBeUndefined();
  });

  describe('validateDirectivePlacement', () => {
    it('accepts vln-vars on <template> (declaration role)', () => {
      expect(validateDirectivePlacement('vln-vars', { tagName: 'template' })).toBeNull();
    });

    it('accepts vln-vars on a <div> (fragment provider role)', () => {
      // Unified vln-vars is valid on any element — runtime is what
      // distinguishes declaration vs provider.
      expect(validateDirectivePlacement('vln-vars', { tagName: 'div' })).toBeNull();
    });

    it('accepts vln-template on <template>', () => {
      expect(validateDirectivePlacement('vln-template', { tagName: 'template' })).toBeNull();
    });

    it('rejects vln-template on a <div>', () => {
      const err = validateDirectivePlacement('vln-template', { tagName: 'div' });
      expect(err?.code).toBe('wrong-tag');
      expect(err?.message).toMatch(/only valid on <template>/);
    });

    it('accepts unconstrained directives anywhere', () => {
      for (const name of ['vln-text', 'vln-if', 'vln-loop', 'vln-on']) {
        expect(validateDirectivePlacement(name, { tagName: 'div' })).toBeNull();
      }
    });
  });

  describe('directivesValidAt', () => {
    it('excludes vln-template on non-template elements', () => {
      const names = directivesValidAt({ tagName: 'div' }).map((m) => m.name);
      expect(names).not.toContain('vln-template');
      expect(names).toContain('vln-text');
    });

    it('includes vln-template on <template>', () => {
      const names = directivesValidAt({ tagName: 'template' }).map((m) => m.name);
      expect(names).toContain('vln-template');
    });

    it('includes vln-vars anywhere (dual-role directive)', () => {
      for (const tagName of ['div', 'template', 'span']) {
        const names = directivesValidAt({ tagName }).map((m) => m.name);
        expect(names, `expected vln-vars valid on <${tagName}>`).toContain('vln-vars');
      }
    });

    it('does NOT include the removed vln-var directive', () => {
      const names = directivesValidAt({ tagName: 'div' }).map((m) => m.name);
      expect(names).not.toContain('vln-var');
    });
  });

  it('stays in sync with the framework source files', () => {
    // Scan src/velin-*.js for every vln-<name> occurrence and diff against
    // our canonical list. If a new directive is added upstream and the
    // extension isn't updated, this test flags it.
    const repoRoot = path.resolve(__dirname, '../../../..');
    let grepOut = '';
    try {
      grepOut = execSync(
        `grep -oE "vln-[a-z]+" "${repoRoot.replace(/\\/g, '/')}/src"/*.js`,
        { encoding: 'utf8', shell: '/bin/bash' } as any,
      );
    } catch {
      // grep may not be available on Windows CI runners without WSL — skip
      // silently. This assertion is a best-effort drift alarm, not a hard
      // gate.
      return;
    }
    const found = new Set(
      grepOut
        .split('\n')
        .map((l) => l.split(':').pop()?.trim())
        .filter((x): x is string => !!x)
        // Filter out doc-string false positives (e.g. "vln-attrname" is a
        // header slug, not a directive).
        .filter((x) => !/^vln-(attrname|onevent)$/.test(x)),
    );
    for (const name of found) {
      expect(
        VELIN_DIRECTIVES,
        `framework uses ${name} but VELIN_DIRECTIVES doesn't list it`,
      ).toContain(name);
    }
  });
});
