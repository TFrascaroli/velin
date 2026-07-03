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
  SemanticTokens,
  Diagnostic,
  DiagnosticSeverity,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  SchemaParser,
  DirectiveParser,
  CompletionItem,
  CompletionItemKind,
  VELIN_DIRECTIVE_META,
  findDirectiveMeta,
  directivesValidAt,
  validateDirectivePlacement,
  scanElements,
  findElementAt,
} from '@velin/shared';
import { TypeScriptService } from './typescript-service';
import * as ts from 'typescript';

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
      definitionProvider: true,
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

// Validate the document whenever it changes, publishing diagnostics for
// misplaced directives (e.g. vln-vars on a non-<template>).
documents.onDidChangeContent((change) => {
  const diagnostics = validateVelinPlacement(change.document);
  connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

documents.onDidClose((e) => {
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

function validateVelinPlacement(document: TextDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();

  for (const el of scanElements(text)) {
    const siblings = el.attributes.map((a) => a.name.toLowerCase());
    for (const attr of el.attributes) {
      if (!attr.name.startsWith('vln-')) continue;
      const base = attr.name.split(':')[0];
      const err = validateDirectivePlacement(base, {
        tagName: el.tagName.toLowerCase(),
        siblingAttributes: siblings,
      });
      if (!err) continue;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: document.positionAt(attr.nameStart),
          end: document.positionAt(attr.nameStart + attr.name.length),
        },
        message: err.message,
        source: 'velin',
        code: err.code,
      });
    }
  }
  return diagnostics;
}

function getElementContextAt(
  document: TextDocument,
  offset: number,
): { tagName: string; siblings: string[] } | null {
  const el = findElementAt(document.getText(), offset);
  if (!el) return null;
  return {
    tagName: el.tagName.toLowerCase(),
    siblings: el.attributes.map((a) => a.name.toLowerCase()),
  };
}

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
        const offset = document.offsetAt(position);
        const ctx = getElementContextAt(document, offset);
        const availableCompletions = getDirectiveCompletions(ctx);

        const matchingCompletions = availableCompletions.filter((item) =>
          item.label.startsWith(partial),
        );
        const allDirectiveCompletions =
          matchingCompletions.length > 0 ? matchingCompletions : availableCompletions;

        return allDirectiveCompletions.map((item) => ({
          ...item,
          textEdit: {
            range: {
              start: { line: position.line, character: position.character - partial.length },
              end: { line: position.line, character: position.character },
            },
            newText: item.label,
          },
        }));
      }

      // Check if we're typing a directive name after vln-
      if (beforeCursor.includes('vln-') && beforeCursor.match(/vln-[\w-]*$/)) {
        const offset = document.offsetAt(position);
        const ctx = getElementContextAt(document, offset);
        connection.console.log(`Providing directive completions for context: ${JSON.stringify(ctx)}`);
        return getDirectiveCompletions(ctx);
      }
      connection.console.log(`No directive context found`);
      return [];
    }

    connection.console.log(`Found directive context: ${directiveContext.directive.attribute} expression: "${directiveContext.directive.expression}"`);

    // Find applicable schema context
    const schemaContext = schemaParser.findSchemaContext(document.getText(), position.line);
    connection.console.log(`Schema context: ${JSON.stringify(schemaContext.schemaRef)}`);
    
    if (!schemaContext.schemaRef) {
      // No schema found — no way to produce meaningful completions.
      // The built-in JavaScript grammar (injected by the extension) still
      // guides typing visually.
      connection.console.log(`No schema found; no completions.`);
      return [];
    }

    // Get schema-aware completions
    try {
      const completions = await getSchemaCompletions(
        schemaContext.schemaRef,
        directiveContext.directive.expression,
        directiveContext.expressionPos,
        document.uri,
        position.line,
        document.getText(),
      );

      connection.console.log(`Found ${completions.length} schema completions`);
      return completions.map(convertToLSPCompletion);
    } catch (error) {
      connection.console.error(`Error getting schema completions: ${error}`);
      return [];
    }
  }
);

// Handle completion item resolve requests
connection.onCompletionResolve((item: LSPCompletionItem): LSPCompletionItem => {
  // Add additional details if needed
  return item;
});

// Go-to-definition on identifiers inside directive expressions.
connection.onDefinition(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const position = params.position;
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line, character: Number.MAX_SAFE_INTEGER },
  });

  const directives = directiveParser.findDirectivesInLine(line, position.line);
  let ctx: { directive: any; expressionPos: number } | null = null;
  for (const d of directives) {
    const equalsPos = line.indexOf('=', d.position.start);
    if (equalsPos === -1) continue;
    let pos = equalsPos + 1;
    while (pos < line.length && /\s/.test(line[pos])) pos++;
    if (pos >= line.length || (line[pos] !== '"' && line[pos] !== "'")) continue;
    const quoteChar = line[pos];
    const quoteStart = pos;
    const quoteEnd = line.indexOf(quoteChar, quoteStart + 1);
    if (quoteEnd === -1) continue;
    if (position.character > quoteStart && position.character <= quoteEnd) {
      ctx = { directive: d, expressionPos: position.character - quoteStart - 1 };
      break;
    }
  }
  if (!ctx) return null;

  const schemaContext = schemaParser.findSchemaContext(document.getText(), position.line);
  if (!schemaContext.schemaRef) return null;

  const loc = await tsService.getDefinition(
    schemaContext.schemaRef,
    ctx.directive.expression,
    ctx.expressionPos,
    document.uri,
    position.line,
    document.getText(),
  );
  if (!loc) return null;
  return {
    uri: loc.uri,
    range: loc.range,
  };
});

// Semantic token type indices — must match the legend declared in onInitialize.
const TT = {
  VARIABLE: 0,
  PROPERTY: 1,
  FUNCTION: 2,
  METHOD: 3,
  KEYWORD: 4,
  STRING: 5,
  NUMBER: 6,
  OPERATOR: 7,
  PARAMETER: 8,
} as const;

connection.languages.semanticTokens.on((params: SemanticTokensParams): SemanticTokens => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return { data: [] };

  const text = document.getText();
  const lines = text.split('\n');

  // Resolve the schema type once per document (semantic tokens is a full-doc
  // request). If the doc uses multiple schemas we still pick the first found;
  // per-block resolution can come later.
  const rootCtx = resolveRootTypeForDocument(document.uri, text);

  // Collect names introduced by vln-loop:*/vln-var:* anywhere in the doc so
  // we can colour them as parameters wherever they appear.
  const scopeVarNames = collectScopeVarNames(text);

  const allTokens: Array<{ line: number; start: number; length: number; type: number; modifiers: number }> = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const directives = directiveParser.findDirectivesInLine(line, lineIndex);

    for (const directive of directives) {
      const attrStart = directive.position.start;
      const equalsPos = line.indexOf('=', attrStart);
      if (equalsPos === -1) continue;
      let pos = equalsPos + 1;
      while (pos < line.length && /\s/.test(line[pos])) pos++;
      if (pos >= line.length || (line[pos] !== '"' && line[pos] !== "'")) continue;
      const quoteChar = line[pos];
      const quoteStart = pos + 1;
      const quoteEnd = line.indexOf(quoteChar, quoteStart);
      if (quoteEnd === -1) continue;

      const expression = line.substring(quoteStart, quoteEnd);
      const tokens = tokenizeDirectiveExpression(
        expression,
        lineIndex,
        quoteStart,
        rootCtx,
        scopeVarNames,
      );
      allTokens.push(...tokens);
    }
  }

  allTokens.sort((a, b) => (a.line - b.line) || (a.start - b.start));

  const data: number[] = [];
  let prevLine = 0;
  let prevStart = 0;
  for (const t of allTokens) {
    const deltaLine = t.line - prevLine;
    const deltaStart = deltaLine === 0 ? t.start - prevStart : t.start;
    data.push(deltaLine, deltaStart, t.length, t.type, t.modifiers);
    prevLine = t.line;
    prevStart = t.start;
  }
  return { data };
});

interface RootTypeCtx {
  program: ts.Program;
  checker: ts.TypeChecker;
  rootType: ts.Type;
  // Cached classification of root members.
  members: Map<string, 'method' | 'property'>;
}

function resolveRootTypeForDocument(uri: string, text: string): RootTypeCtx | null {
  const ctx = schemaParser.findSchemaContext(text, 0);
  const schemaRef = ctx.schemaRef;
  if (!schemaRef) {
    // Try scanning down for any schema comment (findSchemaContext at line 0
    // only returns something if one exists at or before line 0).
    for (let i = 0; i < text.split('\n').length; i++) {
      const c = schemaParser.findSchemaContext(text, i);
      if (c.schemaRef) return buildRootCtx(c.schemaRef, uri);
    }
    return null;
  }
  return buildRootCtx(schemaRef, uri);
}

function buildRootCtx(schemaRef: any, uri: string): RootTypeCtx | null {
  const resolved = tsService.resolveRootType(schemaRef, uri);
  if (!resolved) return null;
  const { program, rootType } = resolved;
  const checker = program.getTypeChecker();
  const members = new Map<string, 'method' | 'property'>();
  for (const prop of checker.getPropertiesOfType(rootType)) {
    const decl = prop.valueDeclaration ?? prop.declarations?.[0];
    if (!decl) continue;
    const t = checker.getTypeOfSymbolAtLocation(prop, decl);
    const callable = checker.getSignaturesOfType(t, ts.SignatureKind.Call).length > 0;
    members.set(prop.getName(), callable ? 'method' : 'property');
  }
  return { program, checker, rootType, members };
}

function collectScopeVarNames(text: string): Set<string> {
  const names = new Set<string>();
  const re = /vln-(loop|var):(\w+)=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) names.add(m[2]);
  names.add('$index');
  return names;
}

function tokenizeDirectiveExpression(
  expression: string,
  line: number,
  startChar: number,
  rootCtx: RootTypeCtx | null,
  scopeVars: Set<string>,
): Array<{ line: number; start: number; length: number; type: number; modifiers: number }> {
  const out: Array<{ line: number; start: number; length: number; type: number; modifiers: number }> = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ true,
    ts.LanguageVariant.Standard,
    expression,
  );

  let prevKind: ts.SyntaxKind | null = null;
  scanner.resetTokenState(0);

  const tokens: Array<{ kind: ts.SyntaxKind; text: string; start: number; end: number }> = [];
  while (true) {
    const kind = scanner.scan();
    if (kind === ts.SyntaxKind.EndOfFileToken) break;
    tokens.push({
      kind,
      text: scanner.getTokenText(),
      start: scanner.getTokenStart(),
      end: scanner.getTokenEnd(),
    });
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const next = tokens[i + 1];
    const prevIsDot =
      i > 0 && tokens[i - 1].kind === ts.SyntaxKind.DotToken;
    const nextIsOpenParen =
      next && next.kind === ts.SyntaxKind.OpenParenToken;

    let type: number | null = null;

    if (tok.kind === ts.SyntaxKind.Identifier) {
      if (prevIsDot) {
        type = nextIsOpenParen ? TT.METHOD : TT.PROPERTY;
      } else if (scopeVars.has(tok.text)) {
        type = TT.PARAMETER;
      } else if (rootCtx?.members.has(tok.text)) {
        const kind = rootCtx.members.get(tok.text);
        type = kind === 'method' ? TT.METHOD : TT.PROPERTY;
      } else if (nextIsOpenParen) {
        type = TT.FUNCTION;
      } else {
        type = TT.VARIABLE;
      }
    } else if (isKeywordKind(tok.kind)) {
      type = TT.KEYWORD;
    } else if (
      tok.kind === ts.SyntaxKind.StringLiteral ||
      tok.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      tok.kind === ts.SyntaxKind.TemplateHead ||
      tok.kind === ts.SyntaxKind.TemplateMiddle ||
      tok.kind === ts.SyntaxKind.TemplateTail
    ) {
      type = TT.STRING;
    } else if (tok.kind === ts.SyntaxKind.NumericLiteral) {
      type = TT.NUMBER;
    } else if (isPunctuationKind(tok.kind)) {
      type = TT.OPERATOR;
    }

    if (type !== null) {
      out.push({
        line,
        start: startChar + tok.start,
        length: tok.end - tok.start,
        type,
        modifiers: 0,
      });
    }
    prevKind = tok.kind;
  }
  return out;
}

function isKeywordKind(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstKeyword && kind <= ts.SyntaxKind.LastKeyword;
}

function isPunctuationKind(kind: ts.SyntaxKind): boolean {
  return (
    (kind >= ts.SyntaxKind.FirstPunctuation && kind <= ts.SyntaxKind.LastPunctuation) ||
    (kind >= ts.SyntaxKind.FirstBinaryOperator && kind <= ts.SyntaxKind.LastBinaryOperator)
  );
}

async function getSchemaCompletions(
  schemaRef: any,
  expression: string,
  cursorPos: number,
  documentUri: string,
  currentLine?: number,
  documentText?: string,
): Promise<CompletionItem[]> {
  switch (schemaRef.type) {
    case 'typescript':
    case 'global-type':
    case 'inline-script':
      return await tsService.getCompletions(
        schemaRef,
        expression,
        cursorPos,
        documentUri,
        currentLine,
        documentText,
      );
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

function getDirectiveCompletions(
  ctx: { tagName: string; siblings: string[] } | null,
): LSPCompletionItem[] {
  const list = ctx
    ? directivesValidAt({ tagName: ctx.tagName, siblingAttributes: ctx.siblings })
    : VELIN_DIRECTIVE_META;

  return list.map((meta) => ({
    label: meta.name + (meta.hasSubkey ? ':' : ''),
    kind: LSPCompletionItemKind.Keyword,
    data: meta.name,
    detail: meta.usage || `Velin directive: ${meta.name}`,
    documentation: meta.documentation,
    insertText: meta.hasSubkey ? `${meta.name}:` : meta.name,
  }));
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
  return findDirectiveMeta(directive)?.documentation ?? '';
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

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();

connection.console.log('Velin Language Server started');