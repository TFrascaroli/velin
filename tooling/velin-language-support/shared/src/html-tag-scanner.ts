/**
 * Minimal tag-and-attribute scanner. Not a full HTML parser — just enough
 * to answer three questions:
 *   1. Which element (tag name + attrs) surrounds a given offset?
 *   2. Iterate every opening tag with its attributes and offsets.
 *   3. Which elements enclose a given offset (ancestor chain)?
 *
 * Intentionally regex-based; correctness assumptions:
 *   - Attribute values may contain `>` if they're quoted.
 *   - Comments <!-- ... --> are skipped.
 *   - Script/style bodies contain arbitrary text; we still yield their opening
 *     tag but the caller can read the body between openEnd and the matching
 *     `</tag>`.
 */

export interface ScannedAttribute {
  name: string;
  /** Offset of the attribute name's first character. */
  nameStart: number;
  /** Unquoted attribute value, or undefined for boolean/valueless attrs. */
  value?: string;
  /** Offset of the first char of the value (inside quotes when quoted). */
  valueStart?: number;
}

export interface ScannedElement {
  tagName: string;
  /** Offset of the `<` that opens this tag. */
  start: number;
  /** Offset just past the `>` that ends the opening tag. */
  openEnd: number;
  attributes: ScannedAttribute[];
  /** True for `<tag ... />` or void elements. */
  selfClosing: boolean;
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

/**
 * Yield every opening tag in document order.
 */
export function* scanElements(text: string): Generator<ScannedElement> {
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('<!--', i)) {
      const close = text.indexOf('-->', i + 4);
      i = close === -1 ? text.length : close + 3;
      continue;
    }
    if (text[i] === '<' && text[i + 1] === '/') {
      const close = text.indexOf('>', i);
      i = close === -1 ? text.length : close + 1;
      continue;
    }
    if (text[i] !== '<') { i++; continue; }

    const nameMatch = /^<([a-zA-Z][\w-]*)/.exec(text.slice(i));
    if (!nameMatch) { i++; continue; }

    const tagName = nameMatch[1];
    const start = i;
    let p = i + nameMatch[0].length;
    const attributes: ScannedAttribute[] = [];

    while (p < text.length) {
      while (p < text.length && /\s/.test(text[p])) p++;
      if (p >= text.length) break;
      if (text[p] === '>' || (text[p] === '/' && text[p + 1] === '>')) break;

      const attrMatch = /^([a-zA-Z_:@][\w:.\-]*)/.exec(text.slice(p));
      if (!attrMatch) { p++; continue; }

      const attr: ScannedAttribute = { name: attrMatch[1], nameStart: p };
      p += attrMatch[0].length;

      while (p < text.length && /\s/.test(text[p])) p++;
      if (text[p] === '=') {
        p++;
        while (p < text.length && /\s/.test(text[p])) p++;
        const q = text[p];
        if (q === '"' || q === "'") {
          const valueStart = p + 1;
          const close = text.indexOf(q, valueStart);
          const valueEnd = close === -1 ? text.length : close;
          attr.value = text.slice(valueStart, valueEnd);
          attr.valueStart = valueStart;
          p = close === -1 ? text.length : close + 1;
        } else {
          const valueStart = p;
          while (p < text.length && !/[\s>]/.test(text[p])) p++;
          attr.value = text.slice(valueStart, p);
          attr.valueStart = valueStart;
        }
      }
      attributes.push(attr);
    }

    const selfClosing =
      (text[p] === '/' && text[p + 1] === '>') || VOID_ELEMENTS.has(tagName.toLowerCase());
    const gt = text.indexOf('>', p);
    const openEnd = gt === -1 ? text.length : gt + 1;
    yield { tagName, start, openEnd, attributes, selfClosing };
    i = openEnd;
  }
}

/**
 * Find the element whose opening tag contains `offset`.
 */
export function findElementAt(text: string, offset: number): ScannedElement | null {
  let best: ScannedElement | null = null;
  for (const el of scanElements(text)) {
    if (el.start > offset) break;
    if (offset < el.openEnd) best = el;
  }
  return best;
}

/**
 * Return the ancestor chain (outer → inner) whose *body* contains `offset`.
 * The offset does NOT need to be inside the opening tag; being anywhere
 * between `<div>` and `</div>` counts. Uses a simple tag-name stack that
 * pops on any matching close tag; mismatched close tags pop to the closest
 * matching entry (browser-lenient behaviour).
 */
export function enclosingElementsAt(text: string, offset: number): ScannedElement[] {
  const stack: ScannedElement[] = [];
  const closeRe = /<\/([a-zA-Z][\w-]*)\s*>/g;

  const closes: Array<{ name: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = closeRe.exec(text))) {
    closes.push({ name: m[1].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  let closeIdx = 0;

  let result: ScannedElement[] | null = null;
  for (const el of scanElements(text)) {
    // Fire any close tags that occur before this opening tag.
    while (closeIdx < closes.length && closes[closeIdx].start < el.start) {
      if (result === null && closes[closeIdx].start > offset) {
        result = stack.slice();
      }
      popMatching(stack, closes[closeIdx].name);
      closeIdx++;
    }

    if (result === null && el.start > offset) {
      result = stack.slice();
    }

    if (!el.selfClosing) stack.push(el);
  }

  // Remaining closes after the last open tag.
  while (closeIdx < closes.length) {
    if (result === null && closes[closeIdx].start > offset) {
      result = stack.slice();
    }
    popMatching(stack, closes[closeIdx].name);
    closeIdx++;
  }

  return result ?? stack.slice();
}

function popMatching(stack: ScannedElement[], name: string): void {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].tagName.toLowerCase() === name) {
      stack.length = i;
      return;
    }
  }
}
