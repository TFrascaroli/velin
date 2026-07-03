/**
 * Canonical list of Velin directives. Sourced from `src/velin-*.js` in the
 * framework. Keep this in sync when adding a new directive plugin.
 *
 * `hasSubkey`: the directive takes a `:<subkey>` suffix (e.g. `vln-on:click`,
 * `vln-loop:item`, `vln-attr:src`).
 */
export interface DirectiveMeta {
  name: string;
  hasSubkey: boolean;
  documentation: string;
  usage?: string;
  /**
   * If set, this directive is only valid on the listed tag names
   * (case-insensitive). Undefined = valid on any element.
   */
  validOnTags?: string[];
  /**
   * If set, this directive requires the presence of another attribute on the
   * same element. Used for e.g. vln-var:* which only makes sense alongside
   * vln-fragment.
   */
  requiresSiblingAttribute?: string;
}

export const VELIN_DIRECTIVE_META: DirectiveMeta[] = [
  {
    name: 'vln-text',
    hasSubkey: false,
    documentation: "Sets the element's text content reactively.",
    usage: 'vln-text="expression"',
  },
  {
    name: 'vln-input',
    hasSubkey: false,
    documentation: 'Two-way data binding for form controls.',
    usage: 'vln-input="propertyPath"',
  },
  {
    name: 'vln-if',
    hasSubkey: false,
    documentation: 'Conditionally shows/hides an element.',
    usage: 'vln-if="condition"',
  },
  {
    name: 'vln-class',
    hasSubkey: false,
    documentation: 'Adds/removes CSS classes reactively. Accepts strings, arrays, or `{ className: bool }` objects.',
    usage: 'vln-class="expression"',
  },
  {
    name: 'vln-attr',
    hasSubkey: true,
    documentation: 'Sets an HTML attribute dynamically.',
    usage: 'vln-attr:name="expression"',
  },
  {
    name: 'vln-on',
    hasSubkey: true,
    documentation: 'Attaches an event listener.',
    usage: 'vln-on:event="handler"',
  },
  {
    name: 'vln-loop',
    hasSubkey: true,
    documentation: 'Repeats the element for each item in the source collection. `$index` is available inside the body.',
    usage: 'vln-loop:item="collection" or vln-loop:item="{ collection, key }"',
  },
  {
    name: 'vln-use',
    hasSubkey: false,
    documentation: 'Invokes a runtime helper on the element (e.g. focus, click-outside).',
    usage: 'vln-use="helperExpression"',
  },
  {
    name: 'vln-fragment',
    hasSubkey: false,
    documentation: 'Renders a <template> by id, providing scoped variables via sibling `vln-var:*` attributes.',
    usage: 'vln-fragment="templateId"',
  },
  {
    name: 'vln-watch',
    hasSubkey: true,
    documentation: 'Watches an expression and invokes the handler on change.',
    usage: 'vln-watch:handlerName="expression"',
  },
  {
    name: 'vln-var',
    hasSubkey: true,
    documentation:
      'Passes a scoped variable into a `vln-fragment` template. Must appear on the same element as `vln-fragment`.',
    usage: 'vln-var:name="expression"',
    requiresSiblingAttribute: 'vln-fragment',
  },
  {
    name: 'vln-vars',
    hasSubkey: false,
    documentation:
      'Declares the required variables of a `<template vln-vars="a, b">`. Only valid on <template> elements.',
    usage: 'vln-vars="var1, var2"',
    validOnTags: ['template'],
  },
  {
    name: 'vln-table',
    hasSubkey: false,
    documentation: 'Virtualized/efficient table rendering plugin.',
    usage: 'vln-table="config"',
  },
  {
    name: 'vln-evt',
    hasSubkey: true,
    documentation: 'Custom event helper (velin-events plugin).',
    usage: 'vln-evt:name="handler"',
  },
  {
    name: 'vln-route',
    hasSubkey: false,
    documentation: 'Router route match (velin-router plugin).',
    usage: 'vln-route="pattern"',
  },
  {
    name: 'vln-router',
    hasSubkey: false,
    documentation: 'Router root (velin-router plugin).',
    usage: 'vln-router="config"',
  },
];

export const VELIN_DIRECTIVES = VELIN_DIRECTIVE_META.map((d) => d.name);

export type VelinDirectiveName = (typeof VELIN_DIRECTIVES)[number];

export function findDirectiveMeta(name: string): DirectiveMeta | undefined {
  return VELIN_DIRECTIVE_META.find((d) => d.name === name);
}

export function isValidDirectiveName(name: string): boolean {
  return VELIN_DIRECTIVES.includes(name);
}

export interface DirectivePlacementContext {
  /** Lowercase tag name of the element carrying the directive. */
  tagName: string;
  /** Lowercase attribute names present on the same element. */
  siblingAttributes: string[];
}

export interface DirectivePlacementError {
  code: 'wrong-tag' | 'missing-sibling';
  message: string;
}

/**
 * Validate whether a directive may appear on the given element. Returns a
 * problem descriptor if the placement is illegal, or null if it's fine.
 */
export function validateDirectivePlacement(
  directiveName: string,
  ctx: DirectivePlacementContext,
): DirectivePlacementError | null {
  const meta = findDirectiveMeta(directiveName);
  if (!meta) return null;

  if (meta.validOnTags && meta.validOnTags.length > 0) {
    if (!meta.validOnTags.map((t) => t.toLowerCase()).includes(ctx.tagName.toLowerCase())) {
      const tags = meta.validOnTags.map((t) => `<${t}>`).join(', ');
      return {
        code: 'wrong-tag',
        message: `${directiveName} is only valid on ${tags}, not <${ctx.tagName}>.`,
      };
    }
  }

  if (meta.requiresSiblingAttribute) {
    const siblings = ctx.siblingAttributes.map((a) => a.toLowerCase());
    if (!siblings.includes(meta.requiresSiblingAttribute.toLowerCase())) {
      return {
        code: 'missing-sibling',
        message: `${directiveName} requires \`${meta.requiresSiblingAttribute}\` on the same element.`,
      };
    }
  }

  return null;
}

/**
 * Filter the directive list to those valid at the given placement context —
 * used by the completion provider.
 */
export function directivesValidAt(
  ctx: DirectivePlacementContext,
): DirectiveMeta[] {
  return VELIN_DIRECTIVE_META.filter(
    (m) => validateDirectivePlacement(m.name, ctx) === null,
  );
}

