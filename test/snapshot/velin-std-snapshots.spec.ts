import { describe, it, expect } from 'vitest'
import Velin from '../../src/velin-core.js'
import setupVelinStd from '../../src/velin-std.js';
setupVelinStd(Velin);


describe('bind', () => {
  it('renders bound text', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'vln.message')

    Velin.bind(div, { message: 'hello world' })

    expect(div).toMatchSnapshot()
  });

  it('renders loop', () => {
    const div = document.createElement('div')
    div.setAttribute('vln-text', 'vln.message')

    Velin.bind(div, { message: 'hello world' })

    expect(div).toMatchSnapshot()
  });
});
