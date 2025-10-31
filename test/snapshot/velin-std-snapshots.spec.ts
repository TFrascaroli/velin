import { describe, it, expect } from 'vitest'
import Velin from '../../src/velin-core.js'
import setupVelinStd from '../../src/velin-std.js';
setupVelinStd(Velin);


describe('text binding', () => {
  it('renders bound text', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'vln.message')

    Velin.bind(div, { message: 'hello world' })

    expect(div).toMatchSnapshot()
  });

  it('renders text with expression', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'vln.count + 1')

    Velin.bind(div, { count: 5 })

    expect(div).toMatchSnapshot()
  });

  it('renders text with ternary', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'vln.isActive ? "Active" : "Inactive"')

    Velin.bind(div, { isActive: true })

    expect(div).toMatchSnapshot()
  });
});

describe('loops', () => {
  it('renders simple loop', () => {
    const div = document.createElement('div')
    div.innerHTML = '<span vln-loop="item in vln.items" vln-text="vln.item"></span>'

    Velin.bind(div, { items: ['a', 'b', 'c'] })

    expect(div).toMatchSnapshot()
  });

  it('renders loop with index', () => {
    const div = document.createElement('div')
    div.innerHTML = '<span vln-loop="item, idx in vln.items" vln-text="vln.idx + \": \" + vln.item"></span>'

    Velin.bind(div, { items: ['first', 'second', 'third'] })

    expect(div).toMatchSnapshot()
  });

  it('renders nested loops', () => {
    const div = document.createElement('div')
    div.innerHTML = `
      <div vln-loop="group in vln.groups">
        <span vln-loop="item in vln.group.items" vln-text="vln.item"></span>
      </div>
    `

    Velin.bind(div, {
      groups: [
        { items: ['a1', 'a2'] },
        { items: ['b1', 'b2'] }
      ]
    })

    expect(div).toMatchSnapshot()
  });
});

describe('conditionals', () => {
  it('renders when condition is true', () => {
    const div = document.createElement('div')
    div.innerHTML = '<span vln-if="vln.show" vln-text="vln.message"></span>'

    Velin.bind(div, { show: true, message: 'visible' })

    expect(div).toMatchSnapshot()
  });

  it('hides when condition is false', () => {
    const div = document.createElement('div')
    div.innerHTML = '<span vln-if="vln.show" vln-text="vln.message"></span>'

    Velin.bind(div, { show: false, message: 'hidden' })

    expect(div).toMatchSnapshot()
  });

  it('renders complex condition', () => {
    const div = document.createElement('div')
    div.innerHTML = '<span vln-if="vln.count > 5 && vln.enabled" vln-text="vln.message"></span>'

    Velin.bind(div, { count: 10, enabled: true, message: 'shown' })

    expect(div).toMatchSnapshot()
  });
});

describe('class binding', () => {
  it('binds single class', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-class', 'vln.className')

    Velin.bind(div, { className: 'active' })

    expect(div).toMatchSnapshot()
  });

  it('binds class object', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-class', '{ active: vln.isActive, disabled: !vln.isEnabled }')

    Velin.bind(div, { isActive: true, isEnabled: false })

    expect(div).toMatchSnapshot()
  });

  it('binds multiple classes with expressions', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-class', '{ selected: vln.index === vln.current, highlight: vln.priority > 5 }')

    Velin.bind(div, { index: 2, current: 2, priority: 8 })

    expect(div).toMatchSnapshot()
  });
});

describe('attribute binding', () => {
  it('binds attribute value', () => {
    const input = document.createElement('input')
    input.setAttribute('vln-attr:value', 'vln.text')

    Velin.bind(input, { text: 'hello' })

    expect(input).toMatchSnapshot()
  });

  it('binds multiple attributes', () => {
    const input = document.createElement('input')
    input.setAttribute('vln-attr:value', 'vln.text')
    input.setAttribute('vln-attr:placeholder', 'vln.hint')
    input.setAttribute('vln-attr:disabled', 'vln.isDisabled')

    Velin.bind(input, { text: 'value', hint: 'Enter text', isDisabled: true })

    expect(input).toMatchSnapshot()
  });
});

describe('event handling', () => {
  it('binds click event', () => {
    const button = document.createElement('button')
    button.setAttribute('vln-on:click', 'vln.handleClick')
    button.textContent = 'Click me'

    Velin.bind(button, { handleClick: () => {} })

    expect(button).toMatchSnapshot()
  });
});

describe('vln-less expressions', () => {
  it('renders text without vln prefix', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'message')

    Velin.bind(div, { message: 'hello world' })

    expect(div).toMatchSnapshot()
  });

  it('renders expression without vln prefix', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'count + 1')

    Velin.bind(div, { count: 5 })

    expect(div).toMatchSnapshot()
  });

  it('renders ternary without vln prefix', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'isActive ? "Active" : "Inactive"')

    Velin.bind(div, { isActive: true })

    expect(div).toMatchSnapshot()
  });

  it('binds class object without vln prefix', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-class', '{ active: isActive, disabled: !isEnabled }')

    Velin.bind(div, { isActive: true, isEnabled: false })

    expect(div).toMatchSnapshot()
  });

  it('renders loop without vln prefix', () => {
    const div = document.createElement('div')
    div.innerHTML = '<span vln-loop="item in items" vln-text="item"></span>'

    Velin.bind(div, { items: ['a', 'b', 'c'] })

    expect(div).toMatchSnapshot()
  });

  it('supports mixed vln and no-vln in same expression', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'vln.count + count')

    Velin.bind(div, { count: 5 })

    expect(div).toMatchSnapshot()
  });
});

describe('complex expressions', () => {
  it('evaluates arithmetic', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', '(vln.a + vln.b) * vln.c')

    Velin.bind(div, { a: 2, b: 3, c: 4 })

    expect(div).toMatchSnapshot()
  });

  it('evaluates logical expressions', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'vln.isActive && vln.isEnabled ? "Yes" : "No"')

    Velin.bind(div, { isActive: true, isEnabled: false })

    expect(div).toMatchSnapshot()
  });

  it('calls methods with arguments', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'vln.format(vln.value, 2)')

    Velin.bind(div, {
      value: 3.14159,
      format: (n, decimals) => n.toFixed(decimals)
    })

    expect(div).toMatchSnapshot()
  });

  it('accesses nested properties', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'vln.user.profile.name')

    Velin.bind(div, {
      user: {
        profile: {
          name: 'John Doe'
        }
      }
    })

    expect(div).toMatchSnapshot()
  });

  it('uses array indexing', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'vln.items[1]')

    Velin.bind(div, { items: ['first', 'second', 'third'] })

    expect(div).toMatchSnapshot()
  });
});
