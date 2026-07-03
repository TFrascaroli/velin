import { VelinSchemaReference, VelinSchemaContext } from './types';

export class SchemaParser {
  /**
   * Parse a schema comment to extract schema reference
   */
  parseSchemaComment(comment: string): VelinSchemaReference | null {
    // Match: <!-- @vln-type {./path/file.ts#TypeName} --> or <!-- @velin-type {...} -->
    // Also matches: <!-- @velin-schema: ./path/file.ts#TypeName -->
    const typeMatch = comment.match(/<!--\s*@(vln|velin)-(type|schema)(:|\s+)\{?(.+?)\}?\s*-->/);
    if (typeMatch) {
      const typeStr = typeMatch[4].trim();

      // Script-inference mode: infer the state shape from a <script> block in
      // the same document. `script` picks the nearest tag; `script#id` selects
      // the tag with that HTML id, which is required when several <script>s
      // coexist or the target is a linked file.
      if (typeStr === 'script') {
        return { type: 'inline-script' };
      }
      if (/^script#[\w-]+$/.test(typeStr)) {
        return { type: 'inline-script', typeName: typeStr.slice('script#'.length) };
      }

      // Handle path#TypeName format
      if (typeStr.includes('#')) {
        const [source, typeName] = typeStr.split('#');
        return {
          type: source.endsWith('.ts') ? 'typescript' : 'jsdoc',
          source,
          typeName
        };
      }
      
      // Handle just TypeName format (global search)
      if (!typeStr.includes('/') && !typeStr.includes('\\')) {
        return {
          type: 'global-type',
          typeName: typeStr
        };
      }

      // Handle raw path (JSON or Inline)
      if (typeStr.endsWith('.json')) {
        return {
          type: 'json',
          source: typeStr
        };
      }

      if (typeStr.startsWith('{')) {
        return {
          type: 'inline',
          source: typeStr
        };
      }

      // Bare path to a JS/TS module — run Velin.bind() inference against it.
      // This is the "reachable at compile time" escape hatch: the runtime HTML
      // may point <script src=""> at a bundled asset, but the schema comment
      // can point directly at the source module the checker can actually read.
      if (/\.(m?[jt]sx?|cjs)$/.test(typeStr)) {
        return {
          type: 'inline-script',
          linkedPath: typeStr,
        };
      }
    }

    return null;
  }

  /**
   * Find the applicable schema context for a given position in the document
   */
  findSchemaContext(documentText: string, line: number): VelinSchemaContext {
    const lines = documentText.split('\n');
    
    // Scan backwards from current line to find schema comment
    for (let i = line; i >= 0; i--) {
      const schemaRef = this.parseSchemaComment(lines[i]);
      if (schemaRef) {
        if (schemaRef.type === 'inline-script' && !schemaRef.linkedPath) {
          // Only look up a <script> tag if the comment didn't already name a
          // file path directly (bare-path form).
          const script = this.findScriptTag(
            documentText,
            lines,
            i,
            schemaRef.typeName,
          );
          if (script) {
            if (script.linkedPath) {
              schemaRef.linkedPath = script.linkedPath;
            } else {
              schemaRef.source = script.body;
              schemaRef.sourceOffset = script.offset;
            }
          }
        }
        // Find the end of this schema's scope
        // Simple heuristic: until next schema comment or significant decrease in indentation
        let endLine = lines.length - 1;
        const startIndent = this.getIndentation(lines[i + 1] || '');
        
        for (let j = i + 1; j < lines.length; j++) {
          // Check for another schema comment
          if (this.parseSchemaComment(lines[j])) {
            endLine = j - 1;
            break;
          }
          
          // Check for significant decrease in indentation (end of block)
          const currentIndent = this.getIndentation(lines[j]);
          if (lines[j].trim() && currentIndent < startIndent) {
            endLine = j - 1;
            break;
          }
        }

        return {
          schemaRef,
          applicableRange: {
            startLine: i,
            endLine
          }
        };
      }
    }

    return {
      schemaRef: null,
      applicableRange: null
    };
  }

  private getIndentation(line: string): number {
    return line.length - line.trimStart().length;
  }

  /**
   * Find a <script> tag to treat as the schema source. When `id` is given,
   * matches by `id=` attribute — required when several script tags coexist or
   * the target is a linked file. Without an id, prefers the nearest inline
   * block before the comment, then after.
   */
  private findScriptTag(
    documentText: string,
    lines: string[],
    commentLine: number,
    id?: string,
  ): ScriptMatch | null {
    // Compute the absolute offset of the schema comment line.
    let commentOffset = 0;
    for (let k = 0; k < commentLine; k++) commentOffset += lines[k].length + 1;

    // Replace HTML comments with same-length whitespace so `<script>`
    // mentioned inside comments doesn't get parsed as a real tag. Preserving
    // length keeps offsets valid for downstream slicing.
    const scrubbed = documentText.replace(/<!--[\s\S]*?-->/g, (m) =>
      m.replace(/[^\n]/g, ' '),
    );
    const re = /<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    let before: ScriptMatch | null = null;
    let after: ScriptMatch | null = null;
    while ((match = re.exec(scrubbed))) {
      const attrs = parseAttrs(match[1]);
      if (id !== undefined) {
        if (attrs.id !== id) continue;
      }

      const openTagEnd = scrubbed.indexOf('>', match.index) + 1;
      let entry: ScriptMatch;
      if (attrs.src) {
        entry = { linkedPath: attrs.src };
      } else {
        const body = match[2];
        if (!body.trim()) continue; // empty inline block
        const bodyEnd = openTagEnd + body.length;
        entry = {
          body: documentText.slice(openTagEnd, bodyEnd),
          offset: openTagEnd,
        };
      }

      // With an explicit id there's exactly one match — return immediately.
      if (id !== undefined) return entry;

      if (match.index < commentOffset) before = entry;
      else if (!after) after = entry;
    }
    return before ?? after;
  }
}

type ScriptMatch =
  | { body: string; offset: number; linkedPath?: undefined }
  | { linkedPath: string; body?: undefined; offset?: undefined };

/**
 * Parse a run of HTML attributes into a name→value map. Only extracts the
 * subset we care about (id, src). Values are unquoted.
 */
function parseAttrs(attrRun: string): { id?: string; src?: string } {
  const out: { id?: string; src?: string } = {};
  const re = /(\w[\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrRun))) {
    const name = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4];
    if (name === 'id') out.id = val;
    else if (name === 'src') out.src = val;
  }
  return out;
}

export default SchemaParser;