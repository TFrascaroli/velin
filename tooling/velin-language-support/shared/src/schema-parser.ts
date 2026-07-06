import { VelinSchemaReference, VelinSchemaContext } from './types';
import { scanElements } from './html-tag-scanner';

const SCHEMA_COMMENT_RE =
  /<!--\s*@(?:vln|velin)-(?:type|schema)(?::|\s+)\{?(.+?)\}?\s*-->/;

export class SchemaParser {
  /** Parse a single schema-comment line into a reference. */
  parseSchemaComment(comment: string): VelinSchemaReference | null {
    const m = SCHEMA_COMMENT_RE.exec(comment);
    if (!m) return null;
    const spec = m[1].trim();

    // Inline-script: infer state shape from a <script> in the same document.
    if (spec === 'script') return { type: 'inline-script' };
    if (/^script#[\w-]+$/.test(spec)) {
      return { type: 'inline-script', typeName: spec.slice('script#'.length) };
    }

    // path#TypeName
    if (spec.includes('#')) {
      const [source, typeName] = spec.split('#');
      return {
        type: source.endsWith('.ts') ? 'typescript' : 'jsdoc',
        source,
        typeName,
      };
    }

    // Bare TypeName (global search).
    if (!spec.includes('/') && !spec.includes('\\')) {
      return { type: 'global-type', typeName: spec };
    }

    if (spec.endsWith('.json')) return { type: 'json', source: spec };
    if (spec.startsWith('{')) return { type: 'inline', source: spec };

    // Bare .ts/.js/.mjs/.cjs path — run Velin.bind() inference against it.
    if (/\.(m?[jt]sx?|cjs)$/.test(spec)) {
      return { type: 'inline-script', linkedPath: spec };
    }
    return null;
  }

  /**
   * Walk up from `line` looking for a schema comment. If one is found and
   * it uses `script`/`script#id`, resolve the referenced <script> body or
   * src into the returned reference.
   */
  findSchemaContext(documentText: string, line: number): VelinSchemaContext {
    const lines = documentText.split('\n');

    for (let i = Math.min(line, lines.length - 1); i >= 0; i--) {
      const ref = this.parseSchemaComment(lines[i]);
      if (!ref) continue;

      if (ref.type === 'inline-script' && !ref.linkedPath) {
        // Absolute offset of this comment line.
        let commentOffset = 0;
        for (let k = 0; k < i; k++) commentOffset += lines[k].length + 1;
        attachScriptSource(ref, documentText, commentOffset);
      }

      const startIndent = getIndent(lines[i + 1] ?? '');
      let endLine = lines.length - 1;
      for (let j = i + 1; j < lines.length; j++) {
        if (this.parseSchemaComment(lines[j])) { endLine = j - 1; break; }
        if (lines[j].trim() && getIndent(lines[j]) < startIndent) {
          endLine = j - 1; break;
        }
      }

      return { schemaRef: ref, applicableRange: { startLine: i, endLine } };
    }
    return { schemaRef: null, applicableRange: null };
  }
}

/**
 * Fill `source`/`sourceOffset` or `linkedPath` on an inline-script ref by
 * finding the matching <script> tag in the document. `typeName`, when set,
 * selects by id. Without an id, prefer the last <script> before the comment,
 * otherwise the first after.
 */
function attachScriptSource(
  ref: VelinSchemaReference,
  documentText: string,
  commentOffset: number,
): void {
  const wantedId = ref.typeName;
  type Entry = { src?: string; body?: string; offset?: number };
  let before: Entry | null = null;
  let after: Entry | null = null;
  // Cached lowercased text for the case-insensitive `</script>` search.
  const lowered = documentText.toLowerCase();

  for (const el of scanElements(documentText)) {
    if (el.tagName.toLowerCase() !== 'script') continue;
    const attrs = attrMap(el);

    if (wantedId !== undefined && attrs.id !== wantedId) continue;

    let entry: Entry;
    if (attrs.src) {
      entry = { src: attrs.src };
    } else {
      const close = lowered.indexOf('</script>', el.openEnd);
      if (close === -1) continue;
      const body = documentText.slice(el.openEnd, close);
      if (!body.trim()) continue;
      entry = { body, offset: el.openEnd };
    }

    if (wantedId !== undefined) {
      applyEntry(ref, entry);
      return;
    }
    if (el.start < commentOffset) before = entry;
    else if (!after) after = entry;
  }

  const pick = before ?? after;
  if (pick) applyEntry(ref, pick);
}

function attrMap(el: { attributes: { name: string; value?: string }[] }): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const a of el.attributes) out[a.name.toLowerCase()] = a.value;
  return out;
}

function applyEntry(
  ref: VelinSchemaReference,
  entry: { src?: string; body?: string; offset?: number },
): void {
  if (entry.src) {
    ref.linkedPath = entry.src;
  } else if (entry.body !== undefined && entry.offset !== undefined) {
    ref.source = entry.body;
    ref.sourceOffset = entry.offset;
  }
}

function getIndent(line: string): number {
  return line.length - line.trimStart().length;
}

export default SchemaParser;
