import { describe, expect, it } from 'vitest';
import { DirectiveParser } from '../src/directive-parser';

const p = new DirectiveParser();

describe('DirectiveParser.findDirectivesInLine', () => {
  it('finds a plain vln-text directive', () => {
    const line = '<span vln-text="user.name"></span>';
    const found = p.findDirectivesInLine(line, 0);
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('vln-text');
    expect(found[0].attribute).toBe('vln-text');
    expect(found[0].expression).toBe('user.name');
  });

  it('captures the subkey in vln-on:click', () => {
    const line = '<button vln-on:click="doThing()">x</button>';
    const found = p.findDirectivesInLine(line, 0);
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('vln-on');
    expect(found[0].attribute).toBe('vln-on:click');
    expect(found[0].expression).toBe('doThing()');
  });

  it('captures kebab-case subkeys (vln-attr:data-id)', () => {
    const line = '<div vln-attr:data-id="row.id"></div>';
    const found = p.findDirectivesInLine(line, 0);
    expect(found).toHaveLength(1);
    expect(found[0].attribute).toBe('vln-attr:data-id');
    expect(found[0].expression).toBe('row.id');
  });

  it("handles single-quoted expressions containing double quotes", () => {
    const line = `<p vln-text='"Hi, " + name'></p>`;
    const found = p.findDirectivesInLine(line, 0);
    expect(found).toHaveLength(1);
    expect(found[0].expression).toBe('"Hi, " + name');
  });

  it('handles double-quoted expressions containing single quotes', () => {
    // Regression: the previous regex broke on any inner quote.
    const line = `<p vln-text="'Hello, ' + name"></p>`;
    const found = p.findDirectivesInLine(line, 0);
    expect(found).toHaveLength(1);
    expect(found[0].expression).toBe("'Hello, ' + name");
  });

  it('finds multiple directives on the same line', () => {
    const line =
      '<img vln-attr:src="user.avatar" vln-attr:alt="user.name + \' avatar\'" />';
    const found = p.findDirectivesInLine(line, 0);
    expect(found).toHaveLength(2);
    expect(found.map((d) => d.attribute)).toEqual([
      'vln-attr:src',
      'vln-attr:alt',
    ]);
    expect(found[1].expression).toBe("user.name + ' avatar'");
  });

  it('ignores non-Velin attributes that happen to start with vln', () => {
    // "vlnfoo" is not a valid directive because it lacks the "-".
    const line = '<div vlnfoo="x" data-vln-text="y"></div>';
    const found = p.findDirectivesInLine(line, 0);
    expect(found).toHaveLength(0);
  });

  it('rejects unknown vln-* directive names', () => {
    const line = '<div vln-not-real="x"></div>';
    const found = p.findDirectivesInLine(line, 0);
    expect(found).toHaveLength(0);
  });

  it('accepts every canonical directive name', () => {
    const names = [
      'vln-text',
      'vln-input',
      'vln-if',
      'vln-class',
      'vln-attr:src',
      'vln-on:click',
      'vln-loop:item',
      'vln-use',
      'vln-fragment',
      'vln-watch:handler',
      'vln-var:foo',
      'vln-vars',
      'vln-table',
      'vln-evt:custom',
      'vln-route',
      'vln-router',
    ];
    for (const attr of names) {
      const line = `<div ${attr}="expr"></div>`;
      const found = p.findDirectivesInLine(line, 0);
      expect(found, `expected ${attr} to parse`).toHaveLength(1);
    }
  });

  it('records positional info covering the whole match', () => {
    const line = '  <span vln-text="user.name"></span>';
    const found = p.findDirectivesInLine(line, 0);
    expect(found).toHaveLength(1);
    expect(line.slice(found[0].position.start, found[0].position.end)).toBe(
      'vln-text="user.name"',
    );
  });
});

describe('DirectiveParser.isInDirectiveExpression', () => {
  it('returns the expression when cursor is inside the quotes', () => {
    const line = '<span vln-text="user.name"></span>';
    // cursor between "user." and "name"
    const idx = line.indexOf('name');
    const ctx = p.isInDirectiveExpression(line, idx);
    expect(ctx).not.toBeNull();
    expect(ctx!.directive.attribute).toBe('vln-text');
    // expressionPos is 0-based offset within the expression
    expect(line.substring(idx, idx + 4)).toBe('name');
  });

  it('returns null when cursor is outside any expression', () => {
    const line = '<span vln-text="user.name"></span>';
    expect(p.isInDirectiveExpression(line, 0)).toBeNull();
    expect(p.isInDirectiveExpression(line, line.length - 1)).toBeNull();
  });
});
