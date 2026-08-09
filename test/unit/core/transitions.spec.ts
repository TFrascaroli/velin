import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Velin from '../../../src/velin-all';

/**
 * jsdom quirk: computed style reflects `transition-duration` only when the
 * property is set through a `style` attribute (or full CSS text), not via
 * `el.style.transitionDuration = ...`. Tests here set the property through
 * `setAttribute('style', ...)` or an inline `style="..."` fragment.
 * `el.style.animationDuration = ...` DOES round-trip through
 * getComputedStyle in jsdom — inconsistent but not our bug.
 */

const withTransition = (el: HTMLElement, css: string) => {
  el.setAttribute('style', css);
  return el;
};

const T = () => Velin.transitions!;

describe('Velin.transitions', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('awaitLeave', () => {
    it('calls done synchronously when the node has no transition', () => {
      const el = document.createElement('div');
      container.appendChild(el);
      const done = vi.fn();

      T().awaitLeave(el, done);

      expect(done).toHaveBeenCalledTimes(1);
    });

    it('calls done synchronously for non-Elements', () => {
      const text = document.createTextNode('hi');
      container.appendChild(text);
      const done = vi.fn();

      T().awaitLeave(text as unknown as Element, done);

      expect(done).toHaveBeenCalledTimes(1);
    });

    it('calls done synchronously when the node is detached', () => {
      const el = withTransition(document.createElement('div'), 'transition-duration: 200ms');
      const done = vi.fn();

      T().awaitLeave(el, done);

      expect(done).toHaveBeenCalledTimes(1);
    });

    it('holds the node until the CSS duration + 50 ms slack elapses', () => {
      vi.useFakeTimers();
      try {
        const el = withTransition(document.createElement('div'), 'transition-duration: 200ms');
        container.appendChild(el);
        const done = vi.fn(() => el.remove());

        T().awaitLeave(el, done);

        expect(done).not.toHaveBeenCalled();
        expect(el.classList.contains('vln-leaving')).toBe(true);
        expect(el.isConnected).toBe(true);

        vi.advanceTimersByTime(249);
        expect(done).not.toHaveBeenCalled();

        vi.advanceTimersByTime(2);
        expect(done).toHaveBeenCalledTimes(1);
        expect(el.isConnected).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('waits for the LONGER of multiple transition properties', () => {
      vi.useFakeTimers();
      try {
        const el = withTransition(document.createElement('div'), 'transition-duration: 200ms, 400ms');
        container.appendChild(el);
        const done = vi.fn();

        T().awaitLeave(el, done);

        // 200ms + slack: not yet — the second property is still animating.
        vi.advanceTimersByTime(300);
        expect(done).not.toHaveBeenCalled();

        vi.advanceTimersByTime(200); // total 500 > 400 + 50
        expect(done).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns a cancel handle that aborts before completion', () => {
      vi.useFakeTimers();
      try {
        const el = withTransition(document.createElement('div'), 'transition-duration: 200ms');
        container.appendChild(el);
        const done = vi.fn();

        const handle = T().awaitLeave(el, done);
        expect(el.classList.contains('vln-leaving')).toBe(true);

        handle.cancel();

        // Class stripped, timer cleared, done never fires.
        expect(el.classList.contains('vln-leaving')).toBe(false);
        expect(el.hasAttribute('class')).toBe(false);
        vi.advanceTimersByTime(500);
        expect(done).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('cancel is idempotent after natural completion', () => {
      vi.useFakeTimers();
      try {
        const el = withTransition(document.createElement('div'), 'transition-duration: 100ms');
        container.appendChild(el);
        const done = vi.fn();

        const handle = T().awaitLeave(el, done);
        vi.advanceTimersByTime(200);
        expect(done).toHaveBeenCalledTimes(1);

        // Late cancel: no-op, done was already fired.
        expect(() => handle.cancel()).not.toThrow();
        expect(done).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('waits for animation duration when there is no transition', () => {
      vi.useFakeTimers();
      try {
        const el = document.createElement('div');
        el.style.animationDuration = '300ms';
        container.appendChild(el);
        const done = vi.fn();

        T().awaitLeave(el, done);

        vi.advanceTimersByTime(200);
        expect(done).not.toHaveBeenCalled();

        vi.advanceTimersByTime(200);
        expect(done).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('markEnter', () => {
    it('adds and synchronously strips vln-entering when there is no transition', () => {
      const el = document.createElement('div');
      container.appendChild(el);

      T().markEnter(el);

      expect(el.classList.contains('vln-entering')).toBe(false);
    });

    it('does not leave an empty class="" attribute behind', () => {
      const el = document.createElement('div');
      container.appendChild(el);

      T().markEnter(el);

      expect(el.hasAttribute('class')).toBe(false);
    });

    it('preserves other classes when stripping vln-entering', () => {
      const el = document.createElement('div');
      el.className = 'card';
      container.appendChild(el);

      T().markEnter(el);

      expect(el.className).toBe('card');
    });

    it('holds vln-entering for two rAF when a transition is present', async () => {
      const el = withTransition(document.createElement('div'), 'transition-duration: 200ms');
      container.appendChild(el);

      T().markEnter(el);
      expect(el.classList.contains('vln-entering')).toBe(true);

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      expect(el.classList.contains('vln-entering')).toBe(false);
    });

    it('ignores non-Elements', () => {
      const text = document.createTextNode('hi');
      expect(() => T().markEnter(text as unknown as Element)).not.toThrow();
    });
  });

  describe('vln-if integration', () => {
    it('holds the leaving element in the DOM until the timeout elapses', () => {
      vi.useFakeTimers();
      try {
        container.innerHTML = `<span vln-if="show" style="transition-duration: 200ms">x</span>`;
        const state = Velin.bind(container, { show: true });
        const span = container.querySelector('span')!;

        state.show = false;

        expect(span.isConnected).toBe(true);
        expect(span.classList.contains('vln-leaving')).toBe(true);

        vi.advanceTimersByTime(300);
        expect(span.isConnected).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('removes synchronously when there is no CSS transition', () => {
      container.innerHTML = `<span vln-if="show">x</span>`;
      const state = Velin.bind(container, { show: true });
      const span = container.querySelector('span')!;

      state.show = false;

      expect(span.isConnected).toBe(false);
      expect(container.querySelector('span')).toBeNull();
    });

    it('cancels the leave and revives the same node on fast re-toggle', () => {
      vi.useFakeTimers();
      try {
        container.innerHTML = `<span vln-if="show" style="transition-duration: 200ms">x</span>`;
        const state = Velin.bind(container, { show: true });
        const first = container.querySelector('span')!;

        state.show = false;
        expect(first.classList.contains('vln-leaving')).toBe(true);
        expect(first.isConnected).toBe(true);

        state.show = true;
        // Only ONE span in the DOM — the revived one, same node as `first`.
        const spans = container.querySelectorAll('span');
        expect(spans.length).toBe(1);
        expect(spans[0]).toBe(first);
        // vln-leaving was stripped by cancel; CSS transition reverses to natural state.
        expect(first.classList.contains('vln-leaving')).toBe(false);

        // Advance past the (canceled) timeout — node must still be present.
        vi.advanceTimersByTime(500);
        expect(container.querySelectorAll('span').length).toBe(1);
        expect(first.isConnected).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('preserves reactivity on the revived node', () => {
      vi.useFakeTimers();
      try {
        container.innerHTML = `<span vln-if="show" vln-text="msg" style="transition-duration: 200ms"></span>`;
        const state = Velin.bind(container, { show: true, msg: 'hello' });
        const first = container.querySelector('span')!;
        expect(first.textContent).toBe('hello');

        state.show = false;
        state.show = true;
        // Same node revived — updating state should still flow through.
        state.msg = 'world';
        expect(first.textContent).toBe('world');
        expect(container.querySelector('span')).toBe(first);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('vln-fragment integration', () => {
    it('defers the new template mount until the old one finishes leaving (out-in)', () => {
      vi.useFakeTimers();
      try {
        container.innerHTML = `
          <template vln-template="'a'">
            <p class="tpl-a" style="transition-duration: 200ms">A</p>
          </template>
          <template vln-template="'b'">
            <p class="tpl-b" style="transition-duration: 200ms">B</p>
          </template>
          <div id="host" vln-fragment="which"></div>
        `;
        const state = Velin.bind(container, { which: 'a' });

        const host = container.querySelector('#host')!;
        const firstA = host.querySelector('.tpl-a')!;
        expect(firstA).not.toBeNull();

        state.which = 'b';

        // A is leaving; B is NOT yet in the DOM.
        expect(host.querySelector('.tpl-a')).toBe(firstA);
        expect(firstA.classList.contains('vln-leaving')).toBe(true);
        expect(host.querySelector('.tpl-b')).toBeNull();

        // After A finishes leaving, B mounts.
        vi.advanceTimersByTime(300);
        expect(host.querySelector('.tpl-a')).toBeNull();
        expect(host.querySelector('.tpl-b')).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not animate the first render (inlet <template> wrappers just clear)', () => {
      container.innerHTML = `
        <template vln-template="'card'">
          <div class="card-body">hello</div>
        </template>
        <div id="host" vln-fragment="'card'"></div>
      `;
      Velin.bind(container, {});

      const host = container.querySelector('#host')!;
      expect(host.querySelector('.card-body')).not.toBeNull();
      expect(host.querySelector('.vln-leaving')).toBeNull();
    });

    it('reverting to the leaving template cancels the leave and revives it', () => {
      vi.useFakeTimers();
      try {
        container.innerHTML = `
          <template vln-template="'a'">
            <p class="tpl-a" style="transition-duration: 200ms">A</p>
          </template>
          <template vln-template="'b'">
            <p class="tpl-b" style="transition-duration: 200ms">B</p>
          </template>
          <div id="host" vln-fragment="which"></div>
        `;
        const state = Velin.bind(container, { which: 'a' });
        const host = container.querySelector('#host')!;
        const firstA = host.querySelector('.tpl-a')!;

        state.which = 'b'; // A starts leaving, B pending
        expect(firstA.classList.contains('vln-leaving')).toBe(true);
        expect(host.querySelector('.tpl-b')).toBeNull();

        state.which = 'a'; // revive
        expect(firstA.classList.contains('vln-leaving')).toBe(false);
        expect(host.querySelector('.tpl-a')).toBe(firstA);
        expect(host.querySelector('.tpl-b')).toBeNull();

        // The old timeout should be a no-op.
        vi.advanceTimersByTime(500);
        expect(host.querySelector('.tpl-a')).toBe(firstA);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('vln-loop integration', () => {
    it('holds removed items until their leave transition ends', () => {
      vi.useFakeTimers();
      try {
        container.innerHTML = `<li vln-loop:item="items" vln-text="item" style="transition-duration: 200ms"></li>`;
        const state = Velin.bind(container, { items: ['a', 'b', 'c'] });

        expect(Array.from(container.querySelectorAll('li')).map(el => el.textContent)).toEqual(['a', 'b', 'c']);

        state.items = ['a'];

        const after = Array.from(container.querySelectorAll('li'));
        expect(after.length).toBe(3);
        expect(after.filter(el => el.classList.contains('vln-leaving')).length).toBe(2);

        vi.advanceTimersByTime(300);
        expect(container.querySelectorAll('li').length).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('keyed middle-remove animates the actual row in its original slot (no shift-to-tail)', () => {
      vi.useFakeTimers();
      try {
        container.innerHTML = `<li vln-loop:row="{collection: rows, key: 'id'}" vln-text="row.label" style="transition-duration: 200ms"></li>`;
        const state = Velin.bind(container, {
          rows: [
            { id: 1, label: 'A' },
            { id: 2, label: 'B' },
            { id: 3, label: 'C' },
            { id: 4, label: 'D' },
          ],
        });

        const before = Array.from(container.querySelectorAll('li'));
        expect(before.map(li => li.textContent)).toEqual(['A', 'B', 'C', 'D']);
        const nA = before[0], nB = before[1], nC = before[2], nD = before[3];

        // Remove the middle-ish item (id=2, 'B').
        state.rows = [
          { id: 1, label: 'A' },
          { id: 3, label: 'C' },
          { id: 4, label: 'D' },
        ];

        // Node identity is preserved for survivors.
        const after = Array.from(container.querySelectorAll('li'));
        expect(after.length).toBe(4); // 3 survivors + 1 leaving
        expect(after[0]).toBe(nA);
        // The leaving node stays exactly where it was — between A and C.
        expect(after[1]).toBe(nB);
        expect(nB.classList.contains('vln-leaving')).toBe(true);
        expect(after[2]).toBe(nC);
        expect(after[3]).toBe(nD);

        // Survivors were NOT moved.
        expect(nC.classList.contains('vln-leaving')).toBe(false);
        expect(nD.classList.contains('vln-leaving')).toBe(false);

        vi.advanceTimersByTime(300);
        expect(container.querySelectorAll('li').length).toBe(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it('fast-forwards pending leaves when a new render fires mid-animation', () => {
      vi.useFakeTimers();
      try {
        container.innerHTML = `<li vln-loop:item="items" vln-text="item" style="transition-duration: 200ms"></li>`;
        const state = Velin.bind(container, { items: ['a', 'b', 'c', 'd'] });
        expect(container.querySelectorAll('li').length).toBe(4);

        // First shrink — two items start leaving.
        state.items = ['a', 'b'];
        expect(container.querySelectorAll('li.vln-leaving').length).toBe(2);
        expect(container.querySelectorAll('li').length).toBe(4);

        // Second shrink BEFORE the first leave finishes — the two ghosts
        // must be FF'd, not accumulated on top of a new pair of ghosts.
        state.items = ['a'];
        const nowLeaving = container.querySelectorAll('li.vln-leaving');
        expect(nowLeaving.length).toBe(1); // only the freshly-removed one
        expect(container.querySelectorAll('li').length).toBe(2); // 1 live + 1 leaving

        vi.advanceTimersByTime(300);
        expect(container.querySelectorAll('li').length).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('vln-route integration', () => {
    let originalHash: string;
    beforeEach(() => {
      originalHash = window.location.hash;
    });
    afterEach(() => {
      window.location.hash = originalHash;
    });

    const setHash = (h: string) => {
      window.location.hash = h;
      window.dispatchEvent(new Event('hashchange'));
    };

    it('defers new-route mount until sibling leave completes (out-in, forward direction)', () => {
      vi.useFakeTimers();
      try {
        setHash('#/txr/home');
        container.innerHTML = `
          <section vln-router="txr">
            <div vln-route="'/txr/home'" class="tp home" style="transition-duration: 200ms">home</div>
            <div vln-route="'/txr/about'" class="tp about" style="transition-duration: 200ms">about</div>
          </section>
        `;
        Velin.bind(container, {});
        expect(container.querySelector('.home')).not.toBeNull();
        expect(container.querySelector('.about')).toBeNull();

        setHash('#/txr/about');
        // Home should be leaving, about should NOT be mounted yet.
        expect(container.querySelector('.home')?.classList.contains('vln-leaving')).toBe(true);
        expect(container.querySelector('.about')).toBeNull();

        vi.advanceTimersByTime(300);
        // Home is gone, about mounts.
        expect(container.querySelector('.home')).toBeNull();
        expect(container.querySelector('.about')).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('out-in also works in the reverse direction (later-DOM-order route leaving)', async () => {
      // This is the DOM-order-race case: the earlier-registered route's
      // effect fires FIRST and wants to mount, but its sibling — which
      // hasn't fired yet — is about to leave. Detected via mountedCount.
      vi.useFakeTimers();
      try {
        setHash('#/txr/about');
        container.innerHTML = `
          <section vln-router="txr">
            <div vln-route="'/txr/home'" class="tp home" style="transition-duration: 200ms">home</div>
            <div vln-route="'/txr/about'" class="tp about" style="transition-duration: 200ms">about</div>
          </section>
        `;
        Velin.bind(container, {});
        expect(container.querySelector('.about')).not.toBeNull();
        expect(container.querySelector('.home')).toBeNull();

        setHash('#/txr/home');
        // About should be leaving. Home's mount was deferred to a
        // microtask — still not in the DOM.
        expect(container.querySelector('.about')?.classList.contains('vln-leaving')).toBe(true);
        expect(container.querySelector('.home')).toBeNull();

        // Flush the microtask trampoline; Home should still be pending
        // because About is leaving.
        await Promise.resolve();
        expect(container.querySelector('.home')).toBeNull();

        vi.advanceTimersByTime(300);
        expect(container.querySelector('.about')).toBeNull();
        expect(container.querySelector('.home')).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('nav-back to leaving route revives + drops the queued sibling mount as stale', () => {
      vi.useFakeTimers();
      try {
        setHash('#/txr/home');
        container.innerHTML = `
          <section vln-router="txr">
            <div vln-route="'/txr/home'" class="tp home" style="transition-duration: 200ms">home</div>
            <div vln-route="'/txr/about'" class="tp about" style="transition-duration: 200ms">about</div>
          </section>
        `;
        Velin.bind(container, {});
        const firstHome = container.querySelector('.home')!;

        setHash('#/txr/about'); // Home leaving, About queued
        expect(firstHome.classList.contains('vln-leaving')).toBe(true);

        setHash('#/txr/home'); // revive Home, About's queued mount goes stale
        expect(firstHome.classList.contains('vln-leaving')).toBe(false);
        expect(container.querySelector('.home')).toBe(firstHome);
        expect(container.querySelector('.about')).toBeNull();

        // The (canceled) leave timeout is a no-op; queued About mount also
        // no-ops on stale-path check when the drain fires.
        vi.advanceTimersByTime(500);
        expect(container.querySelector('.home')).toBe(firstHome);
        expect(container.querySelector('.about')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('vln-fragment pending updates', () => {
    it('collapses rapid successive swaps to the latest pending target', () => {
      vi.useFakeTimers();
      try {
        container.innerHTML = `
          <template vln-template="'a'">
            <p class="tpl-a" style="transition-duration: 200ms">A</p>
          </template>
          <template vln-template="'b'">
            <p class="tpl-b" style="transition-duration: 200ms">B</p>
          </template>
          <template vln-template="'c'">
            <p class="tpl-c" style="transition-duration: 200ms">C</p>
          </template>
          <div id="host" vln-fragment="which"></div>
        `;
        const state = Velin.bind(container, { which: 'a' });
        const host = container.querySelector('#host')!;
        const firstA = host.querySelector('.tpl-a')!;

        state.which = 'b'; // A starts leaving, B pending
        expect(firstA.classList.contains('vln-leaving')).toBe(true);
        expect(host.querySelector('.tpl-b')).toBeNull();

        state.which = 'c'; // pending updated to C; A still leaving; B never mounted
        expect(host.querySelector('.tpl-a')).toBe(firstA);
        expect(host.querySelector('.tpl-b')).toBeNull();
        expect(host.querySelector('.tpl-c')).toBeNull();

        vi.advanceTimersByTime(300); // A finishes leaving
        expect(host.querySelector('.tpl-a')).toBeNull();
        expect(host.querySelector('.tpl-b')).toBeNull(); // skipped
        expect(host.querySelector('.tpl-c')).not.toBeNull(); // mounted
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
