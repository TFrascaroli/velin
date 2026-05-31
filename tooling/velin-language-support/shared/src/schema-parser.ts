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
}

export default SchemaParser;