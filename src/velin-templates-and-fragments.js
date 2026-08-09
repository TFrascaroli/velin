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

/** Scope key for the slot bag shared between a fragment and its outlets. */
const SLOTS_KEY = "ø__slots";

/** Per-slot state key an outlet reads to register a reactive dep. */
const SLOT_DEP_KEY = (name) => "ø__slot_" + name;

/**
 * Resolve a slot name from a raw attribute value (fragment-side) or an
 * expression (outlet-side). Bare/empty → default slot "". Anything else must
 * evaluate to a string.
 * @param {string | null} raw
 * @param {Function} evaluate
 * @param {"vln-inlet" | "vln-outlet"} directive
 * @returns {string | null} name, or null on error (already logged)
 */
function parseSlotName(raw, evaluate, directive) {
  if (raw == null || raw.trim() === "") return "";
  let value;
  try {
    value = evaluate(raw);
  } catch (err) {
    if (__DEV__) {
      const msg = err && /** @type {any} */(err).message ? /** @type {any} */(err).message : String(err);
      console.error(`[Velin Templates] ${directive}: failed to evaluate name \`${raw}\`: ${msg}`);
    }
    return null;
  }
  if (typeof value !== "string") {
    if (__DEV__) {
      console.error(
        `[Velin Templates] ${directive} name must be a string. Got ${typeof value}. ` +
        `Did you forget quotes? Use ${directive}="'name'".`
      );
    }
    return null;
  }
  return value;
}

/**
 * @param {VelinCore} vln
 */
function setupTemplatesAndFragments(vln) {
  // No-ops when the optional velin-transitions module isn't loaded. `leave`
  // returns a `{ cancel }` handle in both modes.
  const NOOP_LEAVE = { cancel: () => {} };
  const leave = (node, done) => {
    if (vln.transitions) return vln.transitions.awaitLeave(node, done);
    done();
    return NOOP_LEAVE;
  };
  const enter = (node) => { if (vln.transitions) vln.transitions.markEnter(node); };
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
   *        vln-vars="{ user: currentUser, onSave: handleSave }">
   *     <template vln-inlet>…default slot content…</template>
   *     <template vln-inlet="'actions'">…named slot content…</template>
   *   </div>
   *
   * Direct children of a fragment host must all be `<template vln-inlet>`
   * (bare for the default slot, or named). Any other element there is a
   * mistake — hard error, dropped.
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
      // Cleaning inletCtx cascades to templateCtx (its child).
      if (pluginState?.inletCtx) pluginState.inletCtx.cleanup(node);
      // Fast-forward any children still mid-leave from a prior template swap.
      if (pluginState?.leaving) {
        for (const { node: ghost, handle } of pluginState.leaving) {
          handle.cancel();
          ghost.remove?.();
        }
      }
    },

    render: ({ node, tracked, compose, pluginState = {} }) => {
      const templateId = tracked?.templateId;
      const providedVars = tracked?.providedVars;
      const varsExpr = tracked?.varsExpr;

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

      const templateChanged = !pluginState?.templateId || pluginState.templateId !== templateId;
      const leaving = pluginState?.leaving;
      const isLeaving = leaving && leaving.length > 0;

      // Same template, nothing leaving: no-op.
      if (!templateChanged && !isLeaving && pluginState?.templateCtx) {
        return { halt: true, pluginState };
      }

      // Same template but a leave is in flight (user reverted to the outgoing
      // template mid-transition): cancel the leave and revive. Old scopes
      // were kept live (cleanup is deferred until natural leave completion),
      // so bindings just resume.
      if (!templateChanged && isLeaving) {
        for (const { handle } of leaving) handle.cancel();
        leaving.length = 0;
        pluginState.pendingArgs = null;
        return { halt: true, pluginState };
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

      // Snapshot everything the eventual mount needs. This is the "pending"
      // that finalizeSwap uses when the old template's leave completes.
      const pendingArgs = { templateId, template, transformers, providedVars, varsExpr, provided, declared };

      // If a leave is already in flight from a prior swap, just update the
      // pending target and bail — the completion callback will mount the
      // latest pending when it fires.
      if (isLeaving) {
        pluginState.pendingArgs = pendingArgs;
        return { halt: true, pluginState };
      }

      // Actually mounts the pending template. Extracted so it can be called
      // both synchronously (first render) and asynchronously (after old
      // children finish leaving on template swap).
      const doMount = (args) => {
        // Tear down old scopes now that the outgoing DOM is gone.
        if (pluginState.inletCtx) pluginState.inletCtx.cleanup(node);

        // Two scopes on purpose:
        //   inletCtx    = SLOTS_KEY only. Inlets fire here; their content DFs
        //                 later re-mount under a sibling of inletCtx and thus
        //                 see caller state — not the template's vln-vars.
        //   templateCtx = child of inletCtx, adds caller-provided vln-vars.
        const carriedSlots = pluginState.bag?.slots ?? Object.create(null);
        /** @type {{slots: Record<string, DocumentFragment>, inletCtx: any}} */
        const bag = { slots: carriedSlots, inletCtx: null };
        const inletCtx = compose({ [SLOTS_KEY]: { literal: bag } });
        bag.inletCtx = inletCtx;

        /** @type {Record<string, {expr: string, transform?: Function} | {literal: any}>} */
        const composeInit = {};
        const names = new Set([...args.declared, ...Object.keys(args.provided)]);
        for (const name of names) {
          const expr = `(${args.varsExpr})[${JSON.stringify(name)}]`;
          const tfm = args.transformers[name];
          composeInit[name] = tfm ? { expr, transform: tfm } : { expr };
        }
        const templateCtx = inletCtx.compose(composeInit);

        // First-ever render: consume the caller's inlet declarations. On
        // subsequent renders, bag.slots is already populated.
        if (!pluginState.templateId) {
          for (const child of Array.from(node.childNodes)) {
            if (child.nodeType !== Node.ELEMENT_NODE) continue;
            const el = /** @type {Element} */(child);
            const isInletTemplate = el instanceof HTMLTemplateElement && el.hasAttribute("vln-inlet");
            if (!isInletTemplate) {
              if (__DEV__) {
                console.error(
                  `[Velin Templates] Direct children of <${node.tagName.toLowerCase()} vln-fragment="'${args.templateId}'"> must be <template vln-inlet[="'name'"]>. ` +
                  `Got <${el.tagName.toLowerCase()}${el.hasAttribute("vln-inlet") ? " vln-inlet" : ""}>. Element was dropped.`
                );
              }
              continue;
            }
            inletCtx.processNode(el);
          }
        }

        // Wipe host and install the new template.
        node.innerHTML = "";
        const clone = /** @type {DocumentFragment} */(args.template.content.cloneNode(true));
        const newChildren = Array.from(clone.childNodes);
        newChildren.forEach(child => node.appendChild(child));
        for (const child of newChildren) {
          templateCtx.processNode(child);
          if (child.nodeType === 1) enter(/** @type {Element} */(child));
        }

        pluginState.templateId = args.templateId;
        pluginState.inletCtx = inletCtx;
        pluginState.templateCtx = templateCtx;
        pluginState.bag = bag;
      };

      // First render: nothing to leave, mount immediately.
      if (!pluginState.templateId) {
        pluginState.leaving = [];
        doMount(pendingArgs);
        return { halt: true, pluginState };
      }

      // Template swap: keep old scopes live, start leaves on rendered
      // children. Non-element children (text nodes) removed synchronously.
      // Whichever pendingArgs is set when the last leave completes wins,
      // so rapid successive swaps just overwrite the pending target.
      pluginState.pendingArgs = pendingArgs;
      pluginState.leaving = leaving || [];
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 1) {
          const leavingEl = /** @type {Element} */(child);
          const handle = leave(leavingEl, () => {
            leavingEl.remove();
            const list = pluginState.leaving;
            const idx = list ? list.findIndex(x => x.node === leavingEl) : -1;
            if (idx >= 0) list.splice(idx, 1);
            if (list && list.length === 0 && pluginState.pendingArgs) {
              const next = pluginState.pendingArgs;
              pluginState.pendingArgs = null;
              doMount(next);
            }
          });
          pluginState.leaving.push({ node: leavingEl, handle });
        } else {
          child.parentNode?.removeChild(child);
        }
      }

      return { halt: true, pluginState };
    },
  });

  /**
   * vln-inlet: self-registers a `<template>`'s content as a slot into the
   * enclosing fragment's bag. Bare = default slot; named via
   * `vln-inlet="'name'"`. The template's `.content` is cloned into a
   * DocumentFragment and stashed in `bag.slots[name]`; outlets rebind when
   * `SLOT_DEP_KEY(name)` fires.
   *
   * Fires above STOPPER so an accidental foreign vln-* on the wrapper
   * (e.g. `vln-inlet vln-loop:x`) short-circuits with a clear error rather
   * than letting the other directive run against the template wrapper.
   */
  vln.plugins.registerPlugin({
    name: "inlet",
    priority: vln.plugins.priorities.STOPPER + 5,
    render: ({ node, expr, evaluate, state, triggerEffects }) => {
      if (!(node instanceof HTMLTemplateElement)) {
        if (__DEV__) {
          console.warn(
            `[Velin Templates] vln-inlet must be on a <template>. Ignored on <${node.tagName.toLowerCase()}>.`
          );
        }
        return { halt: true };
      }
      const foreignVln = Array.from(node.attributes)
        .map(a => a.name)
        .filter(n => n.startsWith("vln-") && n !== "vln-inlet");
      if (foreignVln.length) {
        if (__DEV__) {
          console.error(
            `[Velin Templates] <template vln-inlet> also carries [${foreignVln.join(", ")}]. ` +
            `Move them inside the template. Element was dropped.`
          );
        }
        return { halt: true };
      }
      const bag = state && state[SLOTS_KEY];
      if (!bag) {
        if (__DEV__) {
          console.warn(
            `[Velin Templates] vln-inlet must be on a <template> inside a <… vln-fragment=…> host. Ignored.`
          );
        }
        return { halt: true };
      }
      const name = parseSlotName(expr, evaluate, "vln-inlet");
      if (name == null) return { halt: true };
      if (name in bag.slots) {
        if (__DEV__) {
          const label = name === "" ? "default slot" : `vln-inlet="'${name}'"`;
          console.error(`[Velin Templates] ${label} is already filled — extras dropped.`);
        }
        return { halt: true };
      }
      const df = document.createDocumentFragment();
      for (const child of Array.from(node.content.childNodes)) {
        df.appendChild(child.cloneNode(true));
      }
      bag.slots[name] = df;
      triggerEffects(SLOT_DEP_KEY(name));
      return { halt: true };
    },
  });

  /**
   * vln-outlet: mount point inside a template. Bare = default slot; named
   * via `vln-outlet="'name'"`. The outlet element itself is discarded —
   * content replaces it, and the mounted subtree is processed under the
   * caller's scope so directives bind against caller state.
   *
   * Reactive on its slot: track()s a sentinel key so any future write to
   * `bag.slots[name]` (via `triggerEffects(ø__slot_<name>)`) re-runs this
   * outlet — old mount is cleaned up, a fresh clone is inserted.
   *
   *   <template vln-template="'card'">
   *     <div class="body"><div vln-outlet></div></div>
   *     <footer><div vln-outlet="'actions'"></div></footer>
   *   </template>
   */
  vln.plugins.registerPlugin({
    name: "outlet",
    priority: vln.plugins.priorities.STOPPER,

    track: ({ expr, evaluate, state }) => {
      const name = parseSlotName(expr, evaluate, "vln-outlet");
      if (name == null) return { name: null };
      // Sentinel read: registers a dep on the slot's key so future writes
      // fire this outlet's effect. Value is never used, only the get-trap.
      void state[SLOT_DEP_KEY(name)];
      return { name };
    },

    destroy: ({ pluginState }) => {
      if (pluginState?.mountedCtx) pluginState.mountedCtx.cleanup(pluginState.placeholder);
      for (const root of pluginState?.mountedRoots || []) {
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    },

    render: ({ node, tracked, state, pluginState = {} }) => {
      const name = tracked?.name;
      if (name == null) return { halt: true };

      const bag = state && state[SLOTS_KEY];
      if (!bag) {
        if (__DEV__) {
          console.warn(
            `[Velin Templates] vln-outlet on <${node.tagName.toLowerCase()}> only works inside a ` +
            `template mounted via vln-fragment. Ignored here.`
          );
        }
        return { halt: true };
      }

      // First render: swap the outlet element for a comment placeholder we
      // can use as an insertion anchor across reactive re-mounts.
      let placeholder = pluginState.placeholder;
      if (!placeholder) {
        if (!node.parentNode) return { halt: true };
        placeholder = document.createComment(`vln-outlet:${name}`);
        node.parentNode.insertBefore(placeholder, node);
        node.parentNode.removeChild(node);
      }

      // Tear down previous mount (bindings + DOM).
      if (pluginState.mountedCtx) pluginState.mountedCtx.cleanup(placeholder);
      for (const root of pluginState.mountedRoots || []) {
        if (root.parentNode) root.parentNode.removeChild(root);
      }

      /** @type {Node[]} */
      const mountedRoots = [];
      /** @type {any} */
      let mountedCtx = null;

      const pristine = bag.slots[name];
      if (pristine && pristine.childNodes.length && placeholder.parentNode) {
        const clone = /** @type {DocumentFragment} */(pristine.cloneNode(true));
        mountedRoots.push(...Array.from(clone.childNodes));
        placeholder.parentNode.insertBefore(clone, placeholder);
        // Fresh scope for this mount so re-mounts get clean teardown.
        mountedCtx = bag.inletCtx.compose({});
        for (const root of mountedRoots) mountedCtx.processNode(root);
      }

      return { halt: true, pluginState: { placeholder, mountedRoots, mountedCtx } };
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
      if (__DEV__) {
        console.error(
          `[Velin Templates] vln-var:${subkey ?? ""} was removed. Provide values via a single ` +
          `vln-vars="{...}" attribute on the vln-fragment element, e.g. ` +
          `<${node.tagName.toLowerCase()} vln-fragment="'myTpl'" vln-vars="{ ${subkey ?? "name"}: value }">.`
        );
      }
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
