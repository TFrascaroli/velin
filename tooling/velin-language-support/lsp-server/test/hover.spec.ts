import { describe, expect, it } from 'vitest';
import { findDirectiveMeta } from '@velin/shared';
import { buildDirectiveHoverMarkdown } from '../src/directive-hover';

describe('buildDirectiveHoverMarkdown', () => {
  it('renders name + usage + documentation for a plain directive', () => {
    const meta = findDirectiveMeta('vln-text')!;
    const md = buildDirectiveHoverMarkdown(meta);
    expect(md).toContain('### `vln-text`');
    expect(md).toContain(meta.documentation);
    expect(md).toContain(meta.usage!);
    // No "Removed" banner for a live directive.
    expect(md).not.toMatch(/^\*\*Removed\*\*/);
  });

  it('prepends a Removed banner for deprecated directives', () => {
    const meta = findDirectiveMeta('vln-var')!;
    expect(meta.deprecated).toBe(true);
    const md = buildDirectiveHoverMarkdown(meta);
    expect(md.startsWith('**Removed**')).toBe(true);
    // Migration hint (the documentation text) still gets rendered.
    expect(md).toContain(meta.documentation);
  });

  it('handles missing usage without emitting an empty code fence', () => {
    const md = buildDirectiveHoverMarkdown({
      name: 'vln-nousage',
      documentation: 'no usage line',
    });
    expect(md).not.toContain('```html\n```');
    expect(md).toContain('no usage line');
  });
});
