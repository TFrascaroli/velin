/**
 * Minimal tag-and-attribute scanner. Not a full HTML parser — just enough
 * to answer two questions:
 *   1. Given an offset, which element (tag name + attribute names) surrounds it?
 *   2. Iterate every opening tag together with its attributes and offsets.
 *
 * Intentionally regex-based; correctness assumptions:
 *   - Attribute values may contain `>` if they're quoted.
 *   - Angle brackets inside JS expressions inside attribute values are legal
 *     iff the enclosing quote is matched.
 *   - Comments <!-- ... --> and CDATA are skipped.
 */

export interface ScannedAttribute {
  name: string;
  /** Offset of the attribute name's first character in the document. */
  nameStart: number;
}

export interface ScannedElement {
  tagName: string;
  /** Offset of the `<` that opens this tag. */
  start: number;
  /** Offset of the `>` that ends the opening tag (exclusive). */
  openEnd: number;
  attributes: ScannedAttribute[];
  /** True for `<tag ... />` (self-closing) tags. */
  selfClosing: boolean;
}

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/**
 * Yield every opening tag in the document with its attribute names. Comments
 * and script/style bodies are skipped.
 */
export function* scanElements(text: string): Generator<ScannedElement> {
  let i = 0;
  while (i < text.length) {
    // Skip comments.
    if (text.startsWith('<!--', i)) {
      const close = text.indexOf('-->', i + 4);
      i = close === -1 ? text.length : close + 3;
      continue;
    }
    // Skip closing tags — they can't carry attributes.
    if (text[i] === '<' && text[i + 1] === '/') {
      const close = text.indexOf('>', i);
      i = close === -1 ? text.length : close + 1;
      continue;
    }
    if (text[i] !== '<') {
      i++;
      continue;
    }
    // Match tag name.
    const nameMatch = /^<([a-zA-Z][\w-]*)/.exec(text.slice(i));
    if (!nameMatch) {
      i++;
      continue;
    }
    const tagName = nameMatch[1];
    const start = i;
    let p = i + nameMatch[0].length;
    const attributes: ScannedAttribute[] = [];

    // Attribute loop. Advance until we hit `>` or `/>` at the top level of
    // the opening tag.
    while (p < text.length) {
      // Skip whitespace between attributes.
      while (p < text.length && /\s/.test(text[p])) p++;
      if (p >= text.length) break;
      if (text[p] === '>' || (text[p] === '/' && text[p + 1] === '>')) break;

      // Match an attribute name.
      const attrMatch = /^([a-zA-Z_:@][\w:.\-]*)/.exec(text.slice(p));
      if (!attrMatch) {
        // Unrecognised char — advance past it to avoid infinite loop.
        p++;
        continue;
      }
      const attrName = attrMatch[1];
      const attrStart = p;
      p += attrMatch[0].length;
      attributes.push({ name: attrName, nameStart: attrStart });

      // Optional `=value`.
      while (p < text.length && /\s/.test(text[p])) p++;
      if (text[p] === '=') {
        p++;
        while (p < text.length && /\s/.test(text[p])) p++;
        const q = text[p];
        if (q === '"' || q === "'") {
          const close = text.indexOf(q, p + 1);
          p = close === -1 ? text.length : close + 1;
        } else {
          // Unquoted value: read until whitespace or '>'.
          while (p < text.length && !/[\s>]/.test(text[p])) p++;
        }
      }
    }

    const selfClosing =
      (text[p] === '/' && text[p + 1] === '>') || VOID_ELEMENTS.has(tagName.toLowerCase());
    // Find the `>` that closes the opening tag.
    const gt = text.indexOf('>', p);
    const openEnd = gt === -1 ? text.length : gt + 1;
    yield { tagName, start, openEnd, attributes, selfClosing };
    i = openEnd;
  }
}

/**
 * Find the element whose opening tag contains `offset`. Returns null if
 * the offset is outside any tag.
 */
export function findElementAt(
  text: string,
  offset: number,
): ScannedElement | null {
  let best: ScannedElement | null = null;
  for (const el of scanElements(text)) {
    if (el.start > offset) break;
    if (offset < el.openEnd) best = el;
  }
  return best;
}
