import { describe, it, expect, beforeEach } from 'vitest';
import Velin from '../../../src/velin-all';

/**
 * Keyed vln-loop: `vln-loop:x="{collection, key: 'id'}"` reuses substates by
 * item identity instead of by array position. Reordering the collection
 * moves existing DOM nodes rather than tearing them down.
 */
describe('vln-loop keyed diff', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders keyed items with their fields', () => {
    container.innerHTML = `
      <ul>
        <li vln-loop:row="{collection: rows, key: 'id'}">
          <span vln-text="row.name"></span>
        </li>
      </ul>
    `;
    Velin.bind(container, {
      rows: [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
      ],
    });
    const spans = Array.from(container.querySelectorAll('span')).map(s => s.textContent);
    expect(spans).toEqual(['Alice', 'Bob']);
  });

  it('reorder preserves the same DOM nodes (moved, not recreated)', () => {
    container.innerHTML = `
      <ul>
        <li vln-loop:row="{collection: rows, key: 'id'}">
          <span vln-text="row.name"></span>
        </li>
      </ul>
    `;
    const state = Velin.bind(container, {
      rows: [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
        { id: 'c', name: 'Carol' },
      ],
    }) as { rows: Array<{ id: string; name: string }> };

    // Tag each <li>'s inner <span> with a marker so we can detect if the
    // DOM node survives the reorder.
    const before = Array.from(container.querySelectorAll('li'));
    before.forEach((li, i) => li.setAttribute('data-mark', `mark-${i}`));

    // Reverse the collection.
    state.rows = [state.rows[2], state.rows[1], state.rows[0]];

    const after = Array.from(container.querySelectorAll('li'));
    const textNow = after.map(li => li.querySelector('span')!.textContent);
    expect(textNow).toEqual(['Carol', 'Bob', 'Alice']);

    // The <li> at position 0 now is the original position-2 node — its
    // marker followed the item, proving reuse.
    expect(after[0].getAttribute('data-mark')).toBe('mark-2');
    expect(after[1].getAttribute('data-mark')).toBe('mark-1');
    expect(after[2].getAttribute('data-mark')).toBe('mark-0');
  });

  it('positional (non-keyed) diff rebuilds on reorder — sanity check', () => {
    container.innerHTML = `
      <ul>
        <li vln-loop:row="rows">
          <span vln-text="row.name"></span>
        </li>
      </ul>
    `;
    const state = Velin.bind(container, {
      rows: [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
        { id: 'c', name: 'Carol' },
      ],
    }) as { rows: Array<{ id: string; name: string }> };

    const before = Array.from(container.querySelectorAll('li'));
    before.forEach((li, i) => li.setAttribute('data-mark', `mark-${i}`));

    state.rows = [state.rows[2], state.rows[1], state.rows[0]];

    // Positional diff keeps the DOM nodes at fixed positions and just
    // updates their contents — markers stay put.
    const after = Array.from(container.querySelectorAll('li'));
    expect(after.map(li => li.getAttribute('data-mark'))).toEqual(['mark-0', 'mark-1', 'mark-2']);
    expect(after.map(li => li.querySelector('span')!.textContent)).toEqual(['Carol', 'Bob', 'Alice']);
  });

  it('add + remove work by key', () => {
    container.innerHTML = `
      <ul>
        <li vln-loop:row="{collection: rows, key: 'id'}">
          <span vln-text="row.name"></span>
        </li>
      </ul>
    `;
    const state = Velin.bind(container, {
      rows: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    }) as { rows: Array<{ id: string; name: string }> };

    const originalA = container.querySelectorAll('li')[0];
    originalA.setAttribute('data-mark', 'A');

    // Remove B, add C
    state.rows = [{ id: 'a', name: 'A' }, { id: 'c', name: 'C' }];

    const lis = Array.from(container.querySelectorAll('li'));
    expect(lis.map(li => li.querySelector('span')!.textContent)).toEqual(['A', 'C']);
    // The A node survived — same marked DOM element.
    expect(lis[0].getAttribute('data-mark')).toBe('A');
    // The C node is new — no marker.
    expect(lis[1].getAttribute('data-mark')).toBeNull();
  });

  it('reactive edits on a moved item still update its DOM', () => {
    container.innerHTML = `
      <ul>
        <li vln-loop:row="{collection: rows, key: 'id'}">
          <span vln-text="row.name"></span>
        </li>
      </ul>
    `;
    const state = Velin.bind(container, {
      rows: [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' },
      ],
    }) as { rows: Array<{ id: string; name: string }> };

    // Reverse — Bob now at position 0.
    state.rows = [state.rows[1], state.rows[0]];

    // Mutate the row that's now at position 0 (bob).
    state.rows[0].name = 'Robert';

    const spans = Array.from(container.querySelectorAll('span')).map(s => s.textContent);
    expect(spans).toEqual(['Robert', 'Alice']);
  });

  it('descendant substates (vln-fragment inside a keyed loop) refresh on reorder', () => {
    // Two column-like templates, one keyed cell loop that renders per-item
    // via vln-fragment. On reorder, the fragment survives (same templateId)
    // but the deep expressions inside it must pick up the new item — this
    // used to fail because refreshing only fired the loop iteration's own
    // effects, not the fragment's inner substate.
    document.body.innerHTML = `
      <template id="tpl-shout" vln-vars="c">
        <span vln-text="'!' + c.name"></span>
      </template>
    `;
    container.innerHTML = `
      <div>
        <div vln-loop:col="{collection: cols, key: 'id'}"
             vln-fragment="'tpl-shout'"
             vln-var:c="col"></div>
      </div>
    `;
    const state = Velin.bind(container, {
      cols: [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Bravo' },
      ],
    }) as { cols: Array<{ id: string; name: string }> };

    let texts = Array.from(container.querySelectorAll('span')).map(s => s.textContent);
    expect(texts).toEqual(['!Alpha', '!Bravo']);

    // Reverse
    state.cols = [state.cols[1], state.cols[0]];
    texts = Array.from(container.querySelectorAll('span')).map(s => s.textContent);
    expect(texts).toEqual(['!Bravo', '!Alpha']);
  });

  it('throws when an item lacks the key field', () => {
    container.innerHTML = `
      <ul>
        <li vln-loop:row="{collection: rows, key: 'id'}">
          <span vln-text="row.name"></span>
        </li>
      </ul>
    `;
    expect(() =>
      Velin.bind(container, {
        rows: [{ id: 'a', name: 'A' }, { name: 'B' } as any],
      }),
    ).toThrow(/VLN020/);
  });

  it('throws on duplicate keys', () => {
    container.innerHTML = `
      <ul>
        <li vln-loop:row="{collection: rows, key: 'id'}">
          <span vln-text="row.name"></span>
        </li>
      </ul>
    `;
    expect(() =>
      Velin.bind(container, {
        rows: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }],
      }),
    ).toThrow(/VLN021/);
  });
});
