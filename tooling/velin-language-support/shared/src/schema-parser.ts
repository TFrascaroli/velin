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

      // Inline-script mode: infer the state shape from a <script> block in the
      // same document. findSchemaContext locates the block and fills in source.
      if (typeStr === 'script') {
        return { type: 'inline-script' };
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
        if (schemaRef.type === 'inline-script') {
          const script = this.findInlineScript(documentText, lines, i);
          if (script) {
            schemaRef.source = script.body;
            schemaRef.sourceOffset = script.offset;
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
   * Find a <script> block whose body should be treated as the schema source.
   * Prefers the last block that appears before the schema comment; falls back
   * to the last block after it (common when the state lives at the bottom of
   * the file).
   */
  private findInlineScript(
    documentText: string,
    lines: string[],
    commentLine: number,
  ): { body: string; offset: number } | null {
    // Compute the absolute offset of the schema comment line.
    let commentOffset = 0;
    for (let k = 0; k < commentLine; k++) commentOffset += lines[k].length + 1;

    // Replace HTML comments with same-length whitespace so `<script>`
    // mentioned inside comments doesn't get parsed as a real tag. Preserving
    // length keeps offsets valid for downstream slicing.
    const scrubbed = documentText.replace(/<!--[\s\S]*?-->/g, (m) =>
      m.replace(/[^\n]/g, ' '),
    );
    const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    let before: { body: string; offset: number } | null = null;
    let after: { body: string; offset: number } | null = null;
    while ((match = re.exec(scrubbed))) {
      const body = match[1];
      if (!body.trim()) continue; // skip external <script src="..."> and empty blocks
      const openTagEnd = scrubbed.indexOf('>', match.index) + 1;
      // Read the real body from the un-scrubbed source so nothing is missing.
      const bodyEnd = openTagEnd + body.length;
      const entry = { body: documentText.slice(openTagEnd, bodyEnd), offset: openTagEnd };
      if (match.index < commentOffset) before = entry;
      else if (!after) after = entry;
    }
    return before ?? after;
  }
}

export default SchemaParser;