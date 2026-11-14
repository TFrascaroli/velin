/// <reference path="./global.d.ts" />
// @ts-check

// The dev hook lives in a separate module. Under __DEV__=false the entire
// dynamic-import branch below folds away and esbuild drops the module —
// static named imports would still shift the minifier's identifier budget,
// so the require lives inside the guarded branch.
// eslint-disable-next-line no-var

/**
 * @typedef {Object} DepCapture
 * @property {boolean} capturingDeps Whether dependencies are being captured
 * @property {Set<string>} deps Set of dependency property paths currently captured
 */

/**
 * @typedef {Object} VelinStateControl
 * @property {boolean} evaluating Whether or not we are currently in an evaluation (to prevent multi-sets in evaluation)
 * @property {boolean} wrapping Whether or not we are currently wrapping nested objects (to prevent false positives when setting the wrapped values)
 * @property {any} currentCycleID Marker used to deduplicate re-entrant dependency capture cycles
 * @property {number} batchDepth Nesting depth of active batch() calls; effects are queued when > 0
 * @property {Map<Function, number>} batchQueue Deferred effects collected while batchDepth > 0; value is the mutationSeq of the last mutation that queued each effect (dev-only correlation id, 0 for non-mutation queuings)
 * @property {Set<Function>} batchRecapture Effects in batchQueue that must re-capture their dependencies when flushed
 * @property {(fn: () => void) => void} batch Defers effects triggered inside fn until fn returns, then flushes once (deduplicated). Safe to nest.
 */

/**
 * @typedef {(recapture?: boolean) => PluginControl | void} VelinBindingEffect Runs the binding; `recapture` re-captures its dependencies on this run (ADR-0006)
 */

/**
 * @typedef {Object} ExpressionInterpolation
 * @property {string} expr The original expression string
 * @property {ASTNode} ast The compiled AST of the expression
 */

/**
 * @typedef {Object} Interpolation
 * @property {'EXPR'|'LITERAL'} type The type of interpolation
 * @property {ExpressionInterpolation|any} value The AST node or literal value
 * @property {(v: any) => any} [transform] Optional transform applied to the evaluated value (EXPR only)
 */

/**
 * Input shape accepted by `composeState` / `ChildContext.compose` /
 * `PluginHelpers.compose`. Each entry is either `{ expr, transform? }`
 * (evaluated in the enclosing scope) or `{ literal }` (frozen value).
 * @typedef {Record<string, { expr: string, transform?: (v: any) => any } | { literal: any }>} ComposeInit
 */

/**
 * @typedef {Object} ReactiveState
 * @property {any} state The proxied reactive state object
 * @property {DepCapture[]} ø__depCaptures Dependency capture
 * @property {Map<string, Set<VelinBindingEffect>>} bindings Map of property paths to sets of reactive effect functions
 * @property {VelinStateControl} ø__control Dependency capture state
 * @property {Map<string, Interpolation>=} interpolations Optional map of interpolation keys to expressions
 * @property {Map<string, Set<VelinBindingEffect>>} ø__innerBindings Optional map of inner bindings (for cleanup)
 * @property {Set<ReactiveState>} ø__innerStates Optional set of inner states (for cleanup)
 * @property {Array<() => void>} ø__finalizers Optional array of plugin finalizers attached to this state (for cleanup)
 * @property {string[]=} tricklingRoots Stack of root paths for dependency filtering. Dependencies at or above any of these levels are filtered out (used by vln-loop, nested loops stack their roots so the outer one isn't lost).
 * @property {PluginHelpers=} ø__helpers Pre-bound helper bundle built once per substate (see buildPluginHelpers)
 * @property {ReactiveState|null} ø__enclosing The enclosing (parent) reactive state — null at root. Set by composeState. Interpolation expressions on this scope evaluate against ø__enclosing, giving them JS-closure semantics.
 * @property {Node | null} [ø__rootNode] For root states only (set by bind()): the DOM node the state was bound against. Used by unbind() to pass the right node to cleanupState → emitLifecycle. Absent on composed child states.
 */

/**
 * @typedef {Object} PluginHelpers
 * @property {any} state User-facing reactive Proxy for this scope
 * @property {(expr?: string, allowMutations?: boolean) => any} evaluate Pre-bound evaluate
 * @property {(ast?: ASTNode) => any} evaluateAst Pre-bound evaluateAst
 * @property {(expr?: string) => (value: any) => void} getSetter Pre-bound getSetter
 * @property {(init: ComposeInit) => ChildContext} compose Pre-bound compose (returns ChildContext)
 * @property {(node: Node) => void} processNode Pre-bound processNode — runs plugins on `node` in THIS scope (no child scope is created). Use for dynamically-inserted subtrees that should share the current scope.
 * @property {(node: Node, name?: string, value?: string) => void} consume Pre-bound consumeAttribute
 * @property {(prop: string, recapture?: boolean) => void} triggerEffects Pre-bound triggerEffects
 * @property {(fn: () => void) => void} batch Pre-bound batch on this state's tree control
 */

/**
 * @typedef {Object} ChildContext
 * @property {any} state Child's user-facing reactive Proxy
 * @property {(expr?: string, allowMutations?: boolean) => any} evaluate
 * @property {(ast?: ASTNode) => any} evaluateAst
 * @property {(expr?: string) => (value: any) => void} getSetter
 * @property {(init: ComposeInit) => ChildContext} compose
 * @property {(expr: string) => ChildContext} anchor Fluent — appends expr to tricklingRoots and returns this context
 * @property {(key: string, interp: Interpolation) => ChildContext} setInterpolation
 * @property {(node: Node) => void} processNode
 * @property {(node?: Node | null) => void} cleanup
 * @property {(prop: string, recapture?: boolean) => void} triggerEffects
 * @property {ReactiveState} ø__reactiveState Escape hatch — the underlying ReactiveState
 */

/**
 * Standard plugin priority levels.
 * @enum {number}
 */
const DefaultPluginPriorities = {
  /** Process as late as possible */
  LATE: -1,
  /** Plugins that can be overridden by others */
  OVERRIDABLE: 10,
  /** Plugins that stop further processing */
  STOPPER: 50,
};

/** @typedef {(args: {node: Element, pluginState?: any, subkey: string, expr: string, compiledExpression: ASTNode, attributeName: string, attributeValue: string, state: any, evaluate: Function, evaluateAst: Function, getSetter: Function, compose: Function, consume: Function, triggerEffects: Function}) => void} PluginDestroyerFn*/

/**
 * @template Ttracked
 * @typedef {Object} VelinPlugin
 * @property {string} name
 * @property {number=} priority
 * @property {(args: {compiledExpression: ASTNode, expr: string, node: Node, subkey: string | null, attributeName: string, attributeValue: string, state: any, evaluate: Function, evaluateAst: Function, getSetter: Function, compose: Function, consume: Function, triggerEffects: Function}) => Ttracked} [track] Optional function to track dependencies from an expression
 * @property {(args: {compiledExpression: ASTNode, expr: string, node: Element, subkey: string | null, tracked: Ttracked, pluginState?: any, attributeName: string, attributeValue: string, state: any, evaluate: Function, evaluateAst: Function, getSetter: Function, compose: Function, consume: Function, triggerEffects: Function, ø__rerootDebug?: (newNode: Node | null) => void}) => PluginControl | void} render Function to apply reactive updates to a node
 * @property {PluginDestroyerFn} [destroy]
 */

/**
 * @typedef {Object} ASTToken
 * @property {'BOOLEAN'|'NULL'|'IDENTIFIER'|'NUMBER'|'STRING'|'ASSIGNMENT'|'PUNCTUATION'|'OPERATOR'|'UNDEFINED'} type
 * @property {string|number|boolean|null|undefined} value
 */

/**
 * @typedef {(expr: string) => Array<ASTToken>} Tokenizer
 */

/**
 * @typedef {Object} ASTNodeBase
 * @property {string} type The type of the AST node
 */

/**
 * @typedef {ASTNodeBase & {
 *   type: 'Sequence',
 *   expressions: Array<ASTNode>
 * }} ASTSequenceNode
 */

/**
 * @typedef {ASTNodeBase & {
 *   type: 'Assignment',
 *   left: ASTIdentifierNode | ASTMemberNode,
 *   right: ASTNode
 * }} ASTAssignmentNode
 */

/**
 * @typedef {ASTNodeBase & {
 *   type: 'Ternary',
 *   test: ASTNode,
 *   consequent: ASTNode,
 *   alternate: ASTNode
 * }} ASTTernaryNode
 */

/**
 * @typedef {ASTNodeBase & {
 *   type: 'Binary',
 *   operator: string,
 *   left: ASTNode,
 *   right: ASTNode
 * }} ASTBinaryNode
 */

/**
 * @typedef {ASTNodeBase & {
 *   type: 'Unary',
 *   operator: string,
 *   argument: ASTNode
 * }} ASTUnaryNode
 */

/**
 * @typedef {ASTNodeBase & {
 *   type: 'Call',
 *   callee: ASTMemberNode,
 *   arguments: Array<ASTNode>
 * }} ASTCallNode
 */

/**
 * @typedef {ASTNodeBase & {
 *   type: 'Member',
 *   object: ASTNode,
 *   property: ASTNode,
 *   computed: boolean
 * }} ASTMemberNode
 */

/**
 * @typedef {ASTNodeBase & {
 *   type: 'Literal',
 *   value: string | number | boolean | null | undefined
 * }} ASTLiteralNode
 */

/**
 * @typedef {ASTNodeBase & {
 *   type: 'Identifier',
 *   name: string
 * }} ASTIdentifierNode
 */

/**
 * @typedef {ASTNodeBase & {
 *   type: 'ObjectLiteral',
 *   properties: Array<{ key: string, value: ASTNode } | { spread: true, argument: ASTNode }>
 * }} ASTObjectLiteralNode
 */

/**
 * @typedef {ASTNodeBase} ASTNode
 */

/**
 * @typedef {(tokens: Array<ASTToken>) => ASTNode} Parser
 */

/**
 * @typedef {(ast: ASTNode, reactiveState: ReactiveState) => any} EvaluateAST
 */

/**
 * @typedef {(expr: string) => ASTNode} Compile
 */

/**
 * @typedef {Object} VelinInternal
 * @property {WeakMap<Node, any>} pluginStates
 * @property {(state: any) => ReactiveState | undefined} getWrapper Test/introspection helper: look up the ReactiveState wrapper for a proxy previously returned by Velin.bind().
 * @property {(node: Element, attr: string, expr: string) => void} consumeAttribute
 * @property {(prop: string, reactiveState: ReactiveState, mutationSeq?: number, recapture?: boolean) => void} triggerEffects
 * @property {(code: string, text: string | false, ctx?: string) => string} fmt Formats a coded message; full text in dev builds, code + docs link in production. Pass the text as `__DEV__ && \`…\`` so it is dropped from production bundles.
 */

/**
 * @template Ttracked
 * @typedef {Object} VelinPluginManager
 * @property {RegisterPlugin<Ttracked>} registerPlugin
 * @property {ProcessPlugin<Ttracked>} processPlugin
 * @property {LookupPlugin<Ttracked>} lookupPlugin
 * @property {(pluginKey: string) => VelinPlugin<Ttracked>} get
 * @property {{ [key in keyof typeof DefaultPluginPriorities]: number }} priorities
 */

/**
 * @typedef {Object} PluginControl
 * @property {any=} pluginState Optional plugin state to persist across renders (was `state` before ADR-0002)
 * @property {boolean=} halt Optional signal whether to stop processing further plugins on this node
 * @property {ChildContext|ReactiveState=} scopedState Optional scoped child context for child nodes; prefer a ChildContext from compose()
 * @property {Array<{name: string, value: string}>=} plugins Optional list of attribute-shaped directives to inject into the current node's plugin chain immediately after this plugin. Useful for "macro" plugins that expand into a small set of plumbing directives (e.g. a `vln-table` that emits `vln-fragment` + scoped vars). Injected entries do not leave a `reflect-*` attribute since they were never on the DOM.
 */

/**
 * @template Ttracked
 * @typedef {(def: VelinPlugin<Ttracked>) => void} RegisterPlugin
 */

/** 
 * @template Ttracked
 * @typedef {(plugin: VelinPlugin<Ttracked>, reactiveState: ReactiveState, expr: string, node: Element, attributeName: string, attributeValue: string, subkey?: string | null) => PluginControl | void} ProcessPlugin
 */

/** 
 * @template Ttracked
 * @typedef {(pluginKey: string) => VelinPlugin<Ttracked>} LookupPlugin
 */


/** @typedef {(reactiveState: ReactiveState, expr: string, allowMutations?: boolean) => any} Evaluate */
/** @typedef {(reactiveState: ReactiveState, expr: string) => (value: any) => void} GetSetter */
/** @typedef {(prop: string, reactiveState: ReactiveState) => void} TriggerEffects */
/** @typedef {(node: Node, reactiveState: ReactiveState) => void} ProcessNode */
/** @typedef {(node: Element, attr: string, expr: string) => void} ConsumeAttribute */

/** @typedef {(reactiveState: ReactiveState, init: ComposeInit) => ReactiveState} ComposeState */
/** @typedef {(parentState: ReactiveState | null, innerState: ReactiveState, node?: Node | null) => void} CleanupState */
/** @typedef {<T extends object>(root?: Element | DocumentFragment, initialState?: T) => T} Bind */

/** @typedef {(args: { expr: string, compiledExpression: ASTNode, evaluate: Function, evaluateAst: Function, getSetter: Function, compose: Function, consume: Function, triggerEffects: Function, state: any, node: Node, subkey: string | null }) => any} ExpressionTracker */
/** @typedef {(args: { expr: string, compiledExpression: ASTNode, evaluate: Function, evaluateAst: Function, getSetter: Function, compose: Function, consume: Function, triggerEffects: Function, state: any, node: Node, subkey: string | null }) => (value: any) => void} SetterTracker */
/**
 * @typedef {Object} Trackers
 * @property {ExpressionTracker} expressionTracker
 * @property {SetterTracker} setterTracker
 * @property {() => void} noTracker
 */

/**
 * @typedef {Object} VelinCore
 * @property {Bind} bind
 * @property {(state: any) => void} unbind Tears down a root bound by Velin.bind(). Clears every effect, every composed child state, fires every plugin's destroy. Idempotent; throws if the argument is not a state returned by Velin.bind().
 * @property {VelinPluginManager<any>} plugins
 * @property {Evaluate} evaluate
 * @property {EvaluateAST} evaluateAst
 * @property {Compile} compile
 * @property {GetSetter} getSetter
 * @property {ComposeState} composeState
 * @property {CleanupState} cleanupState
 * @property {ProcessNode} processNode
 * @property {Trackers} trackers
 * @property {(state: any) => VelinStateControl} getController Returns the scheduler control for a bound state (the object returned by Velin.bind(), or `this` inside a state method). Use `.batch(fn)` on the result to batch effects across mutations.
 * @property {VelinInternal} ø__internal
 */

// ── Error messages ────────────────────────────────────────────────────────
// Development builds carry the full text. Production builds carry only the
// code and a link, so the text doesn't ship:
//   dev:  [VLN014] Async mutation error: Property 'x' was mutated after …
//   prod: [VLN014] https://tfrascaroli.github.io/velin/e/VLN014
// This constant is the one place the link lives. The pages it points to are
// generated from docs/errors.md by scripts/stage-site.js, which must use the
// same base path.
const ERROR_DOCS_URL = "https://tfrascaroli.github.io/velin/e/";

/**
 * @param {string} code VLNxxx
 * @param {string|false} text full message; write it as `__DEV__ && \`…\`` so the
 *   literal is dropped from production builds
 * @param {string} [ctx] short dynamic detail kept in production too
 */
function fmt(code, text, ctx) {
  return `[${code}] ${text || ERROR_DOCS_URL + code + (ctx ? " " + ctx : "")}`;
}

/** @type {Map<string, VelinPlugin<any>>} */
const plugins = new Map();
/** @type {WeakMap<Node, any>} */
const pluginStates = new WeakMap();
/** @type {WeakMap<object, ReactiveState>} */
// All live state proxies — roots from Velin.bind() AND children from
// composeState (vln-loop / vln-if / vln-fragment iterations). The wrapper
// struct has `ø__enclosing` for the parent-link, so "is this a child?"
// collapses to `wrapper.ø__enclosing != null`. Cleaned states are deleted.
/** @type {WeakMap<object, ReactiveState>} */
const states = new WeakMap();
// Per-evaluation scope proxies (what `this` is inside a state method called
// from a directive) answer this symbol with their wrapper, so APIs that take
// "a state" accept them too. Never enumerable, never user-visible.
const ø__SCOPE = Symbol("velin.scope");

if (__DEV__) {
  // eslint-disable-next-line
  var { createDevHook, DEBUG_PATH_RING } = require("./velin-devhook.js");
  // eslint-disable-next-line no-var
  var hook = createDevHook();
  hook.plugins = plugins;
  hook.pluginStates = pluginStates;
  if (typeof window !== "undefined") {
    /** @type {any} */ (window).__VELIN_DEVTOOLS_HOOK__ = hook;
  }
}

/**
 *
 * @param {Array} arr
 * @returns {any=}
 */
function peek(arr) {
  return arr[arr.length - 1];
}

function wrapE(fn, expr) {
  try {
    return fn();
  } catch (error) {
    const exprStr = typeof expr === 'string' ? expr : (expr && expr.type ? `AST:${expr.type}` : JSON.stringify(expr));
    console.error(fmt("VLN017", __DEV__ && `Error evaluating expression '${exprStr}':`, exprStr), error.message);
    if (__DEV__ && error.stack) {
      console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    return undefined;
  }
}

/**
 * Tracks dependencies by evaluating the expression.
 * Used by plugins that need to reactively display or compute values.
 * @type {Trackers}
 */
const trackers = {
  /**
   * Tracks dependencies by evaluating the expression.
   * Used by plugins that need to reactively display or compute values.
   *
   * @example
   * // Used in vln-text plugin to display reactive content
   * Velin.plugins.registerPlugin({
   *   name: 'text',
   *   track: Velin.trackers.expressionTracker,
   *   render: ({ node, tracked }) => {
   *     node.textContent = tracked ?? '';
   *   }
   * });
   *
   * @example
   * Velin.plugins.registerPlugin({
   *   name: 'show',
   *   track: Velin.trackers.expressionTracker,
   *   render: ({ node, tracked }) => {
   *     node.style.display = tracked ? '' : 'none';
   *   }
   * });
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/plugins.md|Creating Plugins Guide}
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/api-reference.md#velintrackersexpressiontracker|API Reference}
   */
  expressionTracker: ({ evaluateAst, compiledExpression }) =>
    wrapE(() => evaluateAst(compiledExpression), compiledExpression),

  /**
   * Returns a setter function for the expression's target property.
   * Used by plugins that need two-way data binding.
   *
   * @example
   * // Used in vln-input plugin for two-way binding
   * Velin.plugins.registerPlugin({
   *   name: 'input',
   *   track: Velin.trackers.setterTracker,
   *   render: ({ node, tracked: setter, reactiveState, expr }) => {
   *     node.addEventListener('input', (e) => {
   *       setter(e.target.value);
   *     });
   *   }
   * });
   *
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/plugins.md|Creating Plugins Guide}
   * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/api-reference.md#velintrackerssettertracker|API Reference}
   */
  setterTracker: ({ getSetter, expr }) => wrapE(() => getSetter(expr), expr),

  /**
   * No-op tracker for plugins that don't need to track dependencies.
   */
  noTracker: () => {},
};

/**
 * Registers a Velin plugin to create custom directives.
 * @type {RegisterPlugin<any>}
 * @example
 * Velin.plugins.registerPlugin({
 *   name: 'uppercase',
 *   render: ({ node, tracked }) => {
 *     node.textContent = String(tracked).toUpperCase();
 *   },
 *   track: Velin.trackers.expressionTracker
 * });
 */
function registerPlugin(def) {
  plugins.set(def.name, {
    ...def,
  });
}

/**
 * Builds a ChildContext wrapping a freshly-composed substate. Plugins use this
 * instead of touching the raw ReactiveState — see ADR-0002 D2/D6.
 * @param {ReactiveState} parentState
 * @param {ComposeInit} init
 * @returns {any} ChildContext (shape documented in ADR-0002)
 */
function buildChildContext(parentState, init) {
  const childState = composeState(parentState, init);
  const ctx = {
    get state() { return childState.state; },
    /** @param {string} expr @param {boolean=} allowMutations */
    evaluate(expr, allowMutations) { return evaluate(childState, expr, allowMutations); },
    /** @param {ASTNode} ast */
    evaluateAst(ast) { return evaluateAst(ast, childState); },
    /** @param {string} expr */
    getSetter(expr) { return getSetter(childState, expr); },
    /** @param {ComposeInit} nestedInit */
    compose(nestedInit) { return buildChildContext(childState, nestedInit); },
    /** @param {string} expr */
    anchor(expr) {
      const existing = childState.tricklingRoots ?? [];
      if (!existing.includes(expr)) {
        childState.tricklingRoots = [...existing, expr];
      }
      return ctx;
    },
    /** @param {string} key @param {Interpolation} interp */
    setInterpolation(key, interp) {
      childState.interpolations.set(key, interp);
      return ctx;
    },
    /** @param {Node} node */
    processNode(node) {
      if (__DEV__) hook.ø__registerStateNode(childState, node);
      processNode(node, childState);
    },
    /** @param {Node=} node */
    cleanup(node) { cleanupState(parentState, childState, node); },
    /** @param {string} prop @param {boolean=} recapture */
    triggerEffects(prop, recapture) { triggerEffects("root." + prop, childState, undefined, recapture); },
    /** Internal handle for processNode/scopedState unwrap. */
    ø__reactiveState: childState,
  };
  return ctx;
}

/**
 * Builds the per-substate helper bundle that is spread into every plugin
 * call's args. Built once per ReactiveState (in setupState/composeState),
 * not once per render — see ADR-0002 D7.
 * @param {ReactiveState} reactiveState
 */
function buildPluginHelpers(reactiveState) {
  return {
    /** User-facing Proxy. Reading goes through dep-tracking when a tracker is active. */
    state: reactiveState.state,
    /** @param {string} expr @param {boolean=} allowMutations */
    evaluate: (expr, allowMutations) => evaluate(reactiveState, expr, allowMutations),
    /** @param {ASTNode} ast */
    evaluateAst: (ast) => evaluateAst(ast, reactiveState),
    /** @param {string} expr */
    getSetter: (expr) => getSetter(reactiveState, expr),
    /** @param {ComposeInit} init */
    compose: (init) => buildChildContext(reactiveState, init),
    /** @param {Node} node */
    processNode: (node) => processNode(node, reactiveState),
    /** @param {HTMLElement} node @param {string} name @param {string} value */
    consume: (node, name, value) => consumeAttribute(node, name, value),
    /** @param {string} prop @param {boolean=} recapture */
    triggerEffects: (prop, recapture) => triggerEffects("root." + prop, reactiveState, undefined, recapture),
    /** @param {() => void} fn */
    batch: (fn) => reactiveState.ø__control.batch(fn),
  };
}

/**
 * Processes a plugin on a specific node.
 * @type {ProcessPlugin<any>}
 */
function processPlugin(
  plugin,
  reactiveState,
  expr,
  node,
  attributeName,
  attributeValue,
  subkey = null,
) {
  /** @type {DepCapture} */
  const depCapture = { capturingDeps: true, deps: new Set() };
  reactiveState.ø__depCaptures.push(depCapture);
  const nodeState = pluginStates.get(node) || {};
  const stateKey = plugin.name + (subkey ? "_" + subkey : "");
  nodeState[stateKey] = {};

  /** @type {ASTNode} */
  let compiledExpression;
  try {
    compiledExpression = compile(expr);
  } catch (error) {
    if (__DEV__) hook.ø__emit({ kind: "warn", code: "W007", state: reactiveState, message: `compile-throw in ${plugin.name}: ${error && error.message}`, ref: { expr, node } });
    console.error(fmt("VLN017", __DEV__ && `Error occurred while compiling expression '${expr}' in plugin '${plugin.name}':`, `${plugin.name}: ${expr}`), error);
    reactiveState.ø__depCaptures.pop();
    return { halt: true };
  }
  if (__DEV__) hook.ø__emit({ kind: "compile", state: reactiveState, expr });
  nodeState[stateKey + "__ø__exprAST"] = compiledExpression;
  if (!nodeState["ø__originalNode"]) {
    nodeState["ø__originalNode"] = node.cloneNode(true);
  }
  nodeState[stateKey + "__ø__lastTriggerID"] = null;

  pluginStates.set(node, nodeState);
  try {
    reactiveState.ø__finalizers.push(() => {
      if (plugin.destroy) {
        plugin.destroy({
          ...reactiveState.ø__helpers,
          node,
          pluginState: nodeState[stateKey],
          subkey,
          expr,
          compiledExpression,
          attributeName,
          attributeValue,
        });
      }
      if (__DEV__) hook.ø__emit({ kind: "plugin", state: reactiveState, name: plugin.name, node, expr, subkey, phase: "destroy" });
      nodeState[stateKey] = null;
      nodeState[stateKey + "__ø__exprAST"] = null;
      nodeState[stateKey + "__ø__lastTriggerID"] = null;

      const isFullyCleaned = Object.keys(nodeState).every(
        (k) => k === "ø__originalNode" || nodeState[k] === null,
      );
      if (isFullyCleaned) {
        pluginStates.delete(node);
      }
    });
    const track = () =>
      plugin.track
        ? plugin.track({
            ...reactiveState.ø__helpers,
            compiledExpression,
            expr,
            node,
            subkey,
            attributeName,
            attributeValue,
          })
        : null;
    try {
      if (__DEV__) hook.ø__emit({ kind: "plugin", state: reactiveState, name: plugin.name, node, expr, subkey, phase: "track" });
      track();
    } catch (error) {
      if (__DEV__) hook.ø__emit({ kind: "warn", code: "W004", state: reactiveState, message: `track-throw in ${plugin.name}: ${error && error.message}`, ref: { expr, node } });
      console.error(fmt("VLN017", __DEV__ && `Error occurred while tracking expression '${expr}' in plugin '${plugin.name}':`, `${plugin.name}: ${expr}`), error);
    }
    depCapture.capturingDeps = false;
    /** @type {Set<string>} Paths this effect is currently bound to. */
    let bound = new Set();
    // Binds the effect to what depCapture.deps holds now, dropping paths it
    // no longer reads. Deps at or above ANY trickling root in the stack are
    // filtered out. Stacking matters for nested loops: the inner loop must
    // not lose the outer loop's anchor, otherwise cells re-register on the
    // outer array (see ADR-0001).
    const rebind = () => {
      const roots = reactiveState.tricklingRoots;
      /** @type {Set<string>} */
      const next = new Set();
      for (const e of depCapture.deps) {
        if (!(roots && roots.length && roots.some((r) => (r.startsWith("root.") ? r : `root.${r}`).startsWith(e)))) next.add(e);
      }
      for (const d of bound) {
        if (next.has(d)) continue;
        const set = reactiveState.bindings.get(d);
        set?.delete(effect);
        if (set && !set.size) reactiveState.bindings.delete(d);
        reactiveState.ø__innerBindings?.get(d)?.delete(effect);
      }
      for (const d of next) {
        if (bound.has(d)) continue;
        if (!reactiveState.bindings.has(d)) reactiveState.bindings.set(d, new Set());
        reactiveState.bindings.get(d).add(effect);
        if (reactiveState.ø__innerBindings) {
          if (!reactiveState.ø__innerBindings.has(d)) reactiveState.ø__innerBindings.set(d, new Set());
          reactiveState.ø__innerBindings.get(d).add(effect);
        }
      }
      bound = next;
      if (__DEV__ && /** @type {any} */ (effect).ø__debug) /** @type {any} */ (effect).ø__debug.reads = [...next];
    };
    /** @type {VelinBindingEffect} */
    const effect = (recapture) => {
      if (!nodeState?.[stateKey]) return; // Is finalized
      let tracked;
      if (recapture) {
        // The write that woke us replaced an object/array or mutated an
        // array: whatever we read now may not have existed at first capture
        // (ADR-0006). Capture again and rebind.
        depCapture.deps = new Set();
        depCapture.capturingDeps = true;
        reactiveState.ø__depCaptures.push(depCapture);
        try {
          tracked = track();
        } finally {
          reactiveState.ø__depCaptures.pop();
          depCapture.capturingDeps = false;
        }
        rebind();
      } else tracked = track();
      if (__DEV__) hook.ø__emit({ kind: "plugin", state: reactiveState, name: plugin.name, node, expr, subkey, phase: "render" });
      let control;
      try {
        control = plugin.render({
          ...reactiveState.ø__helpers,
          compiledExpression,
          node,
          subkey,
          tracked,
          pluginState: nodeState[stateKey],
          attributeName,
          attributeValue,
          expr,
          // Dev-only: let plugins re-anchor this effect's debug node when
          // they replace the original with a placeholder/different live
          // node (e.g. vln-loop replaces the template with a placeholder).
          // No-op in prod builds — devtools don't exist to care.
          ø__rerootDebug: __DEV__ ? (newNode) => {
            const d = /** @type {any} */ (effect).ø__debug;
            if (!d) return;
            d.node = newNode;
            if (newNode) {
              hook.ø__registerEffectNode(newNode, effect);
              if (typeof document !== "undefined" && document.contains(newNode)) {
                d.wasConnected = true;
              }
            }
          } : undefined,
        });
      } catch (error) {
        if (__DEV__) hook.ø__emit({ kind: "warn", code: "W006", state: reactiveState, message: `render-throw in ${plugin.name}: ${error && error.message}`, ref: { expr, node } });
        console.error(fmt("VLN017", __DEV__ && `Error occurred while rendering expression '${expr}' in plugin '${plugin.name}':`, `${plugin.name}: ${expr}`), error);
        // Treat as halt: skip the subtree of this node, keep processing siblings.
        return { halt: true };
      }
      if (control && control.pluginState) {
        nodeState[stateKey] = control.pluginState;
        pluginStates.set(node, nodeState);
      }

      return control;
    };
    if (__DEV__) {
      /** @type {any} */ (effect).ø__debug = {
        node, expr, pluginName: plugin.name, subkey,
        state: reactiveState,
        recentPaths: new Array(DEBUG_PATH_RING),
        ø__pathRingHead: 0,
        recentRuns: new Array(DEBUG_PATH_RING),
        ø__runRingHead: 0,
        reads: [],
        // Was this effect ever bound to a node that was in the document? Used
        // by leaks() to distinguish real leaks from internal template-clone
        // effects (vln-loop's cloneable prototype never attaches to the DOM).
        wasConnected: node != null && typeof document !== "undefined" && document.contains(node),
      };
      if (node) hook.ø__registerEffectNode(node, effect);
    }
    rebind();
    return effect();
  } finally {
    reactiveState.ø__depCaptures.pop();
  }
}

/**
 * Tokenizer for CSP-safe expression evaluation
 * @type {Tokenizer}
 */
function tokenize(expr) {
  /** @type {Array<ASTToken>} */
  const tokens = [];
  // whitespace | number | string | identifier | operator | punctuation | assignment
  const re = /\s+|(\d+(?:\.\d*)?)|(["'])((?:\\.|(?!\2)[^\\])*)\2|([A-Za-z_$][\w$]*)|([=!]==?|&&|\|\||[<>]=?|[-+*\/%!])|(\.\.\.|[()[\]{}.,?:])|=/y;
  // Keyword literals → [token type, value]
  const KW = { __proto__: null, true: ["BOOLEAN", true], false: ["BOOLEAN", false], null: ["NULL", null], undefined: ["UNDEFINED", undefined] };
  while (re.lastIndex < expr.length) {
    const i = re.lastIndex;
    const m = re.exec(expr);
    if (!m) throw new Error(fmt("VLN015", __DEV__ && `Unexpected character '${expr[i]}' in expression`));
    const [, num, quote, str, id, op, punc] = m;
    if (num) tokens.push({ type: "NUMBER", value: parseFloat(num) });
    else if (quote) tokens.push({ type: "STRING", value: str.replace(/\\(.)/g, "$1") });
    else if (id) tokens.push(KW[id] ? { type: KW[id][0], value: KW[id][1] } : { type: "IDENTIFIER", value: id });
    else if (op) tokens.push({ type: "OPERATOR", value: op });
    else if (punc) tokens.push({ type: "PUNCTUATION", value: punc });
    else if (m[0] === "=") tokens.push({ type: "ASSIGNMENT", value: "=" });
  }
  return tokens;
}

/**
 * Parser for CSP-safe expression evaluation
 * @type {Parser}
 */
function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  // Is the current token of this type (and value)?
  const at = (type, value) => {
    const t = peek();
    return !!t && t.type === type && (value === undefined || t.value === value);
  };
  // Consume the current token if it matches; returns it (or undefined)
  const eat = (type, value) => (at(type, value) ? next() : undefined);
  const bad = (msg) => {
    throw new Error(fmt("VLN015", msg));
  };
  const expect = (type, value) =>
    eat(type, value) || bad(__DEV__ && `Expected ${type} ${value || ""}, got ${peek() ? peek().type : "EOF"}`);

  // Binary operator precedence (higher binds tighter)
  const PREC = { "||": 1, "&&": 2, "===": 3, "!==": 3, "==": 3, "!=": 3, ">": 4, "<": 4, ">=": 4, "<=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };

  function parseSequence() {
    const expressions = [parseAssignment()];
    while (eat("PUNCTUATION", ",")) expressions.push(parseAssignment());
    return expressions.length === 1 ? expressions[0] : { type: "Sequence", expressions };
  }

  function parseAssignment() {
    const node = parseTernary();
    // Right-associative
    return eat("ASSIGNMENT") ? { type: "Assignment", left: node, right: parseAssignment() } : node;
  }

  function parseTernary() {
    const node = parseBinary(0);
    if (!eat("PUNCTUATION", "?")) return node;
    const consequent = parseTernary();
    expect("PUNCTUATION", ":");
    return { type: "Ternary", test: node, consequent, alternate: parseTernary() };
  }

  // Precedence climbing: consumes operators binding tighter than `min`
  function parseBinary(min) {
    let left = parseUnary();
    for (let t, p; (t = peek()) && t.type === "OPERATOR" && (p = PREC[t.value]) > min; ) {
      next();
      left = { type: "Binary", operator: t.value, left, right: parseBinary(p) };
    }
    return left;
  }

  function parseUnary() {
    const t = peek();
    if (t && t.type === "OPERATOR" && "!-+".includes(String(t.value))) {
      next();
      return { type: "Unary", operator: t.value, argument: parseUnary() };
    }
    return parsePostfix();
  }

  // Comma-separated items up to and including `close`
  function parseList(close) {
    const items = [];
    while (!eat("PUNCTUATION", close)) {
      items.push(parseAssignment());
      eat("PUNCTUATION", ",");
    }
    return items;
  }

  function parsePostfix() {
    let node = parsePrimary();
    for (;;) {
      if (eat("PUNCTUATION", ".")) {
        node = { type: "Member", object: node, property: expect("IDENTIFIER").value, computed: false };
      } else if (eat("PUNCTUATION", "[")) {
        const property = parseAssignment();
        expect("PUNCTUATION", "]");
        node = { type: "Member", object: node, property, computed: true };
      } else if (eat("PUNCTUATION", "(")) {
        node = { type: "Call", callee: node, arguments: parseList(")") };
      } else return node;
    }
  }

  function parsePrimary() {
    const token = next();
    if (!token) bad(__DEV__ && "Unexpected end of expression");
    switch (token.type) {
      case "NUMBER":
      case "STRING":
      case "BOOLEAN":
      case "NULL":
      case "UNDEFINED":
        return { type: "Literal", value: token.value };
      case "IDENTIFIER":
        return { type: "Identifier", name: token.value };
    }
    if (token.type === "PUNCTUATION") {
      if (token.value === "(") {
        const node = parseSequence();
        expect("PUNCTUATION", ")");
        return node;
      }
      if (token.value === "[") return { type: "ArrayLiteral", elements: parseList("]") };
      if (token.value === "{") {
        const properties = [];
        while (!eat("PUNCTUATION", "}")) {
          if (eat("PUNCTUATION", "...")) {
            properties.push({ spread: true, argument: parseAssignment() });
          } else {
            const keyToken = next();
            if (!keyToken || (keyToken.type !== "IDENTIFIER" && keyToken.type !== "STRING"))
              bad(__DEV__ && "Bad property name in object literal");
            const key = keyToken.value;
            let value;
            if (eat("PUNCTUATION", ":")) value = parseAssignment();
            else if (keyToken.type === "IDENTIFIER") value = { type: "Identifier", name: key }; // shorthand { foo }
            else bad(__DEV__ && "Shorthand object property must be an identifier");
            properties.push({ key, value });
          }
          eat("PUNCTUATION", ",");
        }
        return { type: "ObjectLiteral", properties };
      }
    }
    if (__DEV__) {
      const contextTokens = tokens
        .slice(Math.max(0, pos - 4), pos + 3)
        .map((t) => `${t.type}:${t.value}`)
        .join(" ");
      bad(`Unexpected token in expression: ${token.type} "${token.value}" at position ${pos - 1}. Context: ${contextTokens}`);
    }
    bad();
  }

  return parseSequence();
}

/**
 * Evaluates an AST node against a context (the scope proxy).
 * @param {any} ast  AST node (the union is not discriminated for narrowing, so `any` here)
 * @param {Record<string, any>} context
 */
function evalAst(ast, context) {
  const ev = (n) => evalAst(n, context);
  // Property key of a Member node
  const keyOf = (m) => (m.computed ? ev(m.property) : m.property);
  switch (ast.type) {
    case "Literal":
      return ast.value;
    case "Identifier":
      return context[ast.name];
    case "Member": {
      const obj = ev(ast.object);
      return obj == null ? undefined : obj[keyOf(ast)];
    }
    case "Call": {
      const c = ast.callee;
      // Method calls bind `this` to the receiver, which is evaluated once
      const thisArg = c.type === "Member" ? ev(c.object) : context;
      const fn = c.type === "Member" ? (thisArg == null ? undefined : thisArg[keyOf(c)]) : ev(c);
      if (typeof fn !== "function") throw new TypeError("Not a function");
      return fn.apply(thisArg, ast.arguments.map(ev));
    }
    case "Unary": {
      const a = ev(ast.argument);
      return ast.operator === "!" ? !a : ast.operator === "-" ? -a : +a;
    }
    case "Binary": {
      // Eager on purpose: one-shot dependency capture (ADR-0003) relies on both sides being read
      const l = ev(ast.left), r = ev(ast.right);
      switch (ast.operator) {
        case "&&": return l && r;
        case "||": return l || r;
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
        case "%": return l % r;
        case ">": return l > r;
        case "<": return l < r;
        case ">=": return l >= r;
        case "<=": return l <= r;
        case "===": return l === r;
        case "!==": return l !== r;
        case "==": return l == r;
        case "!=": return l != r;
      }
      return;
    }
    case "Ternary":
      return ev(ast.test) ? ev(ast.consequent) : ev(ast.alternate);
    case "ArrayLiteral":
      return ast.elements.map(ev);
    case "ObjectLiteral": {
      const result = {};
      for (const p of ast.properties) {
        if (p.spread) {
          const s = ev(p.argument);
          if (s != null && typeof s === "object") Object.assign(result, s);
          continue;
        }
        result[p.key] = ev(p.value);
      }
      return result;
    }
    case "Assignment": {
      const value = ev(ast.right), l = ast.left;
      if (l.type === "Identifier") context[l.name] = value;
      else if (l.type === "Member") {
        const obj = ev(l.object);
        if (obj == null) throw new TypeError("Cannot set property on null or undefined");
        obj[keyOf(l)] = value;
      } else throw new Error(fmt("VLN016", __DEV__ && "Invalid assignment target"));
      return value;
    }
    case "Sequence": {
      let r;
      for (const e of ast.expressions) r = ev(e);
      return r;
    }
  }
  throw new Error(fmt("VLN016", __DEV__ && `Bad AST node: ${ast.type}`));
}

/**
 * Compiles a JavaScript expression into an AST.
 * CSP-safe implementation using tokenizer + parser (no eval/Function).
 * @type {Compile}
 *
 * @example
 * // Basic usage
 * const ast = Velin.ast.compile('count * 2 + 1');
 *
 */
function compile(expr) {
  // Bare directive (attribute with no value, e.g. `<div vln-outlet>`) yields
  // an undefined literal. Plugins that want to accept bare usage can just
  // check `if (expr && expr.trim() !== "")` and treat the miss as "default".
  if (expr == null || expr.trim() === "") {
    return /** @type {any} */ ({ type: "Literal", value: undefined });
  }
  const tokens = tokenize(expr);
  const ast = parse(tokens);
  if (__DEV__ && ast && typeof ast === "object") /** @type {any} */ (ast).ø__src = expr;
  return ast;
}

/**
 * Evaluates a whole AST against a given state
 * @type {EvaluateAST}
 */

function evaluateAst(ast, reactiveState) {
  // Interpolation lookup + chain-walk is handled by the per-scope Proxy
  // installed on reactiveState.state in composeState. This wrapper adds:
  //   - mutation guards (async-safety + evaluation-time write ban)
  //   - dev-mode case-mismatch warning
  const contextualizedProxy = new Proxy(reactiveState.state, {
    get(target, prop, receiver) {
      if (prop === ø__SCOPE) return reactiveState;
      const value = Reflect.get(target, prop, receiver);
      if (
        __DEV__ &&
        value === undefined &&
        typeof prop === "string" &&
        /[A-Z]/.test(prop)
      ) {
        // Case-mismatch warning: HTML lowercases attribute names, so an
        // identifier like `nodeId` may exist as `nodeid` if it came from a
        // vln-loop:nodeId or similar. Ask the chain about the lowercased
        // version; if it resolves, warn.
        const lower = prop.toLowerCase();
        if (lower !== prop) {
          const lowerVal = Reflect.get(target, lower, receiver);
          if (lowerVal !== undefined || Reflect.has(target, lower)) {
            console.warn(fmt("VLN018",
              `Identifier '${prop}' not found in scope. Did you mean '${lower}'? ` +
              `HTML lowercases attribute names, so vln-loop:${prop}="..." (or similar) ` +
              `binds as '${lower}'. Use lowercase or kebab-case in HTML attribute names.`
            ));
          }
        }
      }
      return value;
    },
    set(target, prop, value, receiver) {
      if (!reactiveState.ø__control) {
        throw new Error(fmt("VLN014", __DEV__ && `Async mutation error: Property '${String(prop)}' was mutated after the evaluation context was cleaned up. This usually happens when an async operation in an event handler (or similar) tries to update state after the element has been removed or the scope destroyed.`));
      }
      if (reactiveState.ø__control.evaluating)
        throw new Error(fmt("VLN010", __DEV__ && "Setting values during evaluation is forbidden. Use Velin.getSetter"));
      return Reflect.set(target, prop, value, receiver);
    },
  });
  if (__DEV__) {
    const src = (ast && /** @type {any} */ (ast).ø__src) || "";
    // Top-level evaluation (nothing else running) = an entry point such as
    // a vln-on handler. Writes it makes are attributed to it.
    const opened = hook.ø__enterSource(src);
    const t0 = hook.ø__now();
    try {
      const r = evalAst(ast, contextualizedProxy);
      const dt = hook.ø__now() - t0;
      hook.ø__recordExpressionEval(src, dt);
      hook.ø__emit({ kind: "evaluate", state: reactiveState, expr: src, durationMs: dt, ok: true });
      return r;
    } catch (err) {
      const dt = hook.ø__now() - t0;
      hook.ø__emit({ kind: "evaluate", state: reactiveState, expr: src, durationMs: dt, ok: false, error: err && err.message });
      throw err;
    } finally {
      hook.ø__exitSource(opened);
    }
  }
  return evalAst(ast, contextualizedProxy);
}

/**
 * Evaluates a JavaScript expression against the reactive state.
 * CSP-safe implementation using tokenizer + parser + AST walker (no eval/Function).
 *
 * Used to evaluate directive expressions like `vln-text="message"` or `vln-if="count > 0"`.
 * Automatically tracks property access during evaluation for reactivity.
 *
 * @param {ReactiveState} reactiveState - The reactive state
 * @param {string} expr - Expression to evaluate
 * @param {boolean} allowMutations - If true, allows called functions to mutate state (for event handlers)
 * @returns {any} Result of evaluation
 *
 * @example
 * // Basic evaluation
 * const result = Velin.evaluate(reactiveState, 'count * 2');
 *
 * @example
 * // Used in vln-on plugin for event handlers with mutations allowed
 * Velin.plugins.registerPlugin({
 *   name: 'on',
 *   render: ({ reactiveState, expr, node, subkey }) => {
 *     const handler = () => Velin.evaluate(reactiveState, expr, true);
 *     node.addEventListener(subkey, handler);
 *   }
 * });
 *
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/api-reference.md#velintrackersevaluate|API Reference}
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/getting-started.md#expressions-are-javascript|Getting Started: Expressions}
 */
function evaluate(reactiveState, expr, allowMutations = false) {
  if (!reactiveState.ø__control) {
    throw new Error(fmt("VLN014", __DEV__ && `Async mutation error: Expression "${expr}" evaluation was attempted after the state was cleaned up.`));
  }
  reactiveState.ø__control.evaluating = !allowMutations;
  try {
    const ast = compile(expr);
    return evaluateAst(ast, reactiveState);
  } catch (err) {
    console.error(fmt("VLN017", __DEV__ && `Velin evaluate() error in expression "${expr}".`, expr));
    throw err;
  } finally {
    if (reactiveState.ø__control) {
      reactiveState.ø__control.evaluating = false;
    }
  }
}

/**
 * Creates a setter function for the last property in an expression path.
 *
 * Used to enable two-way data binding in form controls. The setter function
 * will trigger reactivity when called with a new value.
 *
 * @type {GetSetter}
 *
 * @example
 * // Basic usage
 * const setter = Velin.getSetter(reactiveState, 'user.name');
 * setter('Alice'); // Sets vln.user.name = 'Alice' and triggers updates
 *
 * @example
 * // Used in vln-input plugin for two-way binding
 * const setter = Velin.getSetter(reactiveState, expr);
 * node.addEventListener('input', (e) => {
 *   setter(e.target.value); // Update state when user types
 * });
 *
 * @example
 * // Handling checkboxes
 * node.addEventListener('input', (e) => {
 *   const setter = Velin.getSetter(reactiveState, expr);
 *   setter(e.target.checked); // Set boolean value
 * });
 *
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/api-reference.md#velingetsetter|API Reference}
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/directives.md#vln-input|Directives: vln-input}
 */
function getSetter(reactiveState, expr) {
  const inter = reactiveState.interpolations;
  // If it's an expression interpolation, grab the original expression from it
  const property =
    inter?.has(expr) && inter?.get(expr).type == "EXPR"
      ? inter.get(expr).value.expr
      : expr;
  const lastDotIndex = property.lastIndexOf(".");

  /** @type {(value: any) => any} */
  let set;
  if (lastDotIndex === -1) {
    // Handle root-level properties (no dots)
    set = (value) => (reactiveState.state[property] = value);
  } else {
    const parentPath = property.slice(0, lastDotIndex);
    const key = property.slice(lastDotIndex + 1);
    set = (value) => {
      const parent = evaluate(reactiveState, parentPath);
      if (parent == null)
        throw new TypeError("Cannot set property on null or undefined");
      parent[key] = value;
    };
  }
  if (__DEV__) {
    // Setters are entry points too (vln-input pushes through one).
    const label = `${property} = …`;
    const inner = set;
    set = (value) => {
      const opened = hook.ø__enterSource(label, "input");
      try { return inner(value); } finally { hook.ø__exitSource(opened); }
    };
  }
  return set;
}

/**
 * Triggers all reactive effects bound to a property and clears stale bindings
 * @param {string} prop Property path that changed
 * @param {ReactiveState} reactiveState The reactive state
 * @param {number=} mutationSeq Correlation id from the mutation that caused this trigger (dev-only; may be omitted for user-invoked triggerEffects)
 * @param {boolean=} recapture Woken effects re-capture their dependencies on this run (structural writes, ADR-0006)
 * @returns {void}
 */
function triggerEffects(prop, reactiveState, mutationSeq, recapture) {
  if (!reactiveState.bindings.has(prop)) return;
  const ctrl = reactiveState.ø__control;
  if (__DEV__) {
    hook.ø__emit({ kind: "trigger", state: reactiveState, path: prop, queued: ctrl.batchDepth > 0, effectCount: reactiveState.bindings.get(prop)?.size ?? 0, mutationSeq });
  }
  for (const effect of reactiveState.bindings.get(prop) || []) {
    if (__DEV__ && /** @type {any} */ (effect).ø__debug) {
      const dbg = /** @type {any} */ (effect).ø__debug;
      dbg.recentPaths[dbg.ø__pathRingHead] = prop;
      dbg.ø__pathRingHead = (dbg.ø__pathRingHead + 1) % DEBUG_PATH_RING;
    }
    if (ctrl.batchDepth > 0) {
      // Preserve the mutationSeq of the LAST mutation that queued this
      // effect — that's the one the eventual run gets credited to.
      ctrl.batchQueue.set(effect, mutationSeq || 0);
      if (recapture) ctrl.batchRecapture.add(effect);
    } else {
      if (__DEV__) {
        hook.stats.updateCounter++;
        hook.ø__runEffect(effect, mutationSeq || 0, reactiveState, prop, recapture);
      } else {
        effect(recapture);
      }
    }
  }
}

/**
 * Returns the scheduler control for a bound state: the object returned by
 * Velin.bind(), or `this` inside a state method called from a directive.
 * Composed scopes share their root's controller, so batching from inside a
 * vln-loop row or a vln-on handler batches the whole tree.
 * Callers use `.batch(fn)` on the result to coalesce effects across mutations.
 * @param {any} state
 * @returns {VelinStateControl}
 */
function getController(state) {
  const wrapper = state && typeof state === "object"
    ? (states.get(state) || /** @type {any} */ (state)[ø__SCOPE])
    : null;
  if (!wrapper) {
    throw new Error(fmt("VLN023", __DEV__ && "getController: argument is not a Velin state. Pass the object returned by Velin.bind(), or `this` inside a state method."));
  }
  if (!wrapper.ø__control) {
    throw new Error(fmt("VLN024", __DEV__ && "getController: this scope was torn down (its element was removed or the state unbound)."));
  }
  return wrapper.ø__control;
}

/**
 * A write is structural when it swaps an object or array in or out (as
 * opposed to changing a primitive). Effects it wakes re-capture their
 * dependencies, because the shape they read may have changed (ADR-0006).
 * @param {any} old
 * @param {any} value
 */
function isStructural(old, value) {
  return (old !== null && typeof old === "object") || (value !== null && typeof value === "object");
}

/**
 * Sets up a reactive state proxy wrapping an object or array
 * @param {Object|Array} obj Initial state object/array
 * @returns {ReactiveState} Reactive state with proxies and dependency tracking
 */
function setupState(obj) {
  const ø__depCaptures = [];
  /** @type {VelinStateControl} */
  const ø__control = {
    evaluating: false,
    wrapping: false,
    currentCycleID: null,
    batchDepth: 0,
    /** @type {Map<Function, number>} effect → mutationSeq of the last queuing */
    batchQueue: new Map(),
    batchRecapture: new Set(),
    batch(fn) {
      this.batchDepth++;
      try {
        fn();
      } finally {
        this.batchDepth--;
        if (this.batchDepth === 0 && this.batchQueue.size) {
          const effects = [...this.batchQueue.entries()];
          const recaptures = this.batchRecapture;
          this.batchQueue.clear();
          this.batchRecapture = new Set();
          for (const [effect, seq] of effects) {
            if (__DEV__) {
              hook.stats.updateCounter++;
              const dbg = /** @type {any} */ (effect).ø__debug;
              const path = dbg?.recentPaths?.[dbg?.ø__pathRingHead === 0 ? DEBUG_PATH_RING - 1 : dbg.ø__pathRingHead - 1] ?? "";
              hook.ø__runEffect(effect, seq || 0, reactiveState, path, recaptures.has(effect));
            } else {
              effect(recaptures.has(effect));
            }
          }
        }
      }
    },
  };
  /** @type {ReactiveState} */
  const reactiveState = {
    state: null,
    bindings: new Map(),
    ø__depCaptures,
    ø__control,
    ø__innerStates: new Set(),
    ø__innerBindings: new Map(),
    ø__finalizers: [],
    ø__enclosing: null,
  };
  let init = true;

  /**
   * Wraps an object in a Proxy for dependency tracking
   * @param {Object} obj
   * @param {string} path Property path prefix
   * @returns {Object}
   */
  function wrapObj(obj, path) {
    const state = new Proxy(obj, {
      get(target, prop, receiver) {
        if (prop === "ø__velinObj") return true;
        const depCapture = peek(reactiveState.ø__depCaptures);
        if (depCapture?.capturingDeps)
          depCapture.deps.add(path + "." + prop.toString());
        const value = Reflect.get(target, prop, receiver);

        const dnm = ø__control.wrapping;
        ø__control.wrapping = true;
        try {
          const wrappedValue = wrap(value, path + "." + prop.toString());
          if (wrappedValue !== value) {
            // Targeting target directly to avoid triggering traps recursively
            Reflect.set(target, prop, wrappedValue);
          }
          return wrappedValue;
        } finally {
          if (!dnm) ø__control.wrapping = false;
        }
      },
      set(target, prop, value, receiver) {
        if (!init && ø__control.evaluating && !ø__control.wrapping)
          throw new Error(fmt("VLN010", __DEV__ && "Setting values during evaluation is forbidden. Use Velin.getSetter"));

        const desc = Object.getOwnPropertyDescriptor(target, prop);
        if (desc?.set) {
          desc.set.call(receiver, value);
          return true;
        }

        const old = target[prop];
        const result = Reflect.set(target, prop, value);

        if (old !== value && !init && !ø__control.wrapping) {
          let seq;
          if (__DEV__) {
            const ev = hook.ø__emit({ kind: "mutate", state: reactiveState, path: path + "." + prop.toString(), op: "set", from: old, to: value });
            seq = ev && ev.mutationSeq;
          }
          triggerEffects(path + "." + prop.toString(), reactiveState, seq, isStructural(old, value));
        }
        return result;
      },
    });
    return state;
  }

  /**
   * Wraps an array in a Proxy to track mutations and dependencies
   * @param {Array} arr
   * @param {string} path Property path prefix
   * @returns {Array}
   */
  function wrapArray(arr, path) {
    const arrayProxy = new Proxy(arr, {
      get(target, prop, receiver) {
        if (prop === "ø__velinObj") return true;
        const value = Reflect.get(target, prop, receiver);
        const depCapture = peek(reactiveState.ø__depCaptures);
        const innerPath = path + "[" + prop.toString() + "]";
        if (depCapture?.capturingDeps) {
          // For .length and other properties that depend on array mutations, track the array itself
          if (prop === "length" || typeof value === "function") {
            depCapture.deps.add(path);
          } else {
            depCapture.deps.add(innerPath);
          }
        }

        if (
          typeof value === "function" &&
          [
            "push",
            "pop",
            "shift",
            "unshift",
            "splice",
            "sort",
            "reverse",
          ].includes(prop.toString())
        ) {
          return function (...args) {
            const result = value.apply(target, args);
            if (!init) {
              let seq;
              if (__DEV__) {
                const ev = hook.ø__emit({ kind: "mutate", state: reactiveState, path, op: "arrayMethod", method: prop.toString() });
                seq = ev && ev.mutationSeq;
              }
              triggerEffects(path, reactiveState, seq, true);
            }
            return result;
          };
        }
        const dnm = ø__control.wrapping;
        ø__control.wrapping = true;
        try {
          const wrappedValue = wrap(value, innerPath);
          if (wrappedValue !== value) {
            // Targeting target directly to avoid triggering traps recursively
            Reflect.set(target, prop, wrappedValue);
          }
          return wrappedValue;
        } finally {
          if (!dnm) ø__control.wrapping = false;
        }
      },
      set(target, prop, value, receiver) {
        if (!init && ø__control.evaluating && !ø__control.wrapping)
          throw new Error(fmt("VLN010", __DEV__ && "Setting values during evaluation is forbidden. Use Velin.getSetter"));

        const old = target[prop];

        const desc = Object.getOwnPropertyDescriptor(target, prop);
        let result;
        if (desc?.set) {
          desc.set.call(receiver, value);
          result = true;
        } else {
          result = Reflect.set(target, prop, value);
        }

        if (
          (typeof prop === "number" && !isNaN(prop)) ||
          /^\d+$/.test(prop.toString())
        ) {
          const innerPath = path + "[" + prop.toString() + "]";
          if (old !== value && !init) {
            let seq;
            if (__DEV__) {
              const ev = hook.ø__emit({ kind: "mutate", state: reactiveState, path: innerPath, op: "set", from: old, to: value });
              seq = ev && ev.mutationSeq;
            }
            triggerEffects(innerPath, reactiveState, seq, isStructural(old, value));
          }
        } else if (old !== value && !init && !ø__control.wrapping) {
          let seq;
          if (__DEV__) {
            const ev = hook.ø__emit({ kind: "mutate", state: reactiveState, path: path + "." + prop.toString(), op: "set", from: old, to: value });
            seq = ev && ev.mutationSeq;
          }
          triggerEffects(path + "." + prop.toString(), reactiveState, seq, isStructural(old, value));
          if (prop === "length") {
            let seq2;
            if (__DEV__) {
              const ev2 = hook.ø__emit({ kind: "mutate", state: reactiveState, path, op: "set", from: old, to: value });
              seq2 = ev2 && ev2.mutationSeq;
            }
            triggerEffects(path, reactiveState, seq2, true);
          }
        }
        return result;
      },
    });
    return arrayProxy;
  }

  /**
   * Wraps a value recursively if it's object or array
   * @param {any} value
   * @param {string} path
   * @returns {any}
   */
  function wrap(value, path) {
    const dnm = ø__control.wrapping;
    ø__control.wrapping = true;
    try {
      if (value === null || value === undefined) return value;
      if (value.ø__velinObj) return value;
      if (typeof value === "object") {
        if (Array.isArray(value)) return wrapArray(value, path);
        return wrapObj(value, path);
      }
      return value;
    } finally {
      if (!dnm) ø__control.wrapping = false;
    }
  }

  const state = wrap(obj, "root");
  reactiveState.state = state;
  reactiveState.ø__helpers = buildPluginHelpers(reactiveState);
  init = false;
  return reactiveState;
}

/**
 * Creates a child reactive state with scoped variables. Sole entry point for
 * building a substate — accepts the object form (`{key: {expr, transform?} |
 * {literal}}`) directly and compiles each `expr` into an AST inline.
 * @param {ReactiveState} reactiveState
 * @param {ComposeInit} init
 * @returns {ReactiveState}
 * @type {ComposeState}
 */
function composeState(reactiveState, init) {
  if (!reactiveState) {
    throw new Error(fmt("VLN019", __DEV__ && "composeState requires an enclosing reactiveState"));
  }
  if (!init || typeof init !== "object" || init instanceof Map) {
    throw new Error(fmt("VLN019", __DEV__ && "composeState() expects a plain object like { key: { expr: '…' } | { literal: … } }."));
  }
  /** @type {Map<string, Interpolation>} */
  const lerps = new Map();
  for (const [key, entry] of Object.entries(/** @type {any} */(init))) {
    if (entry && typeof entry === "object" && "expr" in entry) {
      const { expr, transform } = entry;
      /** @type {Interpolation} */
      const interp = { type: "EXPR", value: { expr, ast: compile(expr) } };
      if (typeof transform === "function") interp.transform = transform;
      lerps.set(key, interp);
    } else if (entry && typeof entry === "object" && "literal" in entry) {
      lerps.set(key, /** @type {Interpolation} */({ type: "LITERAL", value: entry.literal }));
    } else {
      throw new Error(fmt("VLN019", __DEV__ && `composeState(): each entry must be { expr: '...' } or { literal: ... }. Got ${JSON.stringify(entry)} for key "${key}".`));
    }
  }

  // Per-scope state proxy. The get trap checks THIS scope's interpolations
  // first; on miss, Reflect.get delegates to the parent's proxy (target),
  // yielding a prototypal-chain lookup up to root's wrapObj proxy.
  //
  // Interpolation expressions evaluate against the ENCLOSING scope
  // (`reactiveState` — captured in closure), giving them JS-closure
  // semantics: an expression's identifiers resolve in the scope where the
  // expression was authored, NOT where the interpolation now lives. This
  // is what breaks same-name shadow recursion (e.g. `vln-vars="{ user: user }"`
  // under `vln-loop:user="users"`).
  const enclosing = reactiveState;
  const innerStateProxy = new Proxy(reactiveState.state, {
    get(target, prop, receiver) {
      const propStr = String(prop);
      if (lerps.has(propStr)) {
        const interp = lerps.get(propStr);
        if (interp.type === "EXPR") {
          const value = evaluateAst(interp.value.ast, enclosing);
          return interp.transform ? interp.transform(value) : value;
        }
        return interp.value;
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      return Reflect.set(target, prop, value, receiver);
    },
    has(target, prop) {
      if (lerps.has(String(prop))) return true;
      return Reflect.has(target, prop);
    },
  });

  /** @type {ReactiveState} */
  const inner = {
    ...reactiveState,
    state: innerStateProxy,
    interpolations: lerps,
    ø__innerBindings: new Map(),
    ø__innerStates: new Set(),
    ø__finalizers: [],
    ø__enclosing: enclosing,
  };
  inner.ø__helpers = buildPluginHelpers(inner);
  reactiveState.ø__innerStates.add(inner);
  states.set(innerStateProxy, inner);
  if (__DEV__) {
    hook.ø__trackState(inner);
    hook.ø__registerParent(inner, reactiveState);
    hook.ø__emit({ kind: "compose", state: inner, parent: reactiveState, child: inner });
  }
  return inner;
}

/**
 * Clears a child reactive state and removes its bindings.
 * @param {ReactiveState} parentState
 * @param {ReactiveState} innerState
 * @param {Node=} node
 * @type {CleanupState}
 */
function cleanupState(parentState, innerState, node = null) {
  if (parentState === innerState) return;
  // Already cleaned (e.g. idempotent unbind). Nothing to do.
  if (!innerState || innerState.bindings == null) return;

  if (__DEV__) hook.ø__emit({ kind: "cleanup", state: innerState, node });

  if (node) {
    emitLifecycle(node, "destroy", { state: innerState });
  }

  // Clear interpolations
  if (innerState.interpolations) {
    /** @type Map<string, any> */ (innerState.interpolations).clear();
  }
  // Clear inner bindings
  if (innerState.ø__innerBindings) {
    for (const [property, effects] of Array.from(
      innerState.ø__innerBindings.entries(),
    )) {
      if (innerState.bindings.has(property)) {
        for (const effect of effects) {
          innerState.bindings.get(property).delete(effect);
        }
      }
      if (!innerState.bindings.get(property)?.size)
        innerState.bindings.delete(property);
    }
    innerState.ø__innerBindings.clear();
  }
  // Clear finalizers
  innerState.ø__finalizers.forEach((fn) => fn());
  // Recursively clear child states
  innerState.ø__innerStates.forEach((inner) => cleanupState(innerState, inner));
  // Delete from parent chain. parentState is null for root unbinds — the
  // the proxy→wrapper lookup is dropped at the end of this function.
  if (parentState) {
    if (!parentState.ø__innerStates.delete(innerState)) {
      throw new Error(fmt("VLN011", __DEV__ && "Failed to delete inner state from parent. This indicates a state management corruption."));
    }
  }
  // Drop from the global proxy→wrapper map before nulling .state — after
  // this, nothing can resolve this proxy, which is exactly what unbind
  // / parent-cleanup promised.
  if (innerState.state) states.delete(innerState.state);
  // De-ref
  innerState.bindings = null;
  innerState.interpolations = null;
  innerState.state = null;
  innerState.ø__control = null;
  innerState.ø__depCaptures = null;
  innerState.ø__finalizers = null;
  innerState.ø__innerBindings = null;
  innerState.ø__innerStates = null;
}

/**
 * Tears down a root bound by Velin.bind(). Clears every effect, every
 * composed child state, fires every plugin's destroy. Idempotent — a
 * second call on an already-unbound state is a no-op.
 *
 * Throws only when handed a child state (from compose / vln-loop /
 * vln-if / vln-fragment / etc.): those are owned by their parent and
 * are torn down automatically when the parent is. Any other input (an
 * unknown object, a plain state that was never bound, a now-unbound
 * root) is a silent no-op.
 *
 * @param {any} state The proxy returned by Velin.bind().
 * @returns {void}
 */
function unbind(state) {
  const rs = states.get(state);
  if (!rs) return; // unknown or already-unbound — no-op
  if (rs.ø__enclosing) {
    throw new Error(fmt("VLN025", __DEV__ && "unbind: this is a child state (from compose / vln-loop / vln-if / vln-fragment). Child states are owned by their parent and tear down when the parent does. Call unbind on the root instead."));
  }
  cleanupState(null, rs, rs.ø__rootNode || null);
}

/**
 * Turns an already processed attribute from a node into a 'reflect-'ed attribute with the same value.
 * @type {ConsumeAttribute}
 */
function consumeAttribute(node, attr, expr) {
  node.removeAttribute(attr);
  node.setAttribute("reflect-" + attr, expr);
}

/**
 * Emits a lifecycle event on a node.
 * @param {Node} node
 * @param {string} eventName
 * @param {any} detail
 */
function emitLifecycle(node, eventName, detail = {}) {
  if (node instanceof HTMLElement) {
    node.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: true,
        detail: { ...detail, node },
      }),
    );
  }
}

/**
 * Lookup plugins in the plugin catalog
 * @type {LookupPlugin<any>}
 */
function lookupPlugin(pluginKey) {
  if (plugins.has(pluginKey)) {
    return plugins.get(pluginKey);
  } else {
    return null;
  }
}

function parsePluginFromAttribute(name, value) {
  if (!name.startsWith("vln-")) return null;
  const key = name.slice(4);

  let pluginKey = key;
  let subcommand = null;
  if (key.includes(":")) {
    [pluginKey, subcommand] = key.split(":");
  }

  const plugin = lookupPlugin(pluginKey);
  if (plugin) {
    return { pluginKey, name, value, subcommand, plugin };
  }

  // Unknown plugin: insert a synthetic error plugin at the lowest priority so a
  // higher-priority plugin can still halt before it throws.
  return {
    pluginKey: null,
    name,
    value,
    subcommand,
    plugin: {
      name: "__error__",
      priority: -Infinity,
      render: () => {
        const availablePlugins = __DEV__ ? Array.from(plugins.keys()).join(", ") : "";
        throw new Error(fmt("VLN026", __DEV__ && `Plugin '${pluginKey}' is not registered. Available plugins: ${availablePlugins}`, pluginKey));
      },
    },
  };
}

/**
 * Recursively processes a DOM node to apply Velin plugins.
 * @param {Node} node
 * @param {ReactiveState} reactiveState
 */
function processNode(node, reactiveState) {
  // Element (not just HTMLElement) so we descend into <svg> subtrees —
  // otherwise vln-attr / vln-class on a <polyline> etc. is unreachable
  // because traversal bails at the SVG root.
  if (!(node instanceof Element)) return;
  // Note: <template> elements are processed for their own attributes (the
  // vln-template plugin registers them into the template store) but their
  // children live in `.content` — a DocumentFragment — so `node.children` is
  // empty and the tree walk below descends into nothing. Safe by design.

  // Track duplicate application per plugin/subcommand (only for real plugins;
  // synthetic error plugins for unknown attributes are intentionally allowed
  // to coexist so each unknown attribute reports independently).
  const seenPlugins = new Set();

  /**
   * Parse a set of attribute-shaped entries into the sorted plugin list. Used
   * both for the node's own attributes and for plugins injected by a previous
   * plugin via `PluginControl.plugins`.
   * @param {Array<{name: string, value: string}>} attributes
   * @param {boolean} injected entries flagged as not present on the DOM
   */
  function parsePlugins(attributes, injected) {
    const applicable = [];
    for (const { name, value } of attributes) {
      const parsed = parsePluginFromAttribute(name, value);
      if (!parsed) continue;
      if (parsed.pluginKey !== null) {
        const uniqueKey = parsed.pluginKey + (parsed.subcommand ? ":" + parsed.subcommand : "");
        if (seenPlugins.has(uniqueKey)) {
          throw new Error(fmt("VLN013", __DEV__ && `Duplicate plugin application: '${parsed.plugin.name}' ${
              parsed.subcommand ? "with subcommand '" + parsed.subcommand + "' " : ""
            }is applied multiple times to the same node. Each plugin/subcommand pair must be unique per element.`, uniqueKey));
        }
        seenPlugins.add(uniqueKey);
      }
      parsed.injected = injected;
      applicable.push(parsed);
    }
    applicable.sort((a, b) => (b.plugin.priority || 0) - (a.plugin.priority || 0));
    return applicable;
  }

  const applicable = parsePlugins(Array.from(node.attributes), false);
  /** @type {ReactiveState | null} */
  let scopedReactiveState = null;

  // Walk the chain by index so a plugin can inject more plugins (via
  // PluginControl.plugins) and have them run right after the current one,
  // ahead of any remaining lower-priority entries already in the chain.
  for (let i = 0; i < applicable.length; i++) {
    const entry = applicable[i];
    const { plugin, name, value, subcommand, injected } = entry;
    const control = processPlugin(
      plugin,
      reactiveState,
      value,
      node,
      name,
      value,
      subcommand,
    );
    // Only DOM-sourced attributes should leave a `reflect-*` breadcrumb.
    if (!injected) consumeAttribute(node, name, value);
    if (control && control.halt) {
      emitLifecycle(node, "init", { state: reactiveState });
      return;
    }
    if (control && control.scopedState) {
      // Accept either a ChildContext (preferred — from ctx.compose(...)) or
      // a raw ReactiveState (legacy direct-callers like Velin.composeState).
      const scoped =
        /** @type {any} */ (control.scopedState).ø__reactiveState ?? control.scopedState;
      if (!scopedReactiveState) {
        scopedReactiveState = scoped;
        if (__DEV__) hook.ø__registerStateNode(scoped, node);
      } else
        throw new Error(fmt("VLN012", __DEV__ && `Multiple plugins on the same node cannot create scoped states. Plugin '${plugin.name}' attempted to create a scoped state, but one already exists from a previous plugin.`, plugin.name));
    }
    if (control && control.plugins && control.plugins.length > 0) {
      const injectedEntries = parsePlugins(control.plugins, true);
      applicable.splice(i + 1, 0, ...injectedEntries);
    }
  }

  // Process tree
  for (const child of Array.from(node.children)) {
    processNode(child, scopedReactiveState || reactiveState);
  }

  emitLifecycle(node, "init", { state: scopedReactiveState || reactiveState });
}

/**
 * Initializes Velin reactivity on a DOM subtree.
 * @param {Element|DocumentFragment} [root]
 * @param {object} [initialState]
 * @returns {any}
 */
function bind(root, initialState) {
  if (root === undefined) root = document.body;
  if (initialState === undefined) initialState = {};
  const reactiveState = setupState(initialState);
  reactiveState.ø__rootNode = root;
  let mounting = false;
  if (__DEV__) {
    // Initial render is an entry point too: a slow mount is a long task the
    // devtools should attribute, not report as "no Velin work".
    const el = /** @type {any} */ (root);
    const desc = el && el.tagName
      ? `<${el.tagName.toLowerCase()}${el.id ? "#" + el.id : el.classList && el.classList.length ? "." + el.classList[0] : ""}>`
      : "fragment";
    mounting = hook.ø__enterSource(`Velin.bind(${desc})`, "mount");
  }
  try {
    processNode(root, reactiveState);
  } finally {
    if (__DEV__) hook.ø__exitSource(mounting);
  }
  states.set(reactiveState.state, reactiveState);
  if (__DEV__) {
    hook.ø__trackState(reactiveState);
    hook.ø__registerStateNode(reactiveState, root);
    hook.ø__emit({ kind: "bind", state: reactiveState, rootNode: root });
  }
  return reactiveState.state;
}

/** @type {VelinCore} */
const Velin = {
  bind,
  unbind,
  getSetter,
  composeState,
  cleanupState,
  processNode,
  compile,
  evaluate,
  evaluateAst,
  getController,
  plugins: {
    registerPlugin,
    processPlugin,
    lookupPlugin,
    get: plugins.get.bind(plugins),
    priorities: DefaultPluginPriorities,
  },
  trackers,
  ø__internal: {
    pluginStates,
    fmt,
    getWrapper: (state) => states.get(state),
    consumeAttribute,
    triggerEffects: (prop, reactiveState) => {
      triggerEffects("root." + prop, reactiveState);
    },
  },
};

export default Velin;

/** @type {any} */
const __win = window;

if (typeof window !== "undefined" && !__win.Velin) {
  __win.Velin = Velin;
}
