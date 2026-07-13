import { describe, it, expect, beforeEach } from 'vitest';
import Velin from '../../../src/velin-all';

describe('Event object in vln-on', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('should pass event object to handler', () => {
    container.innerHTML = `
      <button vln-on:click="handleClick(event)">Click me</button>
    `;

    let capturedEvent: Event | null = null;
    Velin.bind(container, {
      handleClick(evt: Event) {
        capturedEvent = evt;
      },
    });

    const button = container.querySelector('button')!;
    button.click();

    expect(capturedEvent).toBeTruthy();
    expect(capturedEvent!.type).toBe('click');
    expect(capturedEvent!.target).toBe(button);
  });

  it('should allow calling event.preventDefault()', () => {
    container.innerHTML = `
      <form vln-on:submit="(event.preventDefault(), handleSubmit())">
        <button type="submit">Submit</button>
      </form>
    `;

    let submitCalled = false;
    let preventDefaultCalled = false;

    Velin.bind(container, {
      handleSubmit() {
        submitCalled = true;
      },
    });

    const form = container.querySelector('form')!;
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    const originalPreventDefault = submitEvent.preventDefault.bind(submitEvent);
    submitEvent.preventDefault = function () {
      preventDefaultCalled = true;
      return originalPreventDefault();
    };

    form.dispatchEvent(submitEvent);

    expect(submitCalled).toBe(true);
    expect(preventDefaultCalled).toBe(true);
    expect(submitEvent.defaultPrevented).toBe(true);
  });

  it('should make event available in expression context', () => {
    container.innerHTML = `
      <button vln-on:click="result = event.type">Click me</button>
      <div vln-text="result"></div>
    `;

    const state = Velin.bind(container, { result: '' });

    const button = container.querySelector('button')!;
    button.click();

    expect(state.result).toBe('click');
    expect(container.querySelector('div')!.textContent).toBe('click');
  });
});
