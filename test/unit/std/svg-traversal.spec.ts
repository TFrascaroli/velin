import { describe, it, expect, beforeEach } from 'vitest';
import Velin from '../../../src/velin-all';

/**
 * Regression: node traversal used to bail on any non-HTMLElement, so children
 * of an <svg> were never visited. As a result, `vln-attr:points` on a
 * <polyline> never fired — the sparkline in playground/benchmarks/virtual-table.html
 * showed nothing. These tests pin the fixed behavior.
 */
describe('SVG traversal + vln-attr on SVG elements', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('processNode descends into <svg> children', () => {
    container.innerHTML = `
      <svg>
        <polyline vln-attr:points="pts" />
      </svg>
    `;

    Velin.bind(container, { pts: '0,0 10,10 20,5' });

    const polyline = container.querySelector('polyline')!;
    expect(polyline.getAttribute('points')).toBe('0,0 10,10 20,5');
    // A reflect-* breadcrumb proves the plugin actually ran on this node
    // (this is how we know the traversal reached the SVG child, not just
    // that some other code path happened to set the attribute).
    expect(polyline.getAttribute('reflect-vln-attr:points')).toBe('pts');
  });

  it('reactive updates to <polyline points> propagate', () => {
    container.innerHTML = `
      <svg>
        <polyline vln-attr:points="pts" />
      </svg>
    `;

    const state = Velin.bind(container, { pts: '0,0 10,10' }) as { pts: string };
    const polyline = container.querySelector('polyline')!;
    expect(polyline.getAttribute('points')).toBe('0,0 10,10');

    state.pts = '5,5 15,15 25,25';
    expect(polyline.getAttribute('points')).toBe('5,5 15,15 25,25');
  });

  it('vln-attr on <svg> itself (root SVG node) also works', () => {
    // Note: HTML parses attribute names case-insensitively, so we can only
    // set lowercase SVG attributes this way. Case-sensitive SVG attrs like
    // `viewBox` must be authored as literals on the source template.
    container.innerHTML = `
      <div>
        <svg vln-attr:stroke="c"><polyline points="0,0 1,1" /></svg>
      </div>
    `;
    Velin.bind(container, { c: 'red' });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('red');
  });

  it('vln-class on <polyline> writes the class attribute (not .className, which is read-only on SVG)', () => {
    container.innerHTML = `
      <svg>
        <polyline vln-class="hot ? 'spark hot' : 'spark'" points="0,0 1,1" />
      </svg>
    `;
    const state = Velin.bind(container, { hot: false }) as { hot: boolean };
    const polyline = container.querySelector('polyline')!;
    expect(polyline.getAttribute('class')).toBe('spark');

    state.hot = true;
    expect(polyline.getAttribute('class')).toBe('spark hot');
  });
});
