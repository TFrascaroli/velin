/**
 * Renders the markdown block shown in the hover tooltip for a `vln-*`
 * attribute. Kept separate from server.ts so it can be unit-tested
 * without importing the LSP connection module (which grabs stdin at
 * top-level).
 */
export function buildDirectiveHoverMarkdown(meta: {
  name: string;
  usage?: string;
  documentation: string;
  deprecated?: boolean;
}): string {
  const lines: string[] = [];
  if (meta.deprecated) {
    lines.push('**Removed** — this directive no longer works at runtime.', '');
  }
  lines.push(`### \`${meta.name}\``);
  if (meta.usage) lines.push('', '```html', meta.usage, '```');
  lines.push('', meta.documentation);
  return lines.join('\n');
}
