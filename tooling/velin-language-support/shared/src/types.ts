// Shared types and utilities for Velin language support

export interface VelinSchemaReference {
  type: 'typescript' | 'jsdoc' | 'json' | 'inline' | 'global-type';
  source?: string; // File path or inline definition
  typeName?: string; // For TypeScript/JSDoc references
}

export interface VelinDirective {
  name: string;
  attribute: string; // Full attribute name (e.g., "vln-text", "vln-on:click")
  expression: string;
  position: {
    start: number;
    end: number;
  };
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