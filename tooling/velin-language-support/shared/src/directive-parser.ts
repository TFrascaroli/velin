import { VelinDirective, VELIN_DIRECTIVES } from './types';

export class DirectiveParser {
  /**
   * Find all Velin directives in a line of text
   */
  findDirectivesInLine(line: string, lineNumber: number): VelinDirective[] {
    const directives: VelinDirective[] = [];
    
    // Match vln-* attributes with their expressions
    // Pattern: vln-text="expression" or vln-on:click="expression"
    const directivePattern = /(vln-[\w-]+(?::\w+)?)\s*=\s*["']([^"']*?)["']/g;
    
    let match;
    while ((match = directivePattern.exec(line)) !== null) {
      const fullAttribute = match[1];
      const expression = match[2];
      const startPos = match.index;
      const endPos = match.index + match[0].length;
      
      // Extract base directive name (e.g., "vln-on:click" -> "vln-on")
      const baseName = fullAttribute.split(':')[0];
      
      if (this.isValidVelinDirective(baseName)) {
        const directive = {
          name: baseName,
          attribute: fullAttribute,
          expression,
          position: {
            start: startPos,
            end: endPos
          }
        };
        directives.push(directive);
      }
    }
    
    return directives;
  }

  /**
   * Get the directive at a specific character position in a line
   */
  getDirectiveAtPosition(line: string, character: number): VelinDirective | null {
    const directives = this.findDirectivesInLine(line, 0);
    
    for (const directive of directives) {
      if (character >= directive.position.start && character <= directive.position.end) {
        return directive;
      }
    }
    
    return null;
  }

  /**
   * Check if cursor is within the expression part of a directive
   */
  isInDirectiveExpression(line: string, character: number): { directive: VelinDirective; expressionPos: number } | null {
    const directives = this.findDirectivesInLine(line, 0);
    
    for (const directive of directives) {
      // Exact copy of the working server logic
      const attrStart = directive.position.start;
      const equalsPos = line.indexOf('=', attrStart);
      if (equalsPos !== -1) {
        let pos = equalsPos + 1;
        while (pos < line.length && /\s/.test(line[pos])) pos++;
        
        if (pos < line.length && (line[pos] === '"' || line[pos] === "'")) {
          const quoteChar = line[pos];
          const quoteStart = pos;
          const quoteEnd = line.indexOf(quoteChar, quoteStart + 1);
          
          if (quoteStart !== -1 && quoteEnd !== -1 && 
              character > quoteStart && character <= quoteEnd) {
            return {
              directive,
              expressionPos: character - quoteStart - 1
            };
          }
        }
      }
    }
    
    return null;
  }

  private isValidVelinDirective(directiveName: string): boolean {
    return VELIN_DIRECTIVES.includes(directiveName as any);
  }
}

export default DirectiveParser;