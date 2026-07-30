// @ts-check

/**
 * @typedef {import('./velin-core').VelinCore} VelinCore
 * @typedef {import('./velin-core').Interpolation} Interpolation
 */

/**
 * @param {VelinCore} vln
 */
function setupTemplatesAndFragments(vln) {
  /**
   * vln-fragment: Renders a template with scoped variables.
   * Creates reusable component-like functionality with data binding.
   *
   * **Basic Usage:**
   * Define template with required variables using vln-vars (array form for
   * existence-only, or object form with transformer functions):
   *   <template id="userCard" vln-vars="['user', 'onSave']">
   *     <div class="card">
   *       <h3 vln-text="user.name"></h3>
   *       <button vln-on:click="onSave(user)">Save</button>
   *     </div>
   *   </template>
   *
   * Use template with vln-fragment and pass values via a single vln-vars
   * object expression (attribute value is a real JS object literal —
   * casing is preserved end-to-end):
   *   <div vln-fragment="'userCard'"
   *        vln-vars="{ user: currentUser, onSave: handleSave }"></div>
   *
   * **Transformers (validation / defaults / coercion):**
   *   <template id="userCard" vln-vars="{
   *     user: requireUser,
   *     role: normalizeRole,
   *     count: toNumber
   *   }">...</template>
   * Transformer functions are looked up in the CONSUMER's scope (define
   * them on the object passed to Velin.bind). Throw to reject, return the
   * value to pass through, return something else to coerce.
   *
   * **Dynamic Template Selection:**
   *   <div vln-fragment="user.role + 'Card'" vln-vars="{...}"></div>
   *
   * **Spread / pass-through:**
   *   <div vln-fragment="'card'" vln-vars="{ ...defaults, extra: 'x' }"></div>
   *   <div vln-fragment="'card'" vln-vars="propsBag"></div>
   *
   * **In Loops:**
   *   <div vln-loop:user="users"
   *        vln-fragment="'userCard'"
   *        vln-vars="{ user, actions: createActions(user) }"></div>
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/templates.md|Templates & Fragments Guide}
   */
  vln.plugins.registerPlugin({
    name: "fragment",
    priority: vln.plugins.priorities.LATE,

    track: ({ compiledExpression, evaluate, evaluateAst, node }) => {
      const templateId = evaluateAst(compiledExpression);

      // Read the single vln-vars attribute on the consumer (attribute value —
      // NOT lowercased by HTML). Evaluating it here captures deps so the
      // fragment re-renders when the provider expression changes.
      let varsExpr = null;
      let providedVars = null;
      if (node instanceof HTMLElement) {
        varsExpr = node.getAttribute("vln-vars");
        if (varsExpr) {
          providedVars = evaluate(varsExpr);
        }
      }

      return { templateId, varsExpr, providedVars };
    },

    destroy: ({ node, pluginState }) => {
      if (pluginState?.innerChild) {
        pluginState.innerChild.cleanup(node);
      }
    },

    render: ({ node, tracked, compose, evaluate, pluginState = {} }) => {
      const templateId = tracked?.templateId;
      const varsExpr = tracked?.varsExpr;
      const providedVars = tracked?.providedVars;

      if (!templateId) {
        console.error(
          '[Velin Templates] vln-fragment requires a template ID. ' +
          'Usage: vln-fragment="\'templateId\'" or vln-fragment="dynamicId"'
        );
        return { halt: true };
      }

      const templateChanged = !pluginState?.templateId || pluginState.templateId !== templateId;

      const template = document.getElementById(templateId);
      if (!template) {
        console.error(
          `[Velin Templates] Template #${templateId} not found. ` +
          `Make sure you have <template id="${templateId}"> in your HTML.`
        );
        return { halt: true };
      }
      if (!(template instanceof HTMLTemplateElement)) {
        console.error(
          `[Velin Templates] Element #${templateId} is not a <template>. ` +
          `Found: <${template.tagName.toLowerCase()}>`
        );
        return { halt: true };
      }

      // Same template — child scope's own effects handle updates.
      if (!templateChanged && pluginState?.innerChild) {
        return { halt: true, pluginState };
      }

      // Template changed — cleanup and rebuild.
      if (pluginState?.innerChild) {
        pluginState.innerChild.cleanup(node);
      }
      node.innerHTML = "";

      // --- Parse the template's vln-vars declaration -------------------
      // Accepted forms:
      //   vln-vars="['user', 'onSave']"                        (array of names)
      //   vln-vars="{ user: fn, onSave: fn }"                  (object of transformers)
      //   (missing)                                            (auto-discover from provided)
      //
      // Anything else (including legacy comma-split "user, onSave") is a hard error.
      const declRaw = template.getAttribute("vln-vars");
      /** @type {string[]} */
      let declaredNames = [];
      /** @type {Record<string, Function|null>} */
      const transformers = {};

      if (declRaw != null && declRaw.trim() !== "") {
        const trimmed = declRaw.trim();
        if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
          console.error(
            `[Velin Templates] Template #${templateId}: vln-vars must be an array literal ` +
            `(['name1', 'name2']) or object literal ({name1: fn, name2: fn}). ` +
            `Got: ${JSON.stringify(declRaw)}. ` +
            `The legacy comma-split form ("name1, name2") is no longer supported.`
          );
          return { halt: true };
        }
        /** @type {any} */
        let decl;
        try {
          decl = evaluate(declRaw);
        } catch (err) {
          console.error(
            `[Velin Templates] Template #${templateId}: failed to evaluate vln-vars declaration: ` +
            (err && /** @type {any} */(err).message ? /** @type {any} */(err).message : String(err))
          );
          return { halt: true };
        }
        if (Array.isArray(decl)) {
          for (const name of decl) {
            if (typeof name !== "string") {
              console.error(
                `[Velin Templates] Template #${templateId}: vln-vars array entries must be strings. Got ${JSON.stringify(name)}.`
              );
              return { halt: true };
            }
            declaredNames.push(name);
            transformers[name] = null;
          }
        } else if (decl && typeof decl === "object") {
          for (const [name, fn] of Object.entries(decl)) {
            declaredNames.push(name);
            transformers[name] = typeof fn === "function" ? /** @type {Function} */(fn) : null;
          }
        } else {
          console.error(
            `[Velin Templates] Template #${templateId}: vln-vars must evaluate to an array or object. Got ${typeof decl}.`
          );
          return { halt: true };
        }
      }

      // --- Validate provided values shape ------------------------------
      if (varsExpr && providedVars != null && (typeof providedVars !== "object" || Array.isArray(providedVars))) {
        console.error(
          `[Velin Templates] Fragment for #${templateId}: vln-vars must evaluate to an object. Got ${Array.isArray(providedVars) ? "array" : typeof providedVars}.`
        );
        return { halt: true };
      }
      const provided = (providedVars && typeof providedVars === "object") ? providedVars : {};

      // --- Missing-var check (declared but not provided) ---------------
      const missing = declaredNames.filter(n => !(n in provided));
      if (missing.length) {
        console.error(
          `[Velin Templates] Template #${templateId} requires missing variables: ` +
          `[${missing.join(", ")}]. Add them to vln-vars, e.g. ` +
          `vln-vars="{ ${missing[0]}: yourValue, ... }"`
        );
        return { halt: true };
      }

      // --- Build compose init ------------------------------------------
      //
      // Each declared/provided key becomes an EXPR interpolation in the child
      // scope. The expression indexes into the consumer's vln-vars object;
      // its evaluation is routed to the CONSUMER's scope by the core's
      // ø__enclosing chain (see composeState), so a provider like
      // `vln-vars="{ user: user }"` under a same-named parent identifier
      // resolves via JS-closure semantics, not shadow recursion.
      //
      // Transformers ride on the interpolation via the optional `transform`
      // field — lerp applies them after evaluation. No sibling identifiers,
      // no mangled helper names.
      /** @type {Record<string, {expr: string, transform?: Function} | {literal: any}>} */
      const composeInit = {};

      // Union of declared names and provided keys (undeclared extras pass through).
      const allNames = new Set(declaredNames);
      for (const k of Object.keys(provided)) allNames.add(k);

      for (const name of allNames) {
        const tfm = transformers[name];
        if (!varsExpr) {
          composeInit[name] = { literal: undefined };
          continue;
        }
        // Bracket notation with a JSON-quoted key so non-identifier names
        // (e.g. "weird-name") still work.
        const expr = `(${varsExpr})[${JSON.stringify(name)}]`;
        composeInit[name] = tfm ? { expr, transform: tfm } : { expr };
      }

      // Clone template content and process in the new child scope.
      const clone = template.content.cloneNode(true);
      const innerChild = compose(composeInit);
      Array.from(clone.childNodes).forEach(child => {
        node.appendChild(child);
        innerChild.processNode(child);
      });

      return {
        halt: true,
        pluginState: {
          templateId,
          innerChild,
        },
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
