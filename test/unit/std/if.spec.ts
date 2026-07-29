import { describe, it, expect, beforeEach } from 'vitest';
import Velin from '../../../src/velin-all';

describe('vln-if', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  const placeholderCount = (root: Element) => {
    let n = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) if (walker.currentNode.nodeValue === 'vln-if') n++;
    return n;
  };

  it('mounts when truthy and leaves a placeholder for the anchor', () => {
    container.innerHTML = `<span vln-if="show" vln-text="msg"></span>`;

    Velin.bind(container, { show: true, msg: 'hello' });

    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span!.textContent).toBe('hello');
    expect(placeholderCount(container)).toBe(1);
  });

  it('does not mount when falsy — only the placeholder remains', () => {
    container.innerHTML = `<span vln-if="show" vln-text="msg"></span>`;

    Velin.bind(container, { show: false, msg: 'hello' });

    expect(container.querySelector('span')).toBeNull();
    expect(placeholderCount(container)).toBe(1);
  });

  it('unmounts on true → false and remounts on false → true', () => {
    container.innerHTML = `<span vln-if="show">content</span>`;

    const state = Velin.bind(container, { show: true });

    expect(container.querySelector('span')).not.toBeNull();

    state.show = false;
    expect(container.querySelector('span')).toBeNull();
    expect(placeholderCount(container)).toBe(1);

    state.show = true;
    expect(container.querySelector('span')).not.toBeNull();
    expect(placeholderCount(container)).toBe(1);
  });

  it('re-inserts the element at the anchor between siblings', () => {
    container.innerHTML = `
      <p id="before">before</p>
      <span vln-if="show">middle</span>
      <p id="after">after</p>
    `;

    const state = Velin.bind(container, { show: true });

    const before = container.querySelector('#before')!;
    const after = container.querySelector('#after')!;

    state.show = false;
    // Placeholder sits between `before` and `after`.
    let node = before.nextSibling;
    while (node && node.nodeType === Node.TEXT_NODE) node = node.nextSibling;
    expect(node!.nodeType).toBe(Node.COMMENT_NODE);
    expect(node!.nodeValue).toBe('vln-if');

    state.show = true;
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    // Span was inserted before the placeholder, which itself sits before `after`.
    expect(span!.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(before.compareDocumentPosition(span!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps updating the mounted subtree reactively', () => {
    container.innerHTML = `<span vln-if="show" vln-text="msg"></span>`;

    const state = Velin.bind(container, { show: true, msg: 'a' });

    expect(container.querySelector('span')!.textContent).toBe('a');
    state.msg = 'b';
    expect(container.querySelector('span')!.textContent).toBe('b');
  });

  it('does not update the (now-detached) subtree after unmount', () => {
    container.innerHTML = `<span vln-if="show" vln-text="msg"></span>`;

    const state = Velin.bind(container, { show: true, msg: 'a' });
    const spanBefore = container.querySelector('span')!;

    state.show = false;
    // The detached node holds whatever it last had; changing the source
    // must not touch it (and must not throw).
    state.msg = 'b';
    expect(spanBefore.textContent).toBe('a');
    expect(container.querySelector('span')).toBeNull();
  });

  it('tears down inner watchers on unmount', () => {
    container.innerHTML = `
      <div vln-if="show">
        <div vln-watch:onchange="count"></div>
      </div>
    `;

    const seen: number[] = [];
    const state = Velin.bind(container, {
      show: true,
      count: 0,
      onchange(n: number) { seen.push(n); },
    });

    expect(seen).toEqual([0]);

    state.count = 1;
    expect(seen).toEqual([0, 1]);

    state.show = false;
    // Watcher subtree was cleaned up — further changes must not fire it.
    state.count = 2;
    expect(seen).toEqual([0, 1]);

    // Remount re-registers the watcher (fresh initial fire).
    state.show = true;
    expect(seen).toEqual([0, 1, 2]);

    state.count = 3;
    expect(seen).toEqual([0, 1, 2, 3]);
  });

  it('unmounts nested vln-if together with its parent', () => {
    container.innerHTML = `
      <section vln-if="outer">
        <span vln-if="inner" id="leaf">leaf</span>
      </section>
    `;

    const state = Velin.bind(container, { outer: true, inner: true });

    expect(container.querySelector('#leaf')).not.toBeNull();

    state.outer = false;
    expect(container.querySelector('section')).toBeNull();
    expect(container.querySelector('#leaf')).toBeNull();

    // Flipping the inner condition while the outer subtree is gone
    // must not resurrect anything (or throw).
    state.inner = false;
    expect(container.querySelector('#leaf')).toBeNull();

    // Remount rebuilds the nested tree honoring the current inner value.
    state.outer = true;
    expect(container.querySelector('section')).not.toBeNull();
    expect(container.querySelector('#leaf')).toBeNull();

    state.inner = true;
    expect(container.querySelector('#leaf')).not.toBeNull();
  });

  it('does not preserve DOM-local state across a toggle', () => {
    // Documented behavior: unmount blows away the element, so an
    // uncontrolled <input>'s typed value is not retained on remount.
    container.innerHTML = `<input vln-if="show" type="text" />`;

    const state = Velin.bind(container, { show: true });

    const input1 = container.querySelector('input')!;
    input1.value = 'typed';
    expect(input1.value).toBe('typed');

    state.show = false;
    state.show = true;

    const input2 = container.querySelector('input')!;
    expect(input2).not.toBe(input1);
    expect(input2.value).toBe('');
  });

  it('short-circuits vln-loop on the same element when falsy', () => {
    container.innerHTML = `<li vln-if="show" vln-loop:item="items" vln-text="item"></li>`;

    const state = Velin.bind(container, { show: false, items: ['a', 'b', 'c'] });

    // No <li> should be rendered at all when the guard is false.
    expect(container.querySelectorAll('li').length).toBe(0);

    state.show = true;
    expect(container.querySelectorAll('li').length).toBe(3);

    state.show = false;
    expect(container.querySelectorAll('li').length).toBe(0);
  });
});
