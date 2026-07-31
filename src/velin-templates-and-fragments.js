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
 * Template registry. Values hold a `WeakRef` to the `<template>` element so a
 * template removed from the DOM AND unreachable elsewhere is naturally GC'd
 * and its registration falls out silently. Lookups that find a dead ref
 * purge the entry and behave as "not registered".
 *
 * The `vln-template` plugin's destroy hook is the primary cleanup path; the
 * WeakRef is a safety net for nodes torn down without `cleanupState`.
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
 * @param {VelinCore} vln
 */
function setupTemplatesAndFragments(vln) {
  /**
   * vln-template: Registers a <template> in the module-local registry under
   * its attribute value as the id. Evaluates the sibling `vln-vars`
   * declaration in the scope where the template lives, so transformer
   * identifiers resolve against that scope (not the consumer's) — a
   * declaration can safely name state-level helpers even when a consumer
   * sits inside a substate that would shadow them.
   *
   * Templates MUST appear before their consumers in the DOM: Velin processes
   * nodes in document order, so a `<template vln-template="foo">` further
   * down the tree than `<div vln-fragment="'foo'">` will not yet be
   * registered when the fragment renders. The fragment plugin errors loudly
   * in that case.
   *
   *   <template vln-template="userCard" vln-vars="['user', 'onSave']">
   *     <div class="card"><h3 vln-text="user.name"></h3></div>
   *   </template>
   *
   * With transformers:
   *   <template vln-template="userCard" vln-vars="{ user: requireUser }">…</template>
   *
   * With a state-level constant declaration:
   *   // state.modalVars === { user: requireUser }
   *   <template vln-template="userCard" vln-vars="modalVars">…</template>
   *
   * With no declaration (auto-discovery — provided keys pass through):
   *   <template vln-template="loose">…</template>
   */
  vln.plugins.registerPlugin({
    name: "template",
    priority: vln.plugins.priorities.LATE,

    render: ({ node, evaluate }) => {
      const templateId = node.getAttribute("vln-template");
      if (!templateId) {
        console.error(
          `[Velin Templates] vln-template requires an id value. Usage: <template vln-template="myId" …>.`
        );
        return { halt: true };
      }
      if (!(node instanceof HTMLTemplateElement)) {
        console.error(
          `[Velin Templates] vln-template="${templateId}" must be on a <template> element. Found: <${node.tagName.toLowerCase()}>.`
        );
        return { halt: true };
      }

      // Real duplicate: another live-and-connected template already owns
      // this id. Same-node re-registration is a legitimate re-evaluation
      // (fall through). Stale entries (WeakRef dead or node disconnected)
      // get replaced silently — this is what makes test-to-test re-binds
      // clean without explicit teardown.
      const existing = lookupTemplate(templateId);
      if (existing && existing.node !== node && existing.node.isConnected) {
        console.warn(
          `[Velin Templates] Duplicate vln-template="${templateId}" — another live <template> already owns this id. The earlier registration wins.`
        );
        return { halt: true, pluginState: { templateId } };
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
      // Guard by node identity — a duplicate's late destroy must not wipe
      // the winning entry.
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

      if (!templateId) {
        console.error(
          `[Velin Templates] vln-fragment requires a template id. Usage: vln-fragment="'templateId'" or vln-fragment="dynamicId"`
        );
        return { halt: true };
      }

      const entry = lookupTemplate(templateId);
      if (!entry) {
        console.error(
          `[Velin Templates] Template "${templateId}" is not registered. Make sure a ` +
          `<template vln-template="${templateId}">…</template> appears BEFORE this ` +
          `<${node.tagName.toLowerCase()} vln-fragment=…> in the DOM (Velin processes nodes ` +
          `in document order — earlier siblings register first).`
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
      // renders as "no keys provided", which either satisfies auto-discovery
      // with nothing or trips the missing-var check for declared keys.
      const provided = (providedVars && typeof providedVars === "object" && !Array.isArray(providedVars))
        ? providedVars
        : {};

      const declared = Object.keys(transformers);
      const missing = declared.filter(n => !(n in provided));
      if (missing.length) {
        console.error(
          `[Velin Templates] Template "${templateId}" requires missing variables: [${missing.join(", ")}]. ` +
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
      // If we reach here `varsExpr` is either null-and-nothing-declared
      // (loop is empty) or non-null (all branches use it); the missing-var
      // check above ruled out "declared without a provider".
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
}

// Auto-bootstrap in browser
/** @type {any} */
const __win = typeof window !== "undefined" ? window : {};
if (__win.Velin) {
  setupTemplatesAndFragments(/** @type {VelinCore} */ (__win.Velin));
}

export default setupTemplatesAndFragments;
