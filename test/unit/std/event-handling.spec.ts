import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Event object in vln-on', () => {
  let dom;
  let window;
  let document;
  let Velin;

  beforeEach(() => {
    // Load the built velin.js
    const velinCode = fs.readFileSync(
      path.join(process.cwd(), 'playground', 'velin.js'),
      'utf-8'
    );

    // Create a new JSDOM instance
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      runScripts: 'dangerously',
    });
    window = dom.window;
    document = window.document;

    // Execute Velin code in the JSDOM context
    const scriptEl = document.createElement('script');
    scriptEl.textContent = velinCode;
    document.head.appendChild(scriptEl);

    Velin = window.Velin;
  });

  it('should pass event object to handler', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button vln-on:click="handleClick(event)">Click me</button>
    `;
    document.body.appendChild(container);

    let capturedEvent = null;
    const state = Velin.bind(container, {
      handleClick(evt) {
        capturedEvent = evt;
      }
    });

    const button = container.querySelector('button');
    button.click();

    expect(capturedEvent).toBeTruthy();
    expect(capturedEvent.type).toBe('click');
    expect(capturedEvent.target).toBe(button);
  });

  it('should allow calling event.preventDefault()', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <form vln-on:submit="(event.preventDefault(), handleSubmit())">
        <button type="submit">Submit</button>
      </form>
    `;
    document.body.appendChild(container);

    let submitCalled = false;
    let preventDefaultCalled = false;

    const state = Velin.bind(container, {
      handleSubmit() {
        submitCalled = true;
      }
    });

    const form = container.querySelector('form');

    // Create a submit event with preventDefault tracking
    const submitEvent = new window.Event('submit', { bubbles: true, cancelable: true });
    const originalPreventDefault = submitEvent.preventDefault.bind(submitEvent);
    submitEvent.preventDefault = function() {
      preventDefaultCalled = true;
      return originalPreventDefault();
    };

    form.dispatchEvent(submitEvent);

    expect(submitCalled).toBe(true);
    expect(preventDefaultCalled).toBe(true);
    expect(submitEvent.defaultPrevented).toBe(true);
  });

  it('should make event available in expression context', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button vln-on:click="result = event.type">Click me</button>
      <div vln-text="result"></div>
    `;
    document.body.appendChild(container);

    const state = Velin.bind(container, {
      result: ''
    });

    const button = container.querySelector('button');
    button.click();

    expect(state.result).toBe('click');
    expect(container.querySelector('div').textContent).toBe('click');
  });
});
