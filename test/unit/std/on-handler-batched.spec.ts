import { describe, it, expect, beforeEach } from 'vitest';
import Velin from '../../../src/velin-all';

/**
 * A vln-on handler runs its synchronous part inside one batch. Before, a
 * handler inside a vln-if block that hid that block (`this.popover = ""`)
 * tore down its own scope on that write, and every later write in the same
 * handler threw VLN014 as an unhandled rejection; the rest of the handler
 * never ran. Now effects wait until the handler returns.
 */
describe('vln-on handlers are batched', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('a handler that hides its own vln-if block completes', async () => {
    container.innerHTML = `
      <section vln-if="popover === 'confirm'">
        <button id="ok" vln-on:click="confirmDelete()">Delete</button>
      </section>
      <i vln-text="items.length"></i>`;
    const rejections: any[] = [];
    const onRejection = (e: PromiseRejectionEvent) => rejections.push(e.reason);
    window.addEventListener('unhandledrejection', onRejection);

    const state = Velin.bind(container, {
      popover: 'confirm',
      pending: 2,
      items: [1, 2, 3],
      confirmDelete() {
        this.popover = '';                 // hides the section this button lives in
        this.items.splice(this.pending, 1); // used to throw VLN014 here
        this.pending = null;
      },
    }) as any;

    (container.querySelector('#ok') as HTMLButtonElement).click();
    await Promise.resolve();
    window.removeEventListener('unhandledrejection', onRejection);

    expect(rejections).toEqual([]);
    expect(state.items).toEqual([1, 2]);
    expect(state.pending).toBeNull();
    expect(container.querySelector('section')).toBeNull();
    expect(container.querySelector('i')!.textContent).toBe('2');
  });

  it('several writes in one handler render once', () => {
    let renders = 0;
    container.innerHTML = `<button vln-on:click="bump()">go</button><i vln-text="label()"></i>`;
    Velin.bind(container, {
      a: 0, b: 0, c: 0,
      label() { renders++; return `${this.a}${this.b}${this.c}`; },
      bump() { this.a++; this.b++; this.c++; },
    });
    renders = 0;
    container.querySelector('button')!.click();
    expect(renders).toBe(1);
    expect(container.querySelector('i')!.textContent).toBe('111');
  });

  it('writes after an await still run, outside the batch', async () => {
    container.innerHTML = `<button vln-on:click="load()">go</button><i vln-text="status"></i>`;
    Velin.bind(container, {
      status: 'idle',
      async load() { this.status = 'loading'; await Promise.resolve(); this.status = 'done'; },
    });
    container.querySelector('button')!.click();
    expect(container.querySelector('i')!.textContent).toBe('loading');
    await Promise.resolve(); await Promise.resolve();
    expect(container.querySelector('i')!.textContent).toBe('done');
  });

  it('an explicit batch inside the handler still works', () => {
    let renders = 0;
    container.innerHTML = `<button vln-on:click="go()">go</button><i vln-text="n()"></i>`;
    Velin.bind(container, {
      items: [] as number[],
      n() { renders++; return this.items.length; },
      go() { Velin.getController(this).batch(() => { this.items.push(1); this.items.push(2); }); },
    });
    renders = 0;
    container.querySelector('button')!.click();
    expect(renders).toBe(1);
    expect(container.querySelector('i')!.textContent).toBe('2');
  });
});
