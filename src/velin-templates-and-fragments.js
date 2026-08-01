// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 * @typedef {import('./velin-core').Interpolation} Interpolation
 */

/**
 * @typedef {Object} TemplateEntry
 * @property {WeakRef<HTMLTemplateElement>} nodeRef
 * @property {Record<string, Function|null>} transformers name → fn (null = array-declared / undeclared identity pass-through)
 */

/**
 * Void elements per HTML spec — cannot have children. Fragment on any of
 * these is a user error we surface clearly rather than let appendChild fail.
 */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);

/**
 * Template registry. Values hold a `WeakRef` to the `<template>` element so a
 * template removed from the DOM AND unreachable elsewhere is naturally GC'd
 * and its registration falls out silently. Lookups that find a dead ref
 * purge the entry and behave as "not registered".
 *
 * @type {Map<string, TemplateEntry>}
 */
const templates = new Map();

/**
 * @param {string} id
 * @returns {{node: HTMLTemplateElement, transformers: Record<string, Function|null>} | null}
 */
function lookupTemplate(id) {
  const entry = templates.get(id);
  if (!entry) return null;
  const node = entry.nodeRef.deref();
  if (!node) {
    templates.delete(id);
    return null;
  }
  return { node, transformers: entry.transformers };
}

/**
 * Shared "undefined id" hint. Emitted when a template/fragment id expression
 * evaluates to undefined/null — almost always because the user forgot to
 * quote a string literal.
 * @param {"vln-template" | "vln-fragment"} directive
 * @param {any} value
 */
function undefinedIdError(directive, value) {
  return (
    `[Velin Templates] ${directive} id evaluated to ${value === undefined ? "undefined" : "null"}. ` +
    `Did you forget quotes? Use ${directive}="'myId'" for a string literal, or a state expression that resolves to a string.`
  );
}

/**
 * @param {VelinCore} vln
 */
function setupTemplatesAndFragments(vln) {
  /**
   * vln-template: Registers a <template> under an id, evaluating the sibling
   * `vln-vars` declaration in the scope where the template lives.
   *
   * The attribute value is evaluated as JS like every other directive:
   *   vln-template="'userCard'"   → id "userCard" (string literal)
   *   vln-template="cardIds.user" → id from state
   *
   * Templates MUST appear before their consumers in the DOM AND inside the
   * same `Velin.bind()` root — Velin processes nodes in document order, and
   * the plugin only fires on nodes it visits.
   *
   *   <template vln-template="'userCard'" vln-vars="['user', 'onSave']">
   *     <div class="card"><h3 vln-text="user.name"></h3></div>
   *   </template>
   *
   * With transformers:
   *   <template vln-template="'userCard'" vln-vars="{ user: requireUser }">…</template>
   *
   * With a state-level constant declaration:
   *   // state.modalVars === { user: requireUser }
   *   <template vln-template="'userCard'" vln-vars="modalVars">…</template>
   *
   * Duplicate policy: last one wins with a `replacing` warning, so
   * hot-reload / edit-in-place workflows just work.
   */
  vln.plugins.registerPlugin({
    name: "template",
    priority: vln.plugins.priorities.LATE,

    render: ({ node, compiledExpression, evaluate, evaluateAst }) => {
      /** @type {any} */
      let templateId;
      try {
        templateId = evaluateAst(compiledExpression);
      } catch (err) {
        const msg = err && /** @type {any} */(err).message
          ? /** @type {any} */(err).message
          : String(err);
        console.error(`[Velin Templates] vln-template: failed to evaluate id: ${msg}`);
        return { halt: true };
      }
      if (templateId === undefined || templateId === null) {
        console.error(undefinedIdError("vln-template", templateId));
        return { halt: true };
      }
      if (typeof templateId !== "string") {
        console.error(
          `[Velin Templates] vln-template id must be a string. Got ${typeof templateId}.`
        );
        return { halt: true };
      }
      if (!(node instanceof HTMLTemplateElement)) {
        console.error(
          `[Velin Templates] vln-template="${templateId}" must be on a <template> element. Found: <${node.tagName.toLowerCase()}>.`
        );
        return { halt: true };
      }

      // Last-wins on duplicates. A still-connected prior owner is worth
      // warning about — it means two live definitions of the same id, which
      // is almost certainly a copy-paste bug. Stale entries (WeakRef dead or
      // disconnected) get replaced silently.
      const existing = lookupTemplate(templateId);
      if (existing && existing.node !== node && existing.node.isConnected) {
        console.warn(
          `[Velin Templates] Template "${templateId}" already registered — replacing.`
        );
      }

      /** @type {Record<string, Function|null>} */
      const transformers = {};
      const declRaw = node.getAttribute("vln-vars");
      if (declRaw != null && declRaw.trim() !== "") {
        /** @type {any} */
        let decl;
        try {
          decl = evaluate(declRaw);
        } catch (err) {
          const msg = err && /** @type {any} */(err).message
            ? /** @type {any} */(err).message
            : String(err);
          console.error(
            `[Velin Templates] Template "${templateId}": failed to evaluate vln-vars \`${declRaw}\`: ${msg}`
          );
          return { halt: true };
        }
        if (Array.isArray(decl)) {
          for (const name of decl) {
            if (typeof name !== "string") {
              console.error(
                `[Velin Templates] Template "${templateId}": vln-vars array entries must be strings. Got ${JSON.stringify(name)}.`
              );
              return { halt: true };
            }
            transformers[name] = null;
          }
        } else if (decl && typeof decl === "object") {
          for (const [name, fn] of Object.entries(decl)) {
            transformers[name] = typeof fn === "function" ? /** @type {Function} */(fn) : null;
          }
        } else {
          console.error(
            `[Velin Templates] Template "${templateId}": vln-vars must evaluate to an array or object. Got ${typeof decl}.`
          );
          return { halt: true };
        }
      }

      templates.set(templateId, {
        nodeRef: new WeakRef(node),
        transformers,
      });

      return { halt: true, pluginState: { templateId } };
    },

    destroy: ({ node, pluginState }) => {
      const id = pluginState?.templateId;
      if (!id) return;
      const entry = templates.get(id);
      // Guard by node identity — a superseded template's late destroy must
      // not wipe the current winner's entry.
      if (entry && entry.nodeRef.deref() === node) {
        templates.delete(id);
      }
    },
  });

  /**
   * vln-fragment: Renders a template registered via `vln-template`, with
   * scoped variables from the consumer.
   *
   *   <div vln-fragment="'userCard'"
   *        vln-vars="{ user: currentUser, onSave: handleSave }"></div>
   *
   * The provider (`vln-vars` on the consumer) is evaluated in the consumer's
   * scope; each key becomes an EXPR interpolation in the child scope that
   * indexes into the provider object. Any transformer declared on the
   * template rides on the interpolation and runs on every read.
   *
   * Dynamic template selection: `vln-fragment="user.role + 'Card'"`.
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/templates.md|Templates & Fragments Guide}
   */
  vln.plugins.registerPlugin({
    name: "fragment",
    priority: vln.plugins.priorities.LATE,

    track: ({ compiledExpression, evaluate, evaluateAst, node }) => {
      const templateId = evaluateAst(compiledExpression);
      let varsExpr = null;
      let providedVars = null;
      if (node instanceof HTMLElement) {
        varsExpr = node.getAttribute("vln-vars");
        if (varsExpr) providedVars = evaluate(varsExpr);
      }
      return { templateId, varsExpr, providedVars };
    },

    destroy: ({ node, pluginState }) => {
      if (pluginState?.innerChild) pluginState.innerChild.cleanup(node);
    },

    render: ({ node, tracked, compose, pluginState = {} }) => {
      const templateId = tracked?.templateId;
      const varsExpr = tracked?.varsExpr;
      const providedVars = tracked?.providedVars;

      if (templateId === undefined || templateId === null) {
        console.error(undefinedIdError("vln-fragment", templateId));
        return { halt: true };
      }
      if (typeof templateId !== "string") {
        console.error(
          `[Velin Templates] vln-fragment id must be a string. Got ${typeof templateId}.`
        );
        return { halt: true };
      }

      // Void elements can't hold children. Catch it here rather than let
      // appendChild silently no-op or throw an opaque DOM error later.
      if (node instanceof HTMLElement && VOID_ELEMENTS.has(node.tagName.toLowerCase())) {
        console.error(
          `[Velin Templates] vln-fragment cannot be used on <${node.tagName.toLowerCase()}> — void elements cannot hold children. Use a container like <div> or <span>.`
        );
        return { halt: true };
      }

      const entry = lookupTemplate(templateId);
      if (!entry) {
        console.error(
          `[Velin Templates] Template "${templateId}" is not registered. Make sure a ` +
          `<template vln-template="'${templateId}'">…</template> appears BEFORE this ` +
          `<${node.tagName.toLowerCase()} vln-fragment=…> in the DOM AND inside the same ` +
          `Velin.bind() root (Velin processes nodes in document order — earlier siblings ` +
          `register first). Call Velin.debug.templates() to list what IS registered.`
        );
        return { halt: true };
      }
      const { node: template, transformers } = entry;

      // Same template — child scope's own effects handle interior updates.
      const templateChanged = !pluginState?.templateId || pluginState.templateId !== templateId;
      if (!templateChanged && pluginState?.innerChild) {
        return { halt: true, pluginState };
      }

      // Template changed — cleanup and rebuild.
      if (pluginState?.innerChild) pluginState.innerChild.cleanup(node);
      node.innerHTML = "";

      // Coerce to a plain object; anything else (null, primitives, arrays)
      // renders as "no keys provided", which trips the missing-var check
      // below with a helpful type hint.
      const providerIsObject = providedVars && typeof providedVars === "object" && !Array.isArray(providedVars);
      const provided = providerIsObject ? providedVars : {};

      const declared = Object.keys(transformers);
      const missing = declared.filter(n => !(n in provided));
      if (missing.length) {
        const typeHint = varsExpr && !providerIsObject
          ? ` (provider \`${varsExpr}\` evaluated to ${providedVars === null ? "null" : Array.isArray(providedVars) ? "an array" : typeof providedVars} — expected an object; did you mean \`{...${varsExpr}}\`?)`
          : "";
        console.error(
          `[Velin Templates] Template "${templateId}" requires missing variables: [${missing.join(", ")}]${typeHint}. ` +
          `Add them to vln-vars, e.g. vln-vars="{ ${missing[0]}: yourValue, … }"`
        );
        return { halt: true };
      }

      // Each declared or provided key becomes an EXPR interpolation in the
      // child scope. The bracket-notation expression indexes into the
      // consumer's vln-vars object; evaluation is routed to the consumer's
      // scope by composeState's ø__enclosing chain — so `vln-vars="{ user: user }"`
      // under a same-named parent identifier resolves via JS-closure
      // semantics, not shadow recursion. Transformers ride via the
      // interpolation's optional `transform` field.
      /** @type {Record<string, {expr: string, transform?: Function} | {literal: any}>} */
      const composeInit = {};
      const names = new Set([...declared, ...Object.keys(provided)]);
      for (const name of names) {
        // JSON-quoted key so non-identifier names (e.g. "weird-name") still work.
        const expr = `(${varsExpr})[${JSON.stringify(name)}]`;
        const tfm = transformers[name];
        composeInit[name] = tfm ? { expr, transform: tfm } : { expr };
      }

      const clone = template.content.cloneNode(true);
      const innerChild = compose(composeInit);
      Array.from(clone.childNodes).forEach(child => {
        node.appendChild(child);
        innerChild.processNode(child);
      });

      return {
        halt: true,
        pluginState: { templateId, innerChild },
      };
    },
  });

  /**
   * vln-var:*: Deprecated. Kept as an error-only plugin during beta so users
   * migrating from the old sibling-attribute API get a loud message instead
   * of silent no-op. Remove before 1.0.
   */
  vln.plugins.registerPlugin({
    name: "var",
    // STOPPER so the error fires BEFORE any sibling vln-fragment on the same
    // element gets to run and drown out the deprecation message with its own
    // "missing variables" error.
    priority: vln.plugins.priorities.STOPPER,
    render: ({ node, subkey }) => {
      console.error(
        `[Velin Templates] vln-var:${subkey ?? ""} was removed. Provide values via a single ` +
        `vln-vars="{...}" attribute on the vln-fragment element, e.g. ` +
        `<${node.tagName.toLowerCase()} vln-fragment="'myTpl'" vln-vars="{ ${subkey ?? "name"}: value }">.`
      );
      return { halt: true };
    },
  });

  // Debug affordance — snapshot of live registrations. Not part of the
  // public API surface people should build against; a convenience for
  // console-driven debugging of "not registered" errors.
  /** @type {any} */
  const vlnAny = vln;
  vlnAny.debug = vlnAny.debug || {};
  vlnAny.debug.templates = () => {
    /** @type {Array<{id: string, connected: boolean}>} */
    const out = [];
    for (const [id, entry] of templates) {
      const node = entry.nodeRef.deref();
      if (!node) continue;
      out.push({ id, connected: node.isConnected });
    }
    return out;
  };
}

// Auto-bootstrap in browser
/** @type {any} */
const __win = typeof window !== "undefined" ? window : {};
if (__win.Velin) {
  setupTemplatesAndFragments(/** @type {VelinCore} */ (__win.Velin));
}

export default setupTemplatesAndFragments;
