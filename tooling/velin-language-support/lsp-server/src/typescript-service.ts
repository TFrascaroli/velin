import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import { URI } from 'vscode-uri';
import {
  CompletionItem,
  CompletionItemKind,
  VelinSchemaReference,
  enclosingElementsAt,
} from '@velin/shared';

export interface DefinitionLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export type Hop =
  | { kind: 'prop'; name: string }
  | { kind: 'call' }
  | { kind: 'index' };

interface ExpressionContext {
  path: string[];
  currentPart: string;
}

interface ProgramEntry {
  program: ts.Program;
  /** Owning document URI, when the entry is tied to a single doc (inline). */
  ownerUri?: string;
}

const INLINE_SCRIPT_FILENAME = '__velin_inline__.ts';
const DEFAULT_MAX_INLINE_PROGRAMS = 32;
const DEFAULT_MAX_FILE_BACKED_PROGRAMS = 64;

export interface TypeScriptServiceOptions {
  maxInlinePrograms?: number;
  maxFileBackedPrograms?: number;
}

// Directories that never contain hand-written source we care about. Skipped
// during the recursive workspace walk to avoid dragging in output artefacts.
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage',
  '.git', '.next', '.turbo', '.cache', '.vercel', '.parcel-cache',
]);

/**
 * TypeScript-backed schema completion, definition, and root-type resolution.
 * Program cache is size-bounded (LRU) and invalidatable per document.
 */
export class TypeScriptService {
  // Two separate LRUs: file-backed programs (whose inputs live on disk) and
  // inline programs (whose key includes a hash of document content). Inline
  // grows fast when the user edits a <script>; separating them stops the
  // inline churn from evicting the shared project program.
  private fileBackedPrograms = new Map<string, ProgramEntry>();
  private inlinePrograms = new Map<string, ProgramEntry>();
  /** Workspace folder fsPaths advertised at initialize. May be updated live. */
  private workspaceFolders: string[] = [];
  private readonly maxFileBackedPrograms: number;
  private readonly maxInlinePrograms: number;

  constructor(options: TypeScriptServiceOptions = {}) {
    this.maxFileBackedPrograms = options.maxFileBackedPrograms ?? DEFAULT_MAX_FILE_BACKED_PROGRAMS;
    this.maxInlinePrograms = options.maxInlinePrograms ?? DEFAULT_MAX_INLINE_PROGRAMS;
  }

  setWorkspaceFolders(folders: string[]): void {
    this.workspaceFolders = folders.slice();
    // Root-picking changed; existing file-backed programs may be stale.
    this.invalidateFileBackedPrograms();
  }

  async getCompletions(
    schemaRef: VelinSchemaReference,
    expression: string,
    cursorPos: number,
    documentUri: string,
    currentLine?: number,
    documentText?: string,
  ): Promise<CompletionItem[]> {
    const resolved = await this.resolveRootType(schemaRef, documentUri);
    if (!resolved) return [];
    const ctx = parseExpression(expression, cursorPos);
    const scopeVars = analyzeScope(documentUri, currentLine, documentText);
    return completionsFromRootType(resolved.program, resolved.rootType, ctx, scopeVars);
  }

  /** JSDoc types live in .js files — the same TS checker path handles them. */
  async getJSDocCompletions(
    schemaRef: VelinSchemaReference,
    expression: string,
    cursorPos: number,
    documentUri: string,
  ): Promise<CompletionItem[]> {
    return this.getCompletions(schemaRef, expression, cursorPos, documentUri);
  }

  /**
   * Resolve the identifier at `cursorPos` inside `expression` to its
   * declaration. Handles `.prop`, `[idx]`, and `foo()` hops.
   */
  async getDefinition(
    schemaRef: VelinSchemaReference,
    expression: string,
    cursorPos: number,
    documentUri: string,
    _currentLine?: number,
    documentText?: string,
  ): Promise<DefinitionLocation | null> {
    const chain = extractHopsAt(expression, cursorPos);
    if (!chain) return null;

    const resolved = await this.resolveRootType(schemaRef, documentUri);
    if (!resolved) return null;
    const { program, rootType } = resolved;
    const checker = program.getTypeChecker();
    const scope = analyzeScope(documentUri, _currentLine, documentText);

    let currentType = rootType;
    const rootName = chain.root;

    if (scope[rootName]?.type === 'array item') {
      const arrayExpr = scope[rootName].sourceExpr;
      if (arrayExpr) {
        const arrayType = resolveExpressionType(checker, rootType, arrayExpr, scope);
        const elem = arrayType ? elementTypeOf(checker, arrayType) : undefined;
        if (elem) currentType = elem;
      }
    } else {
      const rootProp = currentType.getProperty(rootName);
      if (!rootProp) return null;
      if (chain.hops.length === 0) {
        const decl = rootProp.declarations?.[0] ?? rootProp.valueDeclaration;
        return decl ? locationOfDecl(decl, schemaRef, { uri: documentUri, text: documentText }) : null;
      }
      if (!rootProp.valueDeclaration) return null;
      currentType = checker.getTypeOfSymbolAtLocation(rootProp, rootProp.valueDeclaration);
    }

    let targetDecl: ts.Declaration | undefined;
    for (let i = 0; i < chain.hops.length; i++) {
      const hop = chain.hops[i];
      const isLast = i === chain.hops.length - 1;

      if (hop.kind === 'prop') {
        const prop = currentType.getProperty(hop.name);
        if (!prop) return null;
        if (isLast) {
          targetDecl = prop.declarations?.[0] ?? prop.valueDeclaration;
          break;
        }
        if (!prop.valueDeclaration) return null;
        currentType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration);
      } else if (hop.kind === 'call') {
        const sig = checker.getSignaturesOfType(currentType, ts.SignatureKind.Call)[0];
        if (!sig) return null;
        currentType = checker.getNonNullableType(sig.getReturnType());
      } else {
        const elem =
          checker.getIndexTypeOfType(currentType, ts.IndexKind.Number) ??
          checker.getIndexTypeOfType(currentType, ts.IndexKind.String) ??
          getTypeArgs(currentType)[0];
        if (!elem) return null;
        currentType = checker.getNonNullableType(elem);
      }
    }

    if (!targetDecl) return null;
    return locationOfDecl(targetDecl, schemaRef, { uri: documentUri, text: documentText });
  }

  /**
   * Resolve a schema reference to its `ts.Program` + root `ts.Type`. Handles
   * every supported schema variant.
   */
  async resolveRootType(
    schemaRef: VelinSchemaReference,
    documentUri: string,
  ): Promise<{ program: ts.Program; rootType: ts.Type } | null> {
    if (schemaRef.type === 'inline-script') {
      if (!schemaRef.source && !schemaRef.linkedPath) return null;
      return this.compileInlineScript(documentUri, schemaRef);
    }

    const workspaceRoot = getWorkspaceRoot(documentUri, this.workspaceFolders);
    let program: ts.Program;
    let sourceFile: ts.SourceFile | undefined;
    let typeSymbol: ts.Symbol | undefined;

    if (schemaRef.type === 'global-type') {
      program = await this.getOrCreateProjectProgram(workspaceRoot);
      for (const sf of program.getSourceFiles()) {
        if (sf.isDeclarationFile) continue;
        typeSymbol = findTypeSymbol(program, sf, schemaRef.typeName ?? '');
        if (typeSymbol) break;
      }
    } else {
      if (!schemaRef.source) return null;
      const schemaFilePath = path.resolve(
        path.dirname(URI.parse(documentUri).fsPath),
        schemaRef.source,
      );
      if (!(await pathExists(schemaFilePath))) return null;
      program = this.getOrCreateProgram(workspaceRoot, schemaFilePath);
      sourceFile = program.getSourceFile(schemaFilePath);
      if (!sourceFile) return null;
      typeSymbol = findTypeSymbol(program, sourceFile, schemaRef.typeName ?? 'default');
    }
    if (!typeSymbol) return null;

    const checker = program.getTypeChecker();
    const rootType =
      typeSymbol.flags & ts.SymbolFlags.Interface
        ? checker.getDeclaredTypeOfSymbol(typeSymbol)
        : typeSymbol.valueDeclaration
          ? checker.getTypeOfSymbolAtLocation(typeSymbol, typeSymbol.valueDeclaration)
          : checker.getDeclaredTypeOfSymbol(typeSymbol);
    return { program, rootType };
  }

  /** Evict cache entries owned by a specific document (e.g. on close). */
  invalidateDocument(documentUri: string): void {
    for (const map of [this.fileBackedPrograms, this.inlinePrograms]) {
      for (const [key, entry] of map) {
        if (entry.ownerUri === documentUri) map.delete(key);
      }
    }
  }

  /** Nuke everything — the safe response to a watched-file change. */
  invalidateAll(): void {
    this.fileBackedPrograms.clear();
    this.inlinePrograms.clear();
  }

  /**
   * Evict only the file-backed programs. Inline entries (keyed by document
   * content hash) are unaffected by disk changes and stay put.
   */
  invalidateFileBackedPrograms(): void {
    this.fileBackedPrograms.clear();
  }

  private async getOrCreateProjectProgram(workspaceRoot: string): Promise<ts.Program> {
    const key = `project:${workspaceRoot}`;
    const hit = touchLru(this.fileBackedPrograms, key);
    if (hit) return hit.program;
    const files = await getAllSourceFiles(workspaceRoot);
    const program = ts.createProgram(files, getCompilerOptions(workspaceRoot));
    setLru(this.fileBackedPrograms, key, { program }, this.maxFileBackedPrograms);
    return program;
  }

  private getOrCreateProgram(workspaceRoot: string, schemaFilePath: string): ts.Program {
    const key = `${workspaceRoot}:${schemaFilePath}`;
    const hit = touchLru(this.fileBackedPrograms, key);
    if (hit) return hit.program;
    const program = ts.createProgram([schemaFilePath], getCompilerOptions(workspaceRoot));
    setLru(this.fileBackedPrograms, key, { program }, this.maxFileBackedPrograms);
    return program;
  }

  private async compileInlineScript(
    documentUri: string,
    schemaRef: VelinSchemaReference,
  ): Promise<{ program: ts.Program; rootType: ts.Type } | null> {
    const linked = schemaRef.linkedPath
      ? await resolveLinkedScript(documentUri, schemaRef.linkedPath)
      : null;

    const filename = linked?.absPath ?? INLINE_SCRIPT_FILENAME;
    const scriptBody = linked?.body ?? schemaRef.source ?? '';
    const key = `inline:${documentUri}:${filename}:${hashString(scriptBody)}`;

    const hit = touchLru(this.inlinePrograms, key);
    if (hit) {
      const sf = hit.program.getSourceFile(filename);
      if (sf) {
        const rootType = findInlineRootType(hit.program, sf);
        if (rootType) return { program: hit.program, rootType };
      }
    }

    const options: ts.CompilerOptions = {
      allowJs: true, checkJs: false,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      noLib: false, skipLibCheck: true, strict: false,
    };

    // Inline blocks lack the Velin runtime — inject a prelude so
    // `Velin.bind(...)` parses. Linked files are real modules and don't need it.
    const prelude = linked
      ? ''
      : `declare const Velin: { bind(el: unknown, state: any): unknown };\n`;
    const fullSource = prelude + scriptBody;
    const sourceFile = ts.createSourceFile(
      filename, fullSource, ts.ScriptTarget.ES2020, true,
      filename.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS,
    );

    const host = ts.createCompilerHost(options, true);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, langVersion, onErr, shouldCreate) =>
      fileName === filename
        ? sourceFile
        : originalGetSourceFile(fileName, langVersion, onErr, shouldCreate);
    host.fileExists = (fileName) => fileName === filename || ts.sys.fileExists(fileName);
    host.readFile = (fileName) => (fileName === filename ? fullSource : ts.sys.readFile(fileName));

    const program = ts.createProgram([filename], options, host);
    setLru(this.inlinePrograms, key, { program, ownerUri: documentUri }, this.maxInlinePrograms);

    const rootType = findInlineRootType(program, sourceFile);
    return rootType ? { program, rootType } : null;
  }
}

// ── Tiny LRU on any insertion-ordered Map ──────────────────────────────────

function touchLru<K, V>(map: Map<K, V>, key: K): V | undefined {
  const v = map.get(key);
  if (v === undefined) return undefined;
  map.delete(key);
  map.set(key, v);
  return v;
}

function setLru<K, V>(map: Map<K, V>, key: K, value: V, capacity: number): void {
  if (map.has(key)) map.delete(key);
  else if (map.size >= capacity) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

// ── Free helpers (stateless) ────────────────────────────────────────────────

function getCompilerOptions(workspaceRoot: string): ts.CompilerOptions {
  const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
  const fallback: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    allowJs: true, checkJs: false, strict: false,
  };
  if (!fs.existsSync(tsconfigPath)) return fallback;
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) return fallback;
  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, workspaceRoot).options;
}

function getWorkspaceRoot(documentUri: string, folders: string[] = []): string {
  try {
    const docFsPath = URI.parse(documentUri).fsPath;

    // 1. Prefer the longest advertised workspace folder that contains the doc.
    if (folders.length) {
      let best: string | null = null;
      for (const f of folders) {
        if (isPathPrefix(f, docFsPath) && (!best || f.length > best.length)) best = f;
      }
      if (best) return best;
    }

    // 2. Fallback: walk up looking for a project marker (single-file editing).
    const start = path.dirname(docFsPath);
    let current = start;
    for (let i = 0; i < 20; i++) {
      if (
        fs.existsSync(path.join(current, 'package.json')) ||
        fs.existsSync(path.join(current, 'tsconfig.json'))
      ) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return start;
  } catch {
    return process.cwd();
  }
}

function isPathPrefix(parent: string, child: string): boolean {
  const norm = (p: string) => path.resolve(p).replace(/[/\\]+$/, '');
  const p = norm(parent);
  const c = norm(child);
  if (c === p) return true;
  return c.startsWith(p + path.sep);
}

const MAX_WALK_DEPTH = 12;

async function getAllSourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string, depth: number): Promise<void> => {
    if (depth > MAX_WALK_DEPTH) return;
    let items: fs.Dirent[];
    try { items = await fsp.readdir(d, { withFileTypes: true }); }
    catch { return; }
    const subdirs: string[] = [];
    for (const item of items) {
      if (item.name.startsWith('.') || SKIP_DIRS.has(item.name)) continue;
      const full = path.join(d, item.name);
      if (item.isDirectory()) subdirs.push(full);
      else if (item.isFile() && /\.(ts|js)$/.test(item.name)) out.push(full);
    }
    // Walk subdirectories in parallel — the OS parallelises the readdir
    // syscalls and the walk stays single-writer to `out`.
    await Promise.all(subdirs.map((s) => walk(s, depth + 1)));
  };
  await walk(dir, 0);
  return out;
}

async function pathExists(p: string): Promise<boolean> {
  try { await fsp.access(p); return true; }
  catch { return false; }
}

function findTypeSymbol(
  program: ts.Program,
  sourceFile: ts.SourceFile,
  typeName: string,
): ts.Symbol | undefined {
  const checker = program.getTypeChecker();
  for (const stmt of sourceFile.statements) {
    if (
      (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isClassDeclaration(stmt)) &&
      stmt.name?.getText() === typeName
    ) return checker.getSymbolAtLocation(stmt.name);

    if (ts.isExportAssignment(stmt) && typeName === 'default') {
      const sym = checker.getSymbolAtLocation(stmt.expression);
      if (sym) return sym;
    }
  }
  return undefined;
}

function parseExpression(expression: string, cursorPos: number): ExpressionContext {
  const parts = expression.substring(0, cursorPos).split('.');
  return { path: parts.slice(0, -1), currentPart: parts[parts.length - 1] ?? '' };
}

function completionsFromRootType(
  program: ts.Program,
  rootType: ts.Type,
  ctx: ExpressionContext,
  scopeVars: Record<string, ScopeVar>,
): CompletionItem[] {
  const checker = program.getTypeChecker();
  let currentType = rootType;

  for (const part of ctx.path) {
    const scoped = scopeVars[part];
    if (scoped) {
      if (scoped.type === 'array item' && scoped.sourceExpr) {
        const arrayType = resolveExpressionType(checker, rootType, scoped.sourceExpr, scopeVars);
        const elem = arrayType ? elementTypeOf(checker, arrayType) : undefined;
        if (!elem) return [];
        currentType = elem;
      }
      continue;
    }
    const property = currentType.getProperty(part);
    if (!property?.valueDeclaration) return [];
    currentType = checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration);
  }

  const out: CompletionItem[] = [];

  // Root level: mix scope vars into the completion list.
  if (ctx.path.length === 0) {
    for (const [name, info] of Object.entries(scopeVars)) {
      if (ctx.currentPart && !name.startsWith(ctx.currentPart)) continue;
      out.push({
        label: name,
        kind: CompletionItemKind.Variable,
        detail: info.detail ?? `${name}: ${info.type ?? 'any'}`,
        documentation: info.documentation,
        insertText: name,
      });
    }
  }

  for (const prop of checker.getPropertiesOfType(currentType)) {
    const name = prop.getName();
    if (ctx.currentPart && !name.startsWith(ctx.currentPart)) continue;
    if (!prop.valueDeclaration) continue;
    const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration);
    const signatures = checker.getSignaturesOfType(propType, ts.SignatureKind.Call);
    const isMethod = signatures.length > 0;

    const detail = isMethod && signatures[0]
      ? name + checker.signatureToString(signatures[0])
      : `${name}: ${checker.typeToString(propType)}`;

    out.push({
      label: name,
      kind: isMethod ? CompletionItemKind.Method : CompletionItemKind.Property,
      detail,
      documentation: symbolDoc(checker, prop),
      insertText: isMethod ? `${name}()` : name,
    });
  }
  return out;
}

function symbolDoc(checker: ts.TypeChecker, symbol: ts.Symbol): string | undefined {
  const parts = symbol.getDocumentationComment(checker);
  return parts.length ? ts.displayPartsToString(parts) : undefined;
}

/** Element type of an array-like type (T[] / ReadonlyArray<T> / tuple). */
function elementTypeOf(checker: ts.TypeChecker, arrayType: ts.Type): ts.Type | undefined {
  return (
    checker.getIndexTypeOfType(arrayType, ts.IndexKind.Number) ??
    getTypeArgs(arrayType)[0]
  );
}

/**
 * Resolve a dotted expression (e.g. `u.orders`) to a `ts.Type`, walking scope
 * variables when the head references one. Used to type the RHS of `vln-loop`
 * so nested loops (`vln-loop:o="u.orders"`) resolve their element type.
 */
function resolveExpressionType(
  checker: ts.TypeChecker,
  rootType: ts.Type,
  expr: string,
  scope: Record<string, ScopeVar>,
): ts.Type | undefined {
  const parts = expr.split('.').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  const [head, ...rest] = parts;

  let type: ts.Type | undefined;
  const scoped = scope[head];
  if (scoped?.type === 'array item' && scoped.sourceExpr) {
    const parent = resolveExpressionType(checker, rootType, scoped.sourceExpr, scope);
    type = parent ? elementTypeOf(checker, parent) : undefined;
  } else {
    const prop = rootType.getProperty(head);
    if (!prop?.valueDeclaration) return undefined;
    type = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration);
  }

  for (const p of rest) {
    if (!type) return undefined;
    const prop = type.getProperty(p);
    if (!prop?.valueDeclaration) return undefined;
    type = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration);
  }
  return type;
}

/** Reach into internal `.typeArguments` on a type — isolated so we cast once. */
function getTypeArgs(t: ts.Type): readonly ts.Type[] {
  return (t as unknown as { typeArguments?: readonly ts.Type[] }).typeArguments ?? [];
}

async function resolveLinkedScript(
  documentUri: string,
  src: string,
): Promise<{ absPath: string; body: string } | null> {
  if (/^https?:/i.test(src) || src.startsWith('//')) return null;
  try {
    const docPath = URI.parse(documentUri).fsPath;
    const absPath = path.resolve(path.dirname(docPath), src);
    const body = await fsp.readFile(absPath, 'utf8');
    return { absPath, body };
  } catch {
    return null;
  }
}

// ── Scope analysis ─────────────────────────────────────────────────────────

export interface ScopeVar {
  type: 'array item' | 'template variable' | 'number';
  detail?: string;
  documentation?: string;
  /** For array-item vars: the source array expression from vln-loop. */
  sourceExpr?: string;
}

/**
 * Collect the scope variables in effect at `lineNumber`. Uses the element
 * tree — every enclosing `<div vln-loop:x="…">` above the cursor contributes
 * `x` to the scope, and inner declarations shadow outer ones.
 */
function analyzeScope(
  documentUri: string,
  lineNumber?: number,
  documentText?: string,
): Record<string, ScopeVar> {
  if (lineNumber === undefined) return {};
  const content = documentText ?? readDocFromDisk(documentUri);
  if (!content) return {};

  const offset = offsetOfLine(content, lineNumber);
  const ancestors = enclosingElementsAt(content, offset);
  const scope: Record<string, ScopeVar> = {};
  let hasLoop = false;

  // Outer→inner. Inner attrs overwrite outer for correct shadowing.
  for (const el of ancestors) {
    for (const attr of el.attributes) {
      if (attr.value === undefined) continue;
      const colon = attr.name.indexOf(':');
      if (colon < 0) continue;
      const prefix = attr.name.slice(0, colon);
      const key = attr.name.slice(colon + 1);
      if (!key) continue;

      if (prefix === 'vln-loop') {
        scope[key] = {
          type: 'array item',
          detail: `${key} (from ${attr.value})`,
          documentation: `Loop variable from vln-loop:${key}="${attr.value}"`,
          sourceExpr: attr.value,
        };
        hasLoop = true;
      } else if (prefix === 'vln-var') {
        scope[key] = {
          type: 'template variable',
          detail: `${key} (from ${attr.value})`,
          documentation: `Template variable from vln-var:${key}="${attr.value}"`,
        };
      }
    }
  }
  if (hasLoop && !scope['$index']) {
    scope['$index'] = {
      type: 'number',
      detail: '$index: number',
      documentation: 'Current iteration index in vln-loop',
    };
  }
  return scope;
}

function readDocFromDisk(documentUri: string): string | null {
  try {
    const p = URI.parse(documentUri).fsPath;
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  } catch {
    return null;
  }
}

function offsetOfLine(text: string, line: number): number {
  if (line <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      seen++;
      if (seen === line) return i + 1;
    }
  }
  return text.length;
}

// ── Inline-script root inference ───────────────────────────────────────────

function findInlineRootType(program: ts.Program, sf: ts.SourceFile): ts.Type | undefined {
  const checker = program.getTypeChecker();
  let bindStateNode: ts.Expression | undefined;

  const visit = (node: ts.Node) => {
    if (!bindStateNode &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'Velin' &&
      node.expression.name.text === 'bind' &&
      node.arguments.length >= 2
    ) {
      bindStateNode = node.arguments[1];
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (bindStateNode) return checker.getTypeAtLocation(bindStateNode);

  // Fallback: first top-level `const x = { ... }`.
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (d.initializer && ts.isObjectLiteralExpression(d.initializer)) {
        return checker.getTypeAtLocation(d.initializer);
      }
    }
  }
  return undefined;
}

// ── Location translation ──────────────────────────────────────────────────

function locationOfDecl(
  decl: ts.Declaration,
  schemaRef: VelinSchemaReference,
  htmlContext?: { uri: string; text?: string },
): DefinitionLocation | null {
  const sf = decl.getSourceFile();

  if (
    schemaRef.type === 'inline-script' &&
    schemaRef.sourceOffset !== undefined &&
    sf.fileName === INLINE_SCRIPT_FILENAME &&
    htmlContext
  ) {
    // Positions are (preludeLen + scriptOffset). Translate back to HTML coords.
    const preludeLen = sf.text.length - (schemaRef.source?.length ?? 0);
    const declStart = decl.getStart();
    if (declStart < preludeLen) return null;
    const htmlStart = schemaRef.sourceOffset + (declStart - preludeLen);
    const htmlEnd = schemaRef.sourceOffset + (decl.getEnd() - preludeLen);

    const text = htmlContext.text ?? readFileOrEmpty(htmlContext.uri);
    if (!text) return null;
    return {
      uri: htmlContext.uri,
      range: {
        start: offsetToLineCol(text, htmlStart),
        end: offsetToLineCol(text, htmlEnd),
      },
    };
  }

  const start = sf.getLineAndCharacterOfPosition(decl.getStart());
  const end = sf.getLineAndCharacterOfPosition(decl.getEnd());
  return {
    uri: URI.file(sf.fileName).toString(),
    range: {
      start: { line: start.line, character: start.character },
      end: { line: end.line, character: end.character },
    },
  };
}

function readFileOrEmpty(uri: string): string {
  try { return fs.readFileSync(URI.parse(uri).fsPath, 'utf8'); }
  catch { return ''; }
}

function offsetToLineCol(text: string, offset: number): { line: number; character: number } {
  let line = 0, lineStart = 0;
  const limit = Math.min(offset, text.length);
  for (let i = 0; i < limit; i++) {
    if (text.charCodeAt(i) === 10) { line++; lineStart = i + 1; }
  }
  return { line, character: offset - lineStart };
}

// ── Hashing ────────────────────────────────────────────────────────────────

function hashString(s: string): string {
  // FNV-1a 32-bit. Cheap and stable.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

// ── Public AST walk (used by server for definitions) ──────────────────────

/**
 * AST-based expression walk. Given `getCurrentUser().name` with cursor on
 * `name`, returns `{ root: 'getCurrentUser', hops: [call, prop:name] }`.
 * Supports property access, call expressions, and element access.
 */
export function extractHopsAt(
  expression: string,
  cursorPos: number,
): { root: string; hops: Hop[] } | null {
  const sf = ts.createSourceFile('_expr.ts', expression, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  let hit: ts.Identifier | undefined;
  const findAt = (node: ts.Node) => {
    if (hit) return;
    if (cursorPos < node.getStart(sf) || cursorPos > node.getEnd()) return;
    if (ts.isIdentifier(node)) hit = node;
    ts.forEachChild(node, findAt);
  };
  findAt(sf);
  if (!hit) return null;

  let chainEnd: ts.Expression = hit;
  if (hit.parent && ts.isPropertyAccessExpression(hit.parent) && hit.parent.name === hit) {
    chainEnd = hit.parent;
  }
  return analyzeChain(chainEnd);
}

function analyzeChain(node: ts.Expression): { root: string; hops: Hop[] } | null {
  if (ts.isIdentifier(node)) return { root: node.text, hops: [] };
  if (ts.isPropertyAccessExpression(node)) {
    const inner = analyzeChain(node.expression);
    if (!inner) return null;
    inner.hops.push({ kind: 'prop', name: node.name.text });
    return inner;
  }
  if (ts.isCallExpression(node)) {
    const inner = analyzeChain(node.expression);
    if (!inner) return null;
    inner.hops.push({ kind: 'call' });
    return inner;
  }
  if (ts.isElementAccessExpression(node)) {
    const inner = analyzeChain(node.expression);
    if (!inner) return null;
    inner.hops.push({ kind: 'index' });
    return inner;
  }
  return null;
}

/**
 * Extract the dotted property chain the cursor is inside. Kept for the
 * legacy test coverage; internal callers use extractHopsAt.
 */
export function extractPropertyChainAt(
  expression: string,
  cursorPos: number,
): { path: string[]; target: string } | null {
  const isIdent = (c: string) => /[\w$]/.test(c);
  let start = cursorPos;
  while (start > 0 && isIdent(expression[start - 1])) start--;
  let end = cursorPos;
  while (end < expression.length && isIdent(expression[end])) end++;
  if (start === end) return null;
  const target = expression.substring(start, end);
  if (!/^[A-Za-z_$][\w$]*$/.test(target)) return null;

  const path: string[] = [];
  let i = start;
  while (i > 0 && expression[i - 1] === '.') {
    i--;
    const segEnd = i;
    while (i > 0 && isIdent(expression[i - 1])) i--;
    if (i === segEnd) break;
    path.unshift(expression.substring(i, segEnd));
  }
  return { path, target };
}
