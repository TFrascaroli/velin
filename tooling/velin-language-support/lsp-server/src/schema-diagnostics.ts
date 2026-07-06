import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { URI } from 'vscode-uri';
import { SchemaParser, VelinSchemaReference } from '@velin/shared';

export interface SchemaDiagnostic {
  line: number;
  lineLength: number;
  message: string;
  code: 'schema-unresolved';
}

/**
 * Walk every `@velin-schema` comment in `text` and produce a diagnostic for
 * each one that will silently fail to resolve at completion/F12 time.
 * Kept lightweight — global-type search is not diagnosed here because it
 * would require walking the whole workspace.
 */
export function diagnoseSchemaRefs(
  parser: SchemaParser,
  text: string,
  documentUri: string,
): SchemaDiagnostic[] {
  const lines = text.split('\n');
  const out: SchemaDiagnostic[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!parser.parseSchemaComment(lines[i])) continue;
    const { schemaRef } = parser.findSchemaContext(text, i);
    if (!schemaRef) continue;
    const reason = describeSchemaFailure(schemaRef, documentUri);
    if (!reason) continue;
    out.push({
      line: i,
      lineLength: lines[i].length,
      message: reason,
      code: 'schema-unresolved',
    });
  }
  return out;
}

export function describeSchemaFailure(
  ref: VelinSchemaReference,
  documentUri: string,
): string | null {
  const docDir = safeDocDir(documentUri);

  if (ref.type === 'inline-script') {
    if (ref.linkedPath) {
      const p = docDir ? path.resolve(docDir, ref.linkedPath) : null;
      if (!p || !fs.existsSync(p)) return `Linked script not found: ${ref.linkedPath}`;
      return null;
    }
    if (!ref.source) {
      return ref.typeName !== undefined
        ? `No <script id="${ref.typeName}"> found in this document`
        : 'No <script> found in this document';
    }
    return null;
  }

  if (ref.type === 'typescript' || ref.type === 'jsdoc') {
    if (!ref.source || !docDir) return null;
    const p = path.resolve(docDir, ref.source);
    if (!fs.existsSync(p)) return `Schema source not found: ${ref.source}`;
    // JSDoc types live inside `@typedef` comments, not as TS statements —
    // our AST walk can't see them, so we skip the type-declared check for
    // `.js`/`.jsx`/`.mjs`/`.cjs` sources. Missing-file we still catch above.
    if (ref.type === 'jsdoc' || /\.[mc]?jsx?$/.test(p)) return null;
    const wanted = ref.typeName ?? 'default';
    if (!declarationExistsInFile(p, wanted)) {
      return `Type "${wanted}" is not declared in ${ref.source}`;
    }
    return null;
  }

  return null;
}

function safeDocDir(documentUri: string): string | null {
  try { return path.dirname(URI.parse(documentUri).fsPath); }
  catch { return null; }
}

function declarationExistsInFile(filePath: string, typeName: string): boolean {
  let source: string;
  try { source = fs.readFileSync(filePath, 'utf8'); }
  catch { return false; }
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  for (const stmt of sf.statements) {
    if (
      (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isClassDeclaration(stmt)) &&
      stmt.name?.getText(sf) === typeName
    ) return true;
    if (ts.isExportAssignment(stmt) && typeName === 'default') return true;
  }
  return false;
}
