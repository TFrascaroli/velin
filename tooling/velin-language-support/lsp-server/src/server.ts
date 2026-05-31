#!/usr/bin/env node

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem as LSPCompletionItem,
  CompletionItemKind as LSPCompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  SemanticTokensParams,
  SemanticTokens
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { SchemaParser, DirectiveParser, CompletionItem, CompletionItemKind } from '@velin/shared';
import { TypeScriptService } from './typescript-service';

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Initialize services
const schemaParser = new SchemaParser();
const directiveParser = new DirectiveParser();
const tsService = new TypeScriptService();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Check if the client supports the `workspace/configuration` request
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '(', '"', "'"]      },
      semanticTokensProvider: {
        legend: {
          tokenTypes: [
            'variable', 'property', 'function', 'method', 'keyword', 
            'string', 'number', 'operator', 'parameter'
          ],
          tokenModifiers: ['declaration', 'definition', 'readonly', 'static']
        },
        range: false,
        full: {
          delta: false
        }      }
    }
  };
  
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }
  
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
    });
  }
});

// Handle completion requests
connection.onCompletion(
  async (textDocumentPosition: TextDocumentPositionParams): Promise<LSPCompletionItem[]> => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
      return [];
    }

    const position = textDocumentPosition.position;
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
    });



    // Use the working manual logic directly
    const directives = directiveParser.findDirectivesInLine(line, position.line);
    let directiveContext: { directive: any; expressionPos: number } | null = null;
    
    for (const directive of directives) {
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
              position.character > quoteStart && position.character <= quoteEnd) {
            directiveContext = {
              directive,
              expressionPos: position.character - quoteStart - 1
            };
            break;
          }
        }
      }
    }



    if (!directiveContext) {
      // Check if we're typing a directive attribute name (e.g., "v" -> suggest "vln-text")
      const beforeCursor = line.substring(0, position.character);
      const attributeMatch = beforeCursor.match(/\s(v[\w-]*)$/);
      
      if (attributeMatch) {
        const partial = attributeMatch[1];

        const matchingCompletions = getBasicDirectiveCompletions().filter(item => 
          item.label.startsWith(partial)
        );
        
        // If no matches with the partial, try matching any vln-* directive (for cases like "v" -> "vln-text")
        const allDirectiveCompletions = matchingCompletions.length > 0 
          ? matchingCompletions 
          : getBasicDirectiveCompletions();
        
        return allDirectiveCompletions.map(item => ({
          ...item,
          // Fix the insertion to replace the partial text
          textEdit: {
            range: {
              start: { line: position.line, character: position.character - partial.length },
              end: { line: position.line, character: position.character }
            },
            newText: item.label
          }
        }));
      }
      
      // Check if we're typing a directive name after vln-
      if (beforeCursor.includes('vln-') && beforeCursor.match(/vln-[\w-]*$/)) {
        connection.console.log(`Providing basic directive completions`);
        return getBasicDirectiveCompletions();
      }
      connection.console.log(`No directive context found`);
      return [];
    }

    connection.console.log(`Found directive context: ${directiveContext.directive.attribute} expression: "${directiveContext.directive.expression}"`);

    // Find applicable schema context
    const schemaContext = schemaParser.findSchemaContext(document.getText(), position.line);
    connection.console.log(`Schema context: ${JSON.stringify(schemaContext.schemaRef)}`);
    
    if (!schemaContext.schemaRef) {
      // No schema found, provide basic expression completions
      connection.console.log(`No schema found, providing basic expression completions`);
      return getBasicExpressionCompletions();
    }

    // Get schema-aware completions
    try {
      const completions = await getSchemaCompletions(
        schemaContext.schemaRef,
        directiveContext.directive.expression,
        directiveContext.expressionPos,
        document.uri,
        position.line // Pass line number for scope analysis
      );
      
      connection.console.log(`Found ${completions.length} schema completions`);
      return completions.map(convertToLSPCompletion);
    } catch (error) {
      connection.console.error(`Error getting schema completions: ${error}`);
      return getBasicExpressionCompletions();
    }
  }
);

// Handle completion item resolve requests
connection.onCompletionResolve((item: LSPCompletionItem): LSPCompletionItem => {
  // Add additional details if needed
  return item;
});

// Handle semantic tokens requests
connection.languages.semanticTokens.on((params: SemanticTokensParams): SemanticTokens => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }

  const allTokens: Array<{ line: number; start: number; length: number; type: number; modifiers: number }> = [];
  const text = document.getText();
  const lines = text.split('\n');
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const directives = directiveParser.findDirectivesInLine(line, lineIndex);
    
    for (const directive of directives) {
      // Find the expression part within quotes
      const attrStart = directive.position.start;
      const equalsPos = line.indexOf('=', attrStart);
      
      if (equalsPos !== -1) {
        let pos = equalsPos + 1;
        while (pos < line.length && /\s/.test(line[pos])) pos++;
        
        if (pos < line.length && (line[pos] === '"' || line[pos] === "'")) {
          const quoteStart = pos + 1;
          const quoteEnd = line.indexOf(line[pos], quoteStart);
          
          if (quoteEnd !== -1) {
            const expression = line.substring(quoteStart, quoteEnd);
            
            // Use manual tokenization for JavaScript/TypeScript expression
            const expressionTokens = tokenizeExpression(expression, lineIndex, quoteStart);
            
            // Convert flat array back to token objects for sorting
            for (let i = 0; i < expressionTokens.length; i += 5) {
              allTokens.push({
                line: expressionTokens[i],
                start: expressionTokens[i + 1],
                length: expressionTokens[i + 2],
                type: expressionTokens[i + 3],
                modifiers: expressionTokens[i + 4]
              });
            }
          }
        }
      }
    }
  }

  // Sort tokens by line then by start position
  allTokens.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.start - b.start;
  });

  // Convert to LSP format: [deltaLine, deltaStart, length, tokenType, tokenModifiers]
  const tokens: number[] = [];
  let prevLine = 0;
  let prevStart = 0;

  for (const token of allTokens) {
    const deltaLine = token.line - prevLine;
    const deltaStart = deltaLine === 0 ? token.start - prevStart : token.start;

    tokens.push(deltaLine, deltaStart, token.length, token.type, token.modifiers);

    prevLine = token.line;
    prevStart = token.start;
  }

  return { data: tokens };
});

async function getSchemaCompletions(
  schemaRef: any,
  expression: string,
  cursorPos: number,
  documentUri: string,
  currentLine?: number
): Promise<CompletionItem[]> {
  switch (schemaRef.type) {
    case 'typescript':
      return await tsService.getCompletions(schemaRef, expression, cursorPos, documentUri, currentLine);
    case 'jsdoc':
      return await tsService.getJSDocCompletions(schemaRef, expression, cursorPos, documentUri);
    case 'json':
      return getJSONSchemaCompletions(schemaRef, expression, cursorPos);
    case 'inline':
      return getInlineSchemaCompletions(schemaRef, expression, cursorPos);
    default:
      return [];
  }
}

function getBasicDirectiveCompletions(): LSPCompletionItem[] {
  const directives = [
    'vln-text',
    'vln-input',
    'vln-if',
    'vln-class',
    'vln-attr',
    'vln-on',
    'vln-loop',
    'vln-use',
    'vln-fragment'
  ];

  return directives.map(directive => ({
    label: directive,
    kind: LSPCompletionItemKind.Keyword,
    data: directive,
    detail: `Velin directive: ${directive}`,
    documentation: getDirectiveDocumentation(directive)
  }));
}

function getBasicExpressionCompletions(): LSPCompletionItem[] {
  return [
    {
      label: 'this',
      kind: LSPCompletionItemKind.Variable,
      data: 'this',
      detail: 'Reference to the bound state object'
    },
    {
      label: 'user',
      kind: LSPCompletionItemKind.Variable,
      data: 'user',
      detail: 'User object (from schema)'
    },
    {
      label: 'count',
      kind: LSPCompletionItemKind.Variable,
      data: 'count',
      detail: 'Count property (example)'
    }
  ];
}

function getJSONSchemaCompletions(schemaRef: any, expression: string, cursorPos: number): CompletionItem[] {
  // JSON schema parsing and completion not yet implemented
  return [];
}

function getInlineSchemaCompletions(schemaRef: any, expression: string, cursorPos: number): CompletionItem[] {
  // Inline schema parsing and completion not yet implemented
  return [];
}

function getDirectiveDocumentation(directive: string): string {
  const docs: Record<string, string> = {
    'vln-text': 'Sets the text content of an element. Usage: vln-text="expression"',
    'vln-input': 'Creates two-way data binding for form controls. Usage: vln-input="propertyName"',
    'vln-if': 'Conditionally shows/hides element based on expression. Usage: vln-if="condition"',
    'vln-class': 'Dynamically sets CSS classes. Usage: vln-class="classExpression"',
    'vln-attr': 'Sets HTML attributes dynamically. Usage: vln-attr:attrName="value"',
    'vln-on': 'Binds event handlers. Usage: vln-on:eventName="handler"',
    'vln-loop': 'Repeats element for each array item. Usage: vln-loop:item="arrayExpression"',
    'vln-use': 'Renders template by ID. Usage: vln-use="templateId"',
    'vln-fragment': 'Alias for vln-use. Usage: vln-fragment="templateId"'
  };
  return docs[directive] || '';
}

function convertToLSPCompletion(completion: CompletionItem): LSPCompletionItem {
  return {
    label: completion.label,
    kind: convertCompletionItemKind(completion.kind),
    detail: completion.detail,
    documentation: completion.documentation,
    insertText: completion.insertText,
    sortText: completion.sortText,
    data: completion.label
  };
}

function convertCompletionItemKind(kind: CompletionItemKind): LSPCompletionItemKind {
  const kindMap: Record<CompletionItemKind, LSPCompletionItemKind> = {
    [CompletionItemKind.Text]: LSPCompletionItemKind.Text,
    [CompletionItemKind.Method]: LSPCompletionItemKind.Method,
    [CompletionItemKind.Function]: LSPCompletionItemKind.Function,
    [CompletionItemKind.Constructor]: LSPCompletionItemKind.Constructor,
    [CompletionItemKind.Field]: LSPCompletionItemKind.Field,
    [CompletionItemKind.Variable]: LSPCompletionItemKind.Variable,
    [CompletionItemKind.Class]: LSPCompletionItemKind.Class,
    [CompletionItemKind.Interface]: LSPCompletionItemKind.Interface,
    [CompletionItemKind.Module]: LSPCompletionItemKind.Module,
    [CompletionItemKind.Property]: LSPCompletionItemKind.Property,
    [CompletionItemKind.Unit]: LSPCompletionItemKind.Unit,
    [CompletionItemKind.Value]: LSPCompletionItemKind.Value,
    [CompletionItemKind.Enum]: LSPCompletionItemKind.Enum,
    [CompletionItemKind.Keyword]: LSPCompletionItemKind.Keyword,
    [CompletionItemKind.Snippet]: LSPCompletionItemKind.Snippet,
    [CompletionItemKind.Color]: LSPCompletionItemKind.Color,
    [CompletionItemKind.File]: LSPCompletionItemKind.File,
    [CompletionItemKind.Reference]: LSPCompletionItemKind.Reference
  };
  return kindMap[kind] || LSPCompletionItemKind.Text;
}

function tokenizeExpression(expression: string, line: number, startChar: number): number[] {
  const tokens: number[] = [];
  
  // Token type mapping based on our legend:
  // ['variable', 'property', 'function', 'method', 'keyword', 'string', 'number', 'operator', 'parameter']
  const TokenType = {
    VARIABLE: 0,
    PROPERTY: 1,
    FUNCTION: 2,
    METHOD: 3,
    KEYWORD: 4,
    STRING: 5,
    NUMBER: 6,
    OPERATOR: 7,
    PARAMETER: 8
  };
  
  // Enhanced tokenization with proper JavaScript/TypeScript parsing
  const tokenRegex = /(\w+)|(\.)|([\(\)])|(=|!==?|<=?|>=?|\+\+?|--?|\*|\/|%)|(\d+(?:\.\d+)?)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\s+)/g;
  let match;
  let lastWasIdentifier = false;
  
  tokenRegex.lastIndex = 0; // Reset regex state
  
  while ((match = tokenRegex.exec(expression)) !== null) {
    const tokenText = match[0];
    const tokenStart = match.index;
    const tokenLength = tokenText.length;
    
    // Skip whitespace
    if (/^\s+$/.test(tokenText)) {
      lastWasIdentifier = false;
      continue;
    }
    
    let tokenType = TokenType.VARIABLE; // variable by default
    let tokenModifiers = 0;
    
    if (match[1]) { // Word tokens (\w+)
      if (['true', 'false', 'null', 'undefined', 'this', 'new', 'typeof', 'instanceof', 'return', 'function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'do'].includes(tokenText)) {
        tokenType = TokenType.KEYWORD;
      } else if (lastWasIdentifier) {
        // If we had an identifier before (after a dot), this is likely a property access
        tokenType = TokenType.PROPERTY;
      } else if (tokenText.match(/^[A-Z]/)) {
        // Capitalized identifiers are likely classes/constructors
        tokenType = TokenType.FUNCTION; // Use function for constructors
      } else {
        tokenType = TokenType.VARIABLE;
      }
      lastWasIdentifier = true;
    } else if (match[2]) { // Dot (.)
      tokenType = TokenType.OPERATOR;
      // Keep lastWasIdentifier as true since after a dot we expect a property
      lastWasIdentifier = true;
    } else if (match[3]) { // Parentheses
      tokenType = TokenType.OPERATOR;
      lastWasIdentifier = false;
    } else if (match[4]) { // Operators
      tokenType = TokenType.OPERATOR;
      lastWasIdentifier = false;
    } else if (match[5]) { // Numbers
      tokenType = TokenType.NUMBER;
      lastWasIdentifier = false;
    } else if (match[6]) { // Strings
      tokenType = TokenType.STRING;
      lastWasIdentifier = false;
    }
    
    // Add token: [line, absoluteStart, length, tokenType, tokenModifiers]
    tokens.push(line, startChar + tokenStart, tokenLength, tokenType, tokenModifiers);
  }
  
  return tokens;
}

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();

connection.console.log('Velin Language Server started');