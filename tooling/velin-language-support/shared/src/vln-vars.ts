/**
 * Extract the names declared by a `vln-vars` attribute on a
 * `<template vln-template="...">` element. Two supported shapes:
 *
 *   vln-vars="['a', 'b']"          → array of pass-through names
 *   vln-vars="{ a: fn, b: fn }"    → object of per-key transformers
 *
 * Only *declaration* forms are handled — the provider form on
 * `vln-fragment` (`vln-vars="{ a: expr }"`) shares object syntax but its
 * keys map to the target template's declared names, so callers that only
 * care about scope discovery inside a template body should read the
 * declaration side.
 *
 * Nested braces / brackets are walked but not descended into: only keys
 * (or string elements) at outer-literal depth 1 are returned. Spread
 * (`...x`) and computed keys (`[k]:`) fall through and are ignored — the
 * templates-lsp-surface plan defers typing them to a future
 * `<!-- @vln-types -->` comment channel.
 */
export function extractDeclaredTemplateVars(expr: string): string[] {
  const trimmed = expr.trim();
  if (!trimmed) return [];
  const first = trimmed[0];
  if (first === '[') return extractArrayStringElements(trimmed);
  if (first === '{') return extractObjectKeys(trimmed);
  return [];
}

function extractArrayStringElements(expr: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === '[' || c === '{' || c === '(') { depth++; i++; continue; }
    if (c === ']' || c === '}' || c === ')') { depth--; i++; continue; }
    if (c === '"' || c === "'") {
      const parsed = readStringLiteral(expr, i);
      if (depth === 1) names.push(parsed.value);
      i = parsed.end;
      continue;
    }
    i++;
  }
  return names;
}

function extractObjectKeys(expr: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let i = 0;
  let expectKey = false;
  while (i < expr.length) {
    const c = expr[i];
    if (c === '{' || c === '[' || c === '(') {
      depth++;
      if (c === '{' && depth === 1) expectKey = true;
      i++;
      continue;
    }
    if (c === '}' || c === ']' || c === ')') {
      depth--;
      i++;
      continue;
    }
    if (c === ',' && depth === 1) { expectKey = true; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }

    if (depth === 1 && expectKey) {
      if (c === '"' || c === "'") {
        const parsed = readStringLiteral(expr, i);
        const after = skipWhitespace(expr, parsed.end);
        if (expr[after] === ':') {
          names.push(parsed.value);
          expectKey = false;
          i = after + 1;
        } else {
          expectKey = false;
          i = parsed.end;
        }
        continue;
      }
      const id = /^([A-Za-z_$][\w$]*)\s*:/.exec(expr.slice(i));
      if (id) {
        names.push(id[1]);
        expectKey = false;
        i += id[0].length;
        continue;
      }
      expectKey = false;
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      i = readStringLiteral(expr, i).end;
      continue;
    }
    i++;
  }
  return names;
}

function readStringLiteral(expr: string, start: number): { value: string; end: number } {
  const quote = expr[start];
  let j = start + 1;
  let value = '';
  while (j < expr.length && expr[j] !== quote) {
    if (expr[j] === '\\' && j + 1 < expr.length) {
      value += expr[j + 1];
      j += 2;
      continue;
    }
    value += expr[j];
    j++;
  }
  return { value, end: j + 1 };
}

function skipWhitespace(expr: string, i: number): number {
  while (i < expr.length && /\s/.test(expr[i])) i++;
  return i;
}
