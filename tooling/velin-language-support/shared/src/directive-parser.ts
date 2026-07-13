import { VelinDirective, VELIN_DIRECTIVES } from './types';

// (?<![-\w]) prevents `data-vln-text` from matching as `vln-text`.
// Value grammar: either "…" or '…' — the *inner* quote is legal since HTML
// forbids the matching one inside an attribute value.
const DIRECTIVE_RE =
  /(?<![-\w])(vln-[\w-]+(?::[\w-]+)?)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export class DirectiveParser {
  /** Find every Velin directive on a line, with expression span info. */
  findDirectivesInLine(line: string, _lineNumber: number): VelinDirective[] {
    const out: VelinDirective[] = [];
    DIRECTIVE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DIRECTIVE_RE.exec(line))) {
      const attribute = m[1];
      const expression = m[2] ?? m[3] ?? '';
      const baseName = attribute.split(':')[0];
      if (!VELIN_DIRECTIVES.includes(baseName as any)) continue;

      const start = m.index;
      const end = start + m[0].length;
      // The value sits at the tail of the match, wrapped in one char of quote
      // on each side. Derive its inner span from that invariant.
      const expressionEnd = end - 1;
      const expressionStart = expressionEnd - expression.length;

      out.push({
        name: baseName,
        attribute,
        expression,
        position: { start, end },
        expressionStart,
        expressionEnd,
      });
    }
    return out;
  }

  /**
   * If `character` sits inside a directive's expression, return the directive
   * plus the cursor's zero-based offset within the expression.
   */
  isInDirectiveExpression(
    line: string,
    character: number,
  ): { directive: VelinDirective; expressionPos: number } | null {
    for (const d of this.findDirectivesInLine(line, 0)) {
      if (character > d.expressionStart - 1 && character <= d.expressionEnd) {
        return { directive: d, expressionPos: character - d.expressionStart };
      }
    }
    return null;
  }
}

export default DirectiveParser;
