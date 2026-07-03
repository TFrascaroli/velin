import { describe, expect, it } from 'vitest';
import { findElementAt, scanElements } from '../src/html-tag-scanner';

describe('scanElements', () => {
  it('yields tag name and attribute names for a plain tag', () => {
    const html = '<div id="a" class="b" vln-text="expr"></div>';
    const els = [...scanElements(html)];
    expect(els).toHaveLength(1);
    expect(els[0].tagName).toBe('div');
    expect(els[0].attributes.map((a) => a.name)).toEqual([
      'id',
      'class',
      'vln-text',
    ]);
  });

  it('records the offset of each attribute name', () => {
    const html = '<div vln-text="expr"></div>';
    const el = [...scanElements(html)][0];
    const attr = el.attributes.find((a) => a.name === 'vln-text')!;
    expect(html.slice(attr.nameStart, attr.nameStart + attr.name.length)).toBe(
      'vln-text',
    );
  });

  it('handles nested tags', () => {
    const html = '<div><span vln-text="x"></span></div>';
    const els = [...scanElements(html)];
    expect(els.map((e) => e.tagName)).toEqual(['div', 'span']);
  });

  it('skips comments', () => {
    const html = '<!-- <div fake="1"> --><div real="1"></div>';
    const els = [...scanElements(html)];
    expect(els).toHaveLength(1);
    expect(els[0].attributes[0].name).toBe('real');
  });

  it('tolerates > inside a quoted attribute value', () => {
    const html = `<div vln-text="a > b" id="ok"></div>`;
    const els = [...scanElements(html)];
    expect(els).toHaveLength(1);
    expect(els[0].attributes.map((a) => a.name)).toEqual(['vln-text', 'id']);
  });

  it('marks self-closing and void elements', () => {
    const html = '<br><img src="x" /><input type="text">';
    const els = [...scanElements(html)];
    expect(els.map((e) => [e.tagName, e.selfClosing])).toEqual([
      ['br', true],
      ['img', true],
      ['input', true],
    ]);
  });

  it('handles kebab-case attribute names (vln-attr:data-id)', () => {
    const html = '<div vln-attr:data-id="row.id"></div>';
    const el = [...scanElements(html)][0];
    expect(el.attributes.map((a) => a.name)).toEqual(['vln-attr:data-id']);
  });
});

describe('findElementAt', () => {
  it('returns the enclosing element for an offset inside its opening tag', () => {
    const html = '<div class="x"><span vln-text="y"></span></div>';
    const spanOffset = html.indexOf('vln-text');
    const el = findElementAt(html, spanOffset);
    expect(el?.tagName).toBe('span');
  });

  it('returns null when offset is before any tag', () => {
    expect(findElementAt('  <div></div>', 0)).toBeNull();
  });

  it('returns the innermost tag when nested', () => {
    // Cursor sits inside the <span> opening tag.
    const html = '<div>\n  <span vln-text="x"></span>\n</div>';
    const off = html.indexOf('vln-text');
    expect(findElementAt(html, off)?.tagName).toBe('span');
  });
});
