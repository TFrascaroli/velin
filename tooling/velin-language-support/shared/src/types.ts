// Shared types and utilities for Velin language support

export interface VelinSchemaReference {
  type: 'typescript' | 'jsdoc' | 'json' | 'inline' | 'global-type' | 'inline-script';
  source?: string; // File path, inline definition, or (for inline-script) the script body
  typeName?: string; // For TypeScript/JSDoc references; for inline-script, the target <script id="..."> if named
  // For inline-script: offset in the enclosing HTML document where `source` begins.
  // Used to translate declaration positions back to HTML coordinates for F12.
  sourceOffset?: number;
  // For inline-script pointing at `<script src="...">`: absolute path to the
  // linked file. When set, F12 targets that file and inline offset mapping is
  // skipped.
  linkedPath?: string;
}

export interface VelinDirective {
  name: string;
  attribute: string; // Full attribute name (e.g., "vln-text", "vln-on:click")
  expression: string;
  position: {
    start: number;
    end: number;
  };
  /** Char index of the first char of the value (right after the opening quote). */
  expressionStart: number;
  /** Char index of the closing quote (exclusive end of the value). */
  expressionEnd: number;
}

export interface VelinSchemaContext {
  schemaRef: VelinSchemaReference | null;
  applicableRange: {
    startLine: number;
    endLine: number;
  } | null;
}

export interface CompletionItem {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
}

export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18
}

// Re-exports kept for backwards compatibility; canonical source is ./directives.
export { VELIN_DIRECTIVES, VELIN_DIRECTIVE_META, findDirectiveMeta, isValidDirectiveName } from './directives';
export type { VelinDirectiveName, DirectiveMeta } from './directives';