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
  FileChangeType,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  SchemaParser,
  DirectiveParser,
  CompletionItem,
  CompletionItemKind,
  VELIN_DIRECTIVE_META,
  directivesValidAt,
  validateDirectivePlacement,
  scanElements,
  VelinSchemaReference,
} from '@velin/shared';
import type { ScannedElement } from '@velin/shared';
import { TypeScriptService } from './typescript-service';
import { diagnoseSchemaRefs } from './schema-diagnostics';
import { URI } from 'vscode-uri';
import * as ts from 'typescript';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const schemaParser = new SchemaParser();
const directiveParser = new DirectiveParser();
const tsService = new TypeScriptService();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let enabled = true;

// Semantic-token type indices — must match the legend order below.
const TT = {
  VARIABLE: 0, PROPERTY: 1, FUNCTION: 2, METHOD: 3, KEYWORD: 4,
  STRING: 5, NUMBER: 6, OPERATOR: 7, PARAMETER: 8,
} as const;

const TOKEN_TYPES = [
  'variable', 'property', 'function', 'method', 'keyword',
  'string', 'number', 'operator', 'parameter',
];

connection.onInitialize((params: InitializeParams) => {
  const caps = params.capabilities;
  hasConfigurationCapability = !!caps.workspace?.configuration;
  hasWorkspaceFolderCapability = !!caps.workspace?.workspaceFolders;

  const initOpts = params.initializationOptions as { enable?: boolean } | undefined;
  if (typeof initOpts?.enable === 'boolean') enabled = initOpts.enable;

  if (params.workspaceFolders?.length) {
    tsService.setWorkspaceFolders(
      params.workspaceFolders.map((f) => URI.parse(f.uri).fsPath),
    );
  } else if (params.rootUri) {
    tsService.setWorkspaceFolders([URI.parse(params.rootUri).fsPath]);
  }

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '(', '"', "'"],
      },
      definitionProvider: true,
      semanticTokensProvider: {
        // Modifiers left empty — we don't emit any today.
        legend: { tokenTypes: TOKEN_TYPES, tokenModifiers: [] },
        range: false,
        full: { delta: false },
      },
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = { workspaceFolders: { supported: true } };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(() => {
      connection.workspace.getWorkspaceFolders().then((folders) => {
        tsService.setWorkspaceFolders(
          (folders ?? []).map((f) => URI.parse(f.uri).fsPath),
        );
      });
    });
  }
});

connection.onDidChangeConfiguration(async () => {
  if (!hasConfigurationCapability) return;
  try {
    const cfg = await connection.workspace.getConfiguration('velin');
    const nextEnabled = cfg?.enable !== false;
    if (nextEnabled === enabled) return;
    enabled = nextEnabled;
    // Toggling clears stale diagnostics on every open doc when going off,
    // and re-validates everything when going on.
    for (const doc of documents.all()) {
      if (!enabled) {
        connection.sendDiagnostics({ uri: doc.uri, diagnostics: [] });
      } else {
        refreshDiagnostics(doc);
      }
    }
  } catch (err) {
    connection.console.error(`velin: config refresh failed: ${err}`);
  }
});

documents.onDidChangeContent((change) => refreshDiagnostics(change.document));

function refreshDiagnostics(doc: TextDocument): void {
  if (!enabled) {
    connection.sendDiagnostics({ uri: doc.uri, diagnostics: [] });
    return;
  }
  const schemaDiags = diagnoseSchemaRefs(schemaParser, doc.getText(), doc.uri).map((d) => ({
    severity: DiagnosticSeverity.Warning,
    range: {
      start: { line: d.line, character: 0 },
      end: { line: d.line, character: d.lineLength },
    },
    message: d.message,
    source: 'velin',
    code: d.code,
  }));
  connection.sendDiagnostics({
    uri: doc.uri,
    diagnostics: [...validateVelinPlacement(doc), ...schemaDiags],
  });
}

documents.onDidClose((e) => {
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
  tsService.invalidateDocument(e.document.uri);
  parsedDocCache.delete(e.document.uri);
  // rootTypeCache keys are `${uri}::${schemaKey}` — drop every entry for this doc.
  const prefix = `${e.document.uri}::`;
  for (const key of rootTypeCache.keys()) {
    if (key.startsWith(prefix)) rootTypeCache.delete(key);
  }
});

connection.onDidChangeWatchedFiles((params) => {
  // Watched files are on disk — inline programs are keyed to document content
  // and unaffected. Evict the file-backed program cache and the root-type
  // ctx cache (the latter caches derived symbol tables that would otherwise
  // point at now-stale ts.Types).
  const relevant = params.changes.some((c) =>
    c.type === FileChangeType.Changed || c.type === FileChangeType.Deleted || c.type === FileChangeType.Created,
  );
  if (relevant) {
    tsService.invalidateFileBackedPrograms();
    rootTypeCache.clear();
  }
});

// ── Diagnostics ────────────────────────────────────────────────────────────

function validateVelinPlacement(document: TextDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const el of getParsedDoc(document).elements) {
    const siblings = el.attributes.map((a) => a.name.toLowerCase());
    for (const attr of el.attributes) {
      if (!attr.name.startsWith('vln-')) continue;
      const err = validateDirectivePlacement(attr.name.split(':')[0], {
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

// ── Completion ─────────────────────────────────────────────────────────────

connection.onCompletion(async (
  params: TextDocumentPositionParams,
): Promise<LSPCompletionItem[]> => {
  if (!enabled) return [];
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const position = params.position;
  const line = getLine(document, position.line);

  const ctx = directiveParser.isInDirectiveExpression(line, position.character);
  if (ctx) {
    const text = document.getText();
    const schemaRef = firstSchemaRef(text, position.line);
    if (!schemaRef) return [];
    try {
      const items = await getSchemaCompletions(
        schemaRef,
        ctx.directive.expression,
        ctx.expressionPos,
        document.uri,
        position.line,
        text,
      );
      return items.map(toLSPCompletion);
    } catch (err) {
      connection.console.error(`velin: completion failed: ${err}`);
      return [];
    }
  }

  // Not in an expression — completions for directive names.
  const beforeCursor = line.substring(0, position.character);

  const partialAttrMatch = beforeCursor.match(/\s(v[\w-]*)$/);
  if (partialAttrMatch) {
    const partial = partialAttrMatch[1];
    const elCtx = elementContextAt(document, document.offsetAt(position));
    const candidates = getDirectiveCompletions(elCtx);
    const filtered = candidates.filter((i) => i.label.startsWith(partial));
    const list = filtered.length ? filtered : candidates;
    return list.map((item) => ({
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

  if (/vln-[\w-]*$/.test(beforeCursor)) {
    return getDirectiveCompletions(elementContextAt(document, document.offsetAt(position)));
  }
  return [];
});

connection.onCompletionResolve((item: LSPCompletionItem) => item);

// ── Go to definition ──────────────────────────────────────────────────────

connection.onDefinition(async (params) => {
  if (!enabled) return null;
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const line = getLine(document, params.position.line);
  const ctx = directiveParser.isInDirectiveExpression(line, params.position.character);
  if (!ctx) return null;

  const text = document.getText();
  const schemaRef = firstSchemaRef(text, params.position.line);
  if (!schemaRef) return null;

  try {
    const loc = await tsService.getDefinition(
      schemaRef,
      ctx.directive.expression,
      ctx.expressionPos,
      document.uri,
      params.position.line,
      text,
    );
    return loc ? { uri: loc.uri, range: loc.range } : null;
  } catch (err) {
    connection.console.error(`velin: definition failed: ${err}`);
    return null;
  }
});

// ── Semantic tokens ───────────────────────────────────────────────────────

interface RootTypeCtx {
  program: ts.Program;
  checker: ts.TypeChecker;
  rootType: ts.Type;
  members: Map<string, 'method' | 'property'>;
}

// Bounded LRUs so a long-lived LSP that has cycled through hundreds of docs
// doesn't leak forever. The rootTypeCache is keyed by document URI +
// serialised schema reference: a single doc with multiple `@velin-schema`
// regions gets an entry per region, and identical schemas across docs share.
// Values are Promises so concurrent hits during in-flight resolution dedupe.
const MAX_DOC_CACHE_ENTRIES = 128;
const rootTypeCache = new Map<string, Promise<RootTypeCtx | null>>();

function rootTypeCacheKey(uri: string, ref: VelinSchemaReference): string {
  // URI has to be part of the key because inline-script sources and
  // relative-path resolves are anchored to the owning document.
  return `${uri}::${JSON.stringify(ref)}`;
}

function getRootCtxForRef(uri: string, ref: VelinSchemaReference | null): Promise<RootTypeCtx | null> {
  if (!ref) return Promise.resolve(null);
  const key = rootTypeCacheKey(uri, ref);
  const hit = rootTypeCache.get(key);
  if (hit) return hit;
  const p = buildRootCtx(ref, uri);
  setDocCache(rootTypeCache, key, p);
  return p;
}

function setDocCache<V>(map: Map<string, V>, uri: string, value: V): void {
  if (map.has(uri)) map.delete(uri);
  else if (map.size >= MAX_DOC_CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(uri, value);
}

// Cheap per-version parse: one scanElements pass, derive whatever else the
// hot paths need. Kills the per-keystroke rescans and the regex-over-text
// scope-var extraction.
interface ParsedDoc {
  version: number;
  elements: ScannedElement[];
  scopeVarNames: Set<string>;
}
const parsedDocCache = new Map<string, ParsedDoc>();

function getParsedDoc(document: TextDocument): ParsedDoc {
  const cached = parsedDocCache.get(document.uri);
  if (cached && cached.version === document.version) return cached;

  const elements = Array.from(scanElements(document.getText()));
  const scopeVarNames = new Set<string>();
  for (const el of elements) {
    for (const attr of el.attributes) {
      if (!attr.name.startsWith('vln-')) continue;
      const colon = attr.name.indexOf(':');
      if (colon < 0) continue;
      const prefix = attr.name.slice(0, colon);
      if (prefix !== 'vln-loop' && prefix !== 'vln-var') continue;
      const key = attr.name.slice(colon + 1);
      if (key) scopeVarNames.add(key);
    }
  }
  scopeVarNames.add('$index');

  const parsed: ParsedDoc = { version: document.version, elements, scopeVarNames };
  setDocCache(parsedDocCache, document.uri, parsed);
  return parsed;
}

function findElementAtCached(elements: ScannedElement[], offset: number): ScannedElement | null {
  let best: ScannedElement | null = null;
  for (const el of elements) {
    if (el.start > offset) break;
    if (offset < el.openEnd) best = el;
  }
  return best;
}

connection.languages.semanticTokens.on(async (params: SemanticTokensParams): Promise<SemanticTokens> => {
  if (!enabled) return { data: [] };
  const document = documents.get(params.textDocument.uri);
  if (!document) return { data: [] };

  try {
    const text = document.getText();
    const scopeVars = getParsedDoc(document).scopeVarNames;
    const lines = text.split('\n');

    // Build a schema-per-line table in one forward pass: a comment on line i
    // starts a new active schema; every subsequent line inherits it until the
    // next comment. This lets multi-schema docs colour each region against
    // the right root type instead of blanket-using the first schema.
    const schemaByLine: Array<VelinSchemaReference | null> = new Array(lines.length);
    let current: VelinSchemaReference | null = null;
    for (let i = 0; i < lines.length; i++) {
      if (schemaParser.parseSchemaComment(lines[i])) {
        current = schemaParser.findSchemaContext(text, i).schemaRef;
      }
      schemaByLine[i] = current;
    }

    // Resolve each unique schema once per request (buildRootCtx is memoised
    // globally in rootTypeCache too; this local map dedupes the awaits).
    const ctxByKey = new Map<string, Promise<RootTypeCtx | null>>();
    const ctxAt = (line: number): Promise<RootTypeCtx | null> => {
      const ref = schemaByLine[line];
      if (!ref) return Promise.resolve(null);
      const key = rootTypeCacheKey(document.uri, ref);
      let p = ctxByKey.get(key);
      if (!p) {
        p = getRootCtxForRef(document.uri, ref);
        ctxByKey.set(key, p);
      }
      return p;
    };

    const tokens: Array<{ line: number; start: number; length: number; type: number }> = [];
    for (let li = 0; li < lines.length; li++) {
      const directives = directiveParser.findDirectivesInLine(lines[li], li);
      if (directives.length === 0) continue;
      const rootCtx = await ctxAt(li);
      for (const d of directives) {
        tokens.push(
          ...tokenizeExpression(d.expression, li, d.expressionStart, rootCtx, scopeVars),
        );
      }
    }

    const data: number[] = [];
    let prevLine = 0, prevStart = 0;
    for (const t of tokens) {
      const deltaLine = t.line - prevLine;
      const deltaStart = deltaLine === 0 ? t.start - prevStart : t.start;
      data.push(deltaLine, deltaStart, t.length, t.type, /* modifiers */ 0);
      prevLine = t.line;
      prevStart = t.start;
    }
    return { data };
  } catch (err) {
    connection.console.error(`velin: semantic tokens failed: ${err}`);
    return { data: [] };
  }
});

async function buildRootCtx(schemaRef: VelinSchemaReference, uri: string): Promise<RootTypeCtx | null> {
  const resolved = await tsService.resolveRootType(schemaRef, uri);
  if (!resolved) return null;
  const checker = resolved.program.getTypeChecker();
  const members = new Map<string, 'method' | 'property'>();
  for (const prop of checker.getPropertiesOfType(resolved.rootType)) {
    const decl = prop.valueDeclaration ?? prop.declarations?.[0];
    if (!decl) continue;
    const t = checker.getTypeOfSymbolAtLocation(prop, decl);
    const callable = checker.getSignaturesOfType(t, ts.SignatureKind.Call).length > 0;
    members.set(prop.getName(), callable ? 'method' : 'property');
  }
  return { program: resolved.program, checker, rootType: resolved.rootType, members };
}

function tokenizeExpression(
  expression: string,
  line: number,
  startChar: number,
  rootCtx: RootTypeCtx | null,
  scopeVars: Set<string>,
): Array<{ line: number; start: number; length: number; type: number }> {
  const out: Array<{ line: number; start: number; length: number; type: number }> = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, expression,
  );
  scanner.resetTokenState(0);

  interface Tok { kind: ts.SyntaxKind; text: string; start: number; end: number; }
  const toks: Tok[] = [];
  while (true) {
    const kind = scanner.scan();
    if (kind === ts.SyntaxKind.EndOfFileToken) break;
    toks.push({
      kind,
      text: scanner.getTokenText(),
      start: scanner.getTokenStart(),
      end: scanner.getTokenEnd(),
    });
  }

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const type = classifyToken(t, toks[i - 1], toks[i + 1], rootCtx, scopeVars);
    if (type === null) continue;
    out.push({ line, start: startChar + t.start, length: t.end - t.start, type });
  }
  return out;
}

function classifyToken(
  t: { kind: ts.SyntaxKind; text: string },
  prev: { kind: ts.SyntaxKind } | undefined,
  next: { kind: ts.SyntaxKind } | undefined,
  rootCtx: RootTypeCtx | null,
  scopeVars: Set<string>,
): number | null {
  if (t.kind === ts.SyntaxKind.Identifier) {
    const prevIsDot = prev?.kind === ts.SyntaxKind.DotToken;
    const nextIsCall = next?.kind === ts.SyntaxKind.OpenParenToken;
    if (prevIsDot) return nextIsCall ? TT.METHOD : TT.PROPERTY;
    if (scopeVars.has(t.text)) return TT.PARAMETER;
    const rootMember = rootCtx?.members.get(t.text);
    if (rootMember) return rootMember === 'method' ? TT.METHOD : TT.PROPERTY;
    if (nextIsCall) return TT.FUNCTION;
    return TT.VARIABLE;
  }
  if (isKeywordKind(t.kind)) return TT.KEYWORD;
  if (
    t.kind === ts.SyntaxKind.StringLiteral ||
    t.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
    t.kind === ts.SyntaxKind.TemplateHead ||
    t.kind === ts.SyntaxKind.TemplateMiddle ||
    t.kind === ts.SyntaxKind.TemplateTail
  ) return TT.STRING;
  if (t.kind === ts.SyntaxKind.NumericLiteral) return TT.NUMBER;
  if (isPunctuationKind(t.kind)) return TT.OPERATOR;
  return null;
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

// ── Helpers ────────────────────────────────────────────────────────────────

function getLine(document: TextDocument, line: number): string {
  return document.getText({
    start: { line, character: 0 },
    end: { line, character: Number.MAX_SAFE_INTEGER },
  });
}

/**
 * Return the first schema reference at or before `line`. Scans backwards
 * from `line` first (nearest wins), then forwards for the fallback. Doing
 * findSchemaContext at every forward line would be O(N²); once we know the
 * first matching line we call findSchemaContext once.
 */
function firstSchemaRef(text: string, line: number): VelinSchemaReference | null {
  const nearest = schemaParser.findSchemaContext(text, line).schemaRef;
  if (nearest) return nearest;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (schemaParser.parseSchemaComment(lines[i])) {
      return schemaParser.findSchemaContext(text, i).schemaRef;
    }
  }
  return null;
}

function elementContextAt(
  document: TextDocument,
  offset: number,
): { tagName: string; siblings: string[] } | null {
  const el = findElementAtCached(getParsedDoc(document).elements, offset);
  if (!el) return null;
  return {
    tagName: el.tagName.toLowerCase(),
    siblings: el.attributes.map((a) => a.name.toLowerCase()),
  };
}

async function getSchemaCompletions(
  schemaRef: VelinSchemaReference,
  expression: string,
  cursorPos: number,
  documentUri: string,
  currentLine: number,
  documentText: string,
): Promise<CompletionItem[]> {
  switch (schemaRef.type) {
    case 'typescript':
    case 'global-type':
    case 'inline-script':
      return tsService.getCompletions(schemaRef, expression, cursorPos, documentUri, currentLine, documentText);
    case 'jsdoc':
      return tsService.getJSDocCompletions(schemaRef, expression, cursorPos, documentUri);
    default:
      // 'json' / 'inline' are recognised by the parser but not yet supported.
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

function toLSPCompletion(c: CompletionItem): LSPCompletionItem {
  return {
    label: c.label,
    kind: mapCompletionKind(c.kind),
    detail: c.detail,
    documentation: c.documentation,
    insertText: c.insertText,
    sortText: c.sortText,
    data: c.label,
  };
}

// Shared and LSP CompletionItemKind share numeric values 1..18 — cast directly.
function mapCompletionKind(kind: CompletionItemKind): LSPCompletionItemKind {
  return kind as unknown as LSPCompletionItemKind;
}

documents.listen(connection);
connection.listen();
