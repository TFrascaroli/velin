import Velin from "../../src/velin-core";
import setupVelinStd from "../../src/velin-std.js";
import { describe, it, expect } from "vitest";

setupVelinStd(Velin);

describe("Loop Syntax Debug", () => {
  it("debug: what does 'item in items' actually track?", () => {
    const div = document.createElement('div');
    div.innerHTML = '<span vln-loop="item in items" vln-text="item"></span>';

    Velin.bind(div, {
      items: ['a', 'b', 'c'],
      item: 'outer-value'
    });

    console.log('=== DOM Structure ===');
    console.log('div.innerHTML:', div.innerHTML);
    console.log('div.childNodes:', div.childNodes.length);

    const spans = div.querySelectorAll('span');
    console.log('Total spans found:', spans.length);

    for (let i = 0; i < spans.length; i++) {
      console.log(`  Span ${i}:`, spans[i].textContent, spans[i].outerHTML.substring(0, 100));
    }
  });

  it("debug: what does 'item, idx in items' actually do?", () => {
    const div = document.createElement('div');
    div.innerHTML = '<span vln-loop="item, idx in items" vln-text="idx"></span>';

    Velin.bind(div, {
      items: ['a', 'b', 'c'],
      item: 'outer-value',
      idx: 999
    });

    console.log('=== DOM Structure ===');
    console.log('div.innerHTML:', div.innerHTML);

    const spans = div.querySelectorAll('span');
    console.log('Total spans found:', spans.length);

    for (let i = 0; i < spans.length && i < 5; i++) {
      console.log(`  Span ${i}:`, spans[i].textContent);
    }
  });

  it("correct syntax for comparison", () => {
    const div = document.createElement('div');
    div.innerHTML = '<span vln-loop:item="items" vln-text="item"></span>';

    Velin.bind(div, { items: ['a', 'b', 'c'] });

    console.log('=== Correct Syntax DOM ===');
    console.log('div.innerHTML:', div.innerHTML);

    const spans = div.querySelectorAll('span');
    console.log('Total spans:', spans.length);
    for (let i = 0; i < spans.length; i++) {
      console.log(`  Span ${i}:`, spans[i].textContent);
    }
  });
});
