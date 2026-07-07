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
 * @property {Set<Function>} batchQueue Deferred effects collected while batchDepth > 0
 * @property {(fn: () => void) => void} batch Defers effects triggered inside fn until fn returns, then flushes once (deduplicated). Safe to nest.
 */

/**
 * @typedef {() => PluginControl | void} VelinBindingEffect
 */

/**
 * @template K, V
 * @typedef {ReadonlyMap<K, V>} ImmutableMap
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
 */

/**
 * @typedef {Object} PluginHelpers
 * @property {any} state User-facing reactive Proxy for this scope
 * @property {(expr?: string, allowMutations?: boolean) => any} evaluate Pre-bound evaluate
 * @property {(ast?: ASTNode) => any} evaluateAst Pre-bound evaluateAst
 * @property {(expr?: string) => (value: any) => void} getSetter Pre-bound getSetter
 * @property {(init: Object | Map<string, Interpolation>) => ChildContext} compose Pre-bound compose (returns ChildContext)
 * @property {(node: Node, name?: string, value?: string) => void} consume Pre-bound consumeAttribute
 * @property {(prop: string) => void} triggerEffects Pre-bound triggerEffects
 * @property {(fn: () => void) => void} batch Pre-bound batch on this state's tree control
 */

/**
 * @typedef {Object} ChildContext
 * @property {any} state Child's user-facing reactive Proxy
 * @property {(expr?: string, allowMutations?: boolean) => any} evaluate
 * @property {(ast?: ASTNode) => any} evaluateAst
 * @property {(expr?: string) => (value: any) => void} getSetter
 * @property {(init: Object | Map<string, Interpolation>) => ChildContext} compose
 * @property {(expr: string) => ChildContext} anchor Fluent — appends expr to tricklingRoots and returns this context
 * @property {(key: string, interp: Interpolation) => ChildContext} setInterpolation
 * @property {(node: Node) => void} processNode
 * @property {(node?: Node | null) => void} cleanup
 * @property {(prop: string) => void} triggerEffects
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
 * @property {(args: {compiledExpression: ASTNode, expr: string, node: Element, subkey: string | null, tracked: Ttracked, pluginState?: any, attributeName: string, attributeValue: string, state: any, evaluate: Function, evaluateAst: Function, getSetter: Function, compose: Function, consume: Function, triggerEffects: Function}) => PluginControl | void} render Function to apply reactive updates to a node
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
 *   properties: Array<{ key: string, value: ASTNode }>
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
 * @property {(prop: string, reactiveState: ReactiveState) => void} triggerEffects
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

/** @typedef {(reactiveState: ReactiveState, interpolations: Map<string, Interpolation>) => ReactiveState} ComposeState */
/** @typedef {(parentState: ReactiveState, innerState: ReactiveState, node?: Node | null) => void} CleanupState */
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
 * @property {VelinPluginManager<any>} plugins
 * @property {Evaluate} evaluate
 * @property {EvaluateAST} evaluateAst
 * @property {Compile} compile
 * @property {GetSetter} getSetter
 * @property {ComposeState} composeState
 * @property {CleanupState} cleanupState
 * @property {ProcessNode} processNode
 * @property {Trackers} trackers
 * @property {(state: any) => VelinStateControl} getController Returns the scheduler control for a bound state (as returned by Velin.bind()). Use `.batch(fn)` on the result to batch effects across mutations.
 * @property {VelinInternal} ø__internal
 */

/** @type {Map<string, VelinPlugin<any>>} */
const plugins = new Map();
/** @type {WeakMap<Node, any>} */
const pluginStates = new WeakMap();
/** @type {WeakMap<object, ReactiveState>} */
const rootStates = new WeakMap();

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
    console.error(`Error evaluating expression '${exprStr}':`, error.message);
    if (error.stack) {
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
   * // Used in vln-if plugin to show/hide elements
   * Velin.plugins.registerPlugin({
   *   name: 'if',
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
 * Normalizes a `compose()` input into a Map<string, Interpolation>.
 * Accepts either a Map (existing form) or a `{key: {expr|literal: …}}` object.
 * Throws on any other shape — no type-based magic (see ADR-0002 D5).
 * @param {Map<string, Interpolation> | Record<string, {expr: string} | {literal: any}>} init
 * @returns {Map<string, Interpolation>}
 */
function normalizeComposeInit(init) {
  if (init instanceof Map) return init;
  if (!init || typeof init !== "object") {
    throw new Error(
      "[Velin] compose() expects a Map<string, Interpolation> or an object with { expr } / { literal } entries."
    );
  }
  /** @type {Map<string, Interpolation>} */
  const map = new Map();
  for (const [key, value] of Object.entries(init)) {
    if (value && typeof value === "object" && "expr" in value) {
      map.set(key, { type: "EXPR", value: { expr: /** @type {any} */(value).expr } });
    } else if (value && typeof value === "object" && "literal" in value) {
      map.set(key, { type: "LITERAL", value: /** @type {any} */(value).literal });
    } else {
      throw new Error(
        `[Velin] compose(): each entry must be { expr: '...' } or { literal: ... }. Got ${JSON.stringify(value)} for key "${key}".`
      );
    }
  }
  return map;
}

/**
 * Builds a ChildContext wrapping a freshly-composed substate. Plugins use this
 * instead of touching the raw ReactiveState — see ADR-0002 D2/D6.
 * @param {ReactiveState} parentState
 * @param {Map<string, Interpolation> | Record<string, {expr: string} | {literal: any}>} init
 * @returns {any} ChildContext (shape documented in ADR-0002)
 */
function buildChildContext(parentState, init) {
  const interpolations = normalizeComposeInit(init);
  const childState = composeState(parentState, interpolations);
  const ctx = {
    get state() { return childState.state; },
    /** @param {string} expr @param {boolean=} allowMutations */
    evaluate(expr, allowMutations) { return evaluate(childState, expr, allowMutations); },
    /** @param {ASTNode} ast */
    evaluateAst(ast) { return evaluateAst(ast, childState); },
    /** @param {string} expr */
    getSetter(expr) { return getSetter(childState, expr); },
    /** @param {Map<string, Interpolation> | Record<string, {expr: string} | {literal: any}>} nestedInit */
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
    /** @param {string} prop */
    triggerEffects(prop) { triggerEffects("root." + prop, childState); },
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
    /** @param {Map<string, Interpolation> | Record<string, {expr: string} | {literal: any}>} init */
    compose: (init) => buildChildContext(reactiveState, init),
    /** @param {HTMLElement} node @param {string} name @param {string} value */
    consume: (node, name, value) => consumeAttribute(node, name, value),
    /** @param {string} prop */
    triggerEffects: (prop) => triggerEffects("root." + prop, reactiveState),
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

  const compiledExpression = compile(expr);
  if (__DEV__) hook.ø__emit({ kind: "compile", state: reactiveState, expr });
  nodeState[stateKey + "__ø__exprAST"] = compiledExpression;
  if (!nodeState["ø__originalNode"]) {
    nodeState["ø__originalNode"] = node.cloneNode(true);
  }
  nodeState[stateKey + "__ø__lastTriggerID"] = null;

  pluginStates.set(node, nodeState);
  if (__DEV__) console.log("  - Processing plugin", plugin, node);
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
      console.error(
        `Error occurred while tracking expression '${expr}' in plugin '${plugin.name}':`,
        error,
      );
    }
    depCapture.capturingDeps = false;
    /** @type {VelinBindingEffect} */
    const effect = () => {
      if (!nodeState?.[stateKey]) return; // Is finalized
      const tracked = track();
      if (__DEV__) hook.ø__emit({ kind: "plugin", state: reactiveState, name: plugin.name, node, expr, subkey, phase: "render" });
      const control = plugin.render({
        ...reactiveState.ø__helpers,
        compiledExpression,
        node,
        subkey,
        tracked,
        pluginState: nodeState[stateKey],
        attributeName,
        attributeValue,
        expr,
      });
      if (control && control.pluginState) {
        nodeState[stateKey] = control.pluginState;
        pluginStates.set(node, nodeState);
      }

      return control;
    };
    if (__DEV__) {
      /** @type {any} */ (effect).ø__debug = {
        node, expr, pluginName: plugin.name, subkey,
        recentPaths: new Array(DEBUG_PATH_RING),
        ø__pathRingHead: 0,
      };
    }
    const entries = [...depCapture.deps];
    // Filter out any dep that is at or above ANY trickling root in the stack.
    // Stacking matters for nested loops: the inner loop must not lose the outer
    // loop's anchor, otherwise cells re-register on the outer array (see ADR-0001).
    const roots = reactiveState.tricklingRoots;
    const deps = roots && roots.length
      ? entries.filter((e) => !roots.some((r) => {
          const normalizedRoot = r.startsWith("root.") ? r : `root.${r}`;
          return normalizedRoot.startsWith(e);
        }))
      : entries;
    if (deps.length && __DEV__)
      console.log("Dependencies tracked: " + deps.join(", "));
    for (const dep of deps) {
      let prop = dep;
      if (!reactiveState.bindings.has(prop))
        reactiveState.bindings.set(prop, new Set());
      reactiveState.bindings.get(prop).add(effect);
      if (reactiveState.ø__innerBindings) {
        if (!reactiveState.ø__innerBindings.has(prop))
          reactiveState.ø__innerBindings.set(prop, new Set());
        reactiveState.ø__innerBindings.get(prop).add(effect);
      }
    }
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
  /**
   * @type {Array<ASTToken>}
   */
  const tokens = [];
  let i = 0;

  while (i < expr.length) {
    let char = expr[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(char)) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i++];
      }
      tokens.push({ type: "NUMBER", value: parseFloat(num) });
      continue;
    }

    // Strings
    if (char === '"' || char === "'") {
      const quote = char;
      let str = "";
      i++; // skip opening quote
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === "\\") {
          i++; // skip escape
          if (i < expr.length) str += expr[i++];
        } else {
          str += expr[i++];
        }
      }
      i++; // skip closing quote
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    // Identifiers
    if (/[a-zA-Z_$]/.test(char)) {
      let ident = "";
      while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) {
        ident += expr[i++];
      }
      // Handle keywords/literals
      if (ident === "true") tokens.push({ type: "BOOLEAN", value: true });
      else if (ident === "false")
        tokens.push({ type: "BOOLEAN", value: false });
      else if (ident === "null") tokens.push({ type: "NULL", value: null });
      else if (ident === "undefined")
        tokens.push({ type: "UNDEFINED", value: undefined });
      else tokens.push({ type: "IDENTIFIER", value: ident });
      continue;
    }

    // Multi-char operators
    const ops = ["===", "!==", "&&", "||", ">=", "<=", "==", "!="];
    let matched = false;
    for (const op of ops) {
      if (expr.slice(i, i + op.length) === op) {
        tokens.push({ type: "OPERATOR", value: op });
        i += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Single = for assignment
    if (char === "=") {
      tokens.push({ type: "ASSIGNMENT", value: "=" });
      i++;
      continue;
    }

    // Single-char tokens
    if ("+-*/%><()[]{}.,?:!".includes(char)) {
      if ("+-*/%><!=".includes(char)) {
        tokens.push({ type: "OPERATOR", value: char });
      } else {
        tokens.push({ type: "PUNCTUATION", value: char });
      }
      i++;
      continue;
    }

    throw new Error(`Unexpected: ${char}`);
  }

  return tokens;
}

/**
 * Parser for CSP-safe expression evaluation
 * @type {Parser}
 */
function parse(tokens) {
  let pos = 0;

  function peek() {
    return tokens[pos];
  }

  function next() {
    return tokens[pos++];
  }

  function expect(type, value) {
    const token = next();
    if (
      !token ||
      token.type !== type ||
      (value !== undefined && token.value !== value)
    ) {
      throw new Error(
        `Expected ${type} ${value || ""}, got ${token ? token.type : "EOF"}`,
      );
    }
    return token;
  }

  // Helper to check if current token matches criteria
  const match = (type, val) => {
    const t = peek();
    return (
      t &&
      t.type === type &&
      (!val || t.value === val || val.includes?.(t.value))
    );
  };

  // Precedence table for binary operators
  const prec = [
    [["||"]],
    [["&&"]],
    [["===", "!==", "==", "!="]],
    [[">", "<", ">=", "<="]],
    [["+", "-"]],
    [["*", "/", "%"]],
  ];

  function parseSequence() {
    let expressions = [parseAssignment()];

    while (match("PUNCTUATION", ",")) {
      next();
      expressions.push(parseAssignment());
    }

    return expressions.length === 1
      ? expressions[0]
      : { type: "Sequence", expressions };
  }

  function parseAssignment() {
    let node = parseTernary();

    if (match("ASSIGNMENT", "=")) {
      next();
      const right = parseAssignment(); // Right-associative
      return { type: "Assignment", left: node, right };
    }

    return node;
  }

  function parseTernary() {
    let node = parseBinary(0);

    if (match("PUNCTUATION", "?")) {
      next();
      const consequent = parseTernary();
      expect("PUNCTUATION", ":");
      const alternate = parseTernary();
      return { type: "Ternary", test: node, consequent, alternate };
    }

    return node;
  }

  // Consolidated binary operator parser with precedence levels
  function parseBinary(p) {
    let left = p === 5 ? parseUnary() : parseBinary(p + 1);

    if (p < 6) {
      while (match("OPERATOR", prec[p][0])) {
        const op = next().value;
        const right = p === 5 ? parseUnary() : parseBinary(p + 1);
        left = { type: "Binary", operator: op, left, right };
      }
    }

    return left;
  }

  function parseUnary() {
    if (match("OPERATOR", ["!", "-", "+"])) {
      const op = next().value;
      const argument = parseUnary();
      return { type: "Unary", operator: op, argument };
    }

    return parseCall();
  }

  function parseCall() {
    let node = parseMember();

    while (match("PUNCTUATION", "(")) {
      next();
      const args = [];

      while (!match("PUNCTUATION", ")")) {
        args.push(parseAssignment());
        if (match("PUNCTUATION", ",")) next();
      }

      expect("PUNCTUATION", ")");
      node = { type: "Call", callee: node, arguments: args };
    }

    return node;
  }

  function parseMember() {
    let node = parsePrimary();

    while (true) {
      if (match("PUNCTUATION", ".")) {
        next();
        const property = expect("IDENTIFIER");
        node = {
          type: "Member",
          object: node,
          property: property.value,
          computed: false,
        };
      } else if (match("PUNCTUATION", "[")) {
        next();
        const property = parseAssignment();
        expect("PUNCTUATION", "]");
        node = { type: "Member", object: node, property, computed: true };
      } else {
        break;
      }
    }

    return node;
  }

  function parsePrimary() {
    const token = peek();

    if (!token) {
      throw new Error("Unexpected end of expression");
    }

    if (
      ["NUMBER", "STRING", "BOOLEAN", "NULL", "UNDEFINED"].includes(token.type)
    ) {
      next();
      return { type: "Literal", value: token.value };
    }

    if (token.type === "IDENTIFIER") {
      next();
      return { type: "Identifier", name: token.value };
    }

    if (match("PUNCTUATION", "(")) {
      next();
      const node = parseSequence();
      expect("PUNCTUATION", ")");
      return node;
    }

    // Array literal
    if (match("PUNCTUATION", "[")) {
      next();
      const elements = [];

      while (!match("PUNCTUATION", "]")) {
        elements.push(parseAssignment());
        if (match("PUNCTUATION", ",")) next();
      }

      expect("PUNCTUATION", "]");
      return { type: "ArrayLiteral", elements };
    }

    // Object literal
    if (match("PUNCTUATION", "{")) {
      next();
      const properties = [];

      while (!match("PUNCTUATION", "}")) {
        // Parse property key
        let key;
        const keyToken = peek();
        if (keyToken.type === "IDENTIFIER") {
          key = next().value;
        } else if (keyToken.type === "STRING") {
          key = next().value;
        } else {
          throw new Error(`Bad property name`);
        }

        // Check for shorthand property syntax: { foo } instead of { foo: foo }
        let value;
        if (match("PUNCTUATION", [",", "}"])) {
          // Shorthand syntax: use key as identifier
          if (keyToken.type !== "IDENTIFIER") {
            throw new Error(`Bad shorthand`);
          }
          value = { type: "Identifier", name: key };
        } else {
          // Regular syntax: expect colon and value
          expect("PUNCTUATION", ":");
          value = parseAssignment();
        }

        properties.push({ key, value });

        if (match("PUNCTUATION", ",")) next();
      }

      expect("PUNCTUATION", "}");
      return { type: "ObjectLiteral", properties };
    }

    const contextTokens = tokens
      .slice(Math.max(0, pos - 3), pos + 4)
      .map((t) => `${t.type}:${t.value}`)
      .join(" ");
    throw new Error(
      `Unexpected token in expression: ${token.type} "${token.value}" at position ${pos}. Context: ${contextTokens}`,
    );
  }

  return parseSequence();
}

/**
 * Evaluates AST with given context
 * @type {EvaluateAST}
 */
/**
 * @param {ASTLiteralNode} ast
 */
function evalLiteral(ast) {
  return ast.value;
}

/**
 * @param {ASTIdentifierNode} ast
 * @param {Record<string, any>} context
 */
function evalIdentifier(ast, context) {
  return context[ast.name];
}

/**
 * @param {ASTMemberNode} ast
 * @param {Record<string, any>} context
 * @param {any} reactiveState
 */
function evalMember(ast, context, reactiveState) {
  const obj = evalAst(ast.object, context, reactiveState);
  if (obj == null) return undefined;
  const key = ast.computed
    ? evalAst(ast.property, context, reactiveState)
    : ast.property;
  return obj[key];
}

/**
 * @param {ASTCallNode} ast
 * @param {Record<string, any>} context
 * @param {any} reactiveState
 */
function evalCall(ast, context, reactiveState) {
  const fn = evalAst(ast.callee, context, reactiveState);
  if (typeof fn !== "function") throw new TypeError("Not a function");
  const args = ast.arguments.map((arg) => evalAst(arg, context, reactiveState));
  const thisArg =
    ast.callee.type === "Member"
      ? evalAst(ast.callee.object, context, reactiveState)
      : context;
  return fn.apply(thisArg, args);
}

/**
 * @param {ASTBinaryNode} ast
 * @param {Record<string, any>} context
 * @param {any} reactiveState
 */
function evalBinary(ast, context, reactiveState) {
  const left = evalAst(ast.left, context, reactiveState);
  const right = evalAst(ast.right, context, reactiveState);
  const ops = {
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "*": (a, b) => a * b,
    "/": (a, b) => a / b,
    "%": (a, b) => a % b,
    ">": (a, b) => a > b,
    "<": (a, b) => a < b,
    ">=": (a, b) => a >= b,
    "<=": (a, b) => a <= b,
    "===": (a, b) => a === b,
    "!==": (a, b) => a !== b,
    "==": (a, b) => a == b,
    "!=": (a, b) => a != b,
    "&&": (a, b) => a && b,
    "||": (a, b) => a || b,
  };
  return (ops[ast.operator] || (() => undefined))(left, right);
}

/**
 * @param {ASTUnaryNode} ast
 * @param {Record<string, any>} context
 * @param {any} reactiveState
 */
function evalUnary(ast, context, reactiveState) {
  const arg = evalAst(ast.argument, context, reactiveState);
  const ops = {
    "!": (a) => !a,
    "-": (a) => -a,
  };
  return (ops[ast.operator] || (() => undefined))(arg);
}

/**
 * @param {ASTTernaryNode} ast
 * @param {Record<string, any>} context
 * @param {any} reactiveState
 */
function evalTernary(ast, context, reactiveState) {
  const test = evalAst(ast.test, context, reactiveState);
  return test
    ? evalAst(ast.consequent, context, reactiveState)
    : evalAst(ast.alternate, context, reactiveState);
}

/**
 * @param {ASTObjectLiteralNode} ast
 * @param {Record<string, any>} context
 * @param {any} reactiveState
 */
function evalObjectLiteral(ast, context, reactiveState) {
  const result = {};
  for (const prop of ast.properties) {
    const value = evalAst(prop.value, context, reactiveState);
    result[prop.key] =
      value && typeof value === "object" && value.constructor === Object
        ? { ...value, constructor: undefined } // Unwrap the object
        : value;
  }
  return result;
}

/**
 * @param {any} ast
 * @param {Record<string, any>} context
 * @param {any} reactiveState
 */
function evalArrayLiteral(ast, context, reactiveState) {
  return ast.elements.map((elem) => evalAst(elem, context, reactiveState));
}

/**
 * @param {ASTAssignmentNode} ast
 * @param {Record<string, any>} context
 * @param {any} reactiveState
 */
function evalAssignment(ast, context, reactiveState) {
  const value = evalAst(ast.right, context, reactiveState);

  if (ast.left.type === "Identifier") {
    context[ast.left.name] = value;
  } else if (ast.left.type === "Member") {
    const obj = evalAst(ast.left.object, context, reactiveState);
    if (obj == null)
      throw new TypeError("Cannot set property on null or undefined");
    const key = ast.left.computed
      ? evalAst(ast.left.property, context, reactiveState)
      : ast.left.property;
    obj[key] = value;
  } else {
    throw new Error("Invalid assignment target");
  }

  return value;
}

/**
 * @param {ASTSequenceNode} ast
 * @param {Record<string, any>} context
 * @param {any} reactiveState
 */
function evalSequence(ast, context, reactiveState) {
  let result;
  for (const expr of ast.expressions) {
    result = evalAst(expr, context, reactiveState);
  }
  return result;
}

/**
 * @param {ASTNode} ast
 * @param {Record<string, any>} context
 * @param {any} [reactiveState]
 */
function evalAst(ast, context, reactiveState = null) {
  const evalVisitors = {
    Literal: (ast, context, reactiveState) => evalLiteral(/** @type {ASTLiteralNode} */ (ast)),
    Identifier: (ast, context, reactiveState) => evalIdentifier(/** @type {ASTIdentifierNode} */ (ast), context),
    Member: (ast, context, reactiveState) => evalMember(/** @type {ASTMemberNode} */ (ast), context, reactiveState),
    Call: (ast, context, reactiveState) => evalCall(/** @type {ASTCallNode} */ (ast), context, reactiveState),
    Binary: (ast, context, reactiveState) => evalBinary(/** @type {ASTBinaryNode} */ (ast), context, reactiveState),
    Unary: (ast, context, reactiveState) => evalUnary(/** @type {ASTUnaryNode} */ (ast), context, reactiveState),
    Ternary: (ast, context, reactiveState) => evalTernary(/** @type {ASTTernaryNode} */ (ast), context, reactiveState),
    ObjectLiteral: (ast, context, reactiveState) => evalObjectLiteral(/** @type {ASTObjectLiteralNode} */ (ast), context, reactiveState),
    ArrayLiteral: (ast, context, reactiveState) => evalArrayLiteral(/** @type {ASTNode} */ (ast), context, reactiveState),
    Assignment: (ast, context, reactiveState) => evalAssignment(/** @type {ASTAssignmentNode} */ (ast), context, reactiveState),
    Sequence: (ast, context, reactiveState) => evalSequence(/** @type {ASTSequenceNode} */ (ast), context, reactiveState),
  };
  const visitor = evalVisitors[ast.type];
  if (!visitor) {
    throw new Error(`Bad AST: ${ast.type}`);
  }
  return visitor(ast, context, reactiveState);
}

/**
 *
 * @param {string} intKey
 * @param {ReactiveState} reactiveState
 * @returns
 */
function lerp(intKey, reactiveState) {
  const inter = reactiveState.interpolations;
  if (inter?.has(intKey)) {
    const interp = inter.get(intKey);
    if (interp.type === "EXPR") {
      return evaluateAst(interp.value.ast, reactiveState);
    } else {
      return interp.value;
    }
  }
  return undefined;
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
  const inter = reactiveState.interpolations;
  const contextualizedProxy = new Proxy(reactiveState.state, {
    get(target, prop, receiver) {
      const propStr = String(prop);
      if (inter?.has(propStr)) {
        return lerp(propStr, reactiveState);
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (!reactiveState.ø__control) {
        throw new Error(
          `[VLN014] Async mutation error: Property '${String(prop)}' was mutated after the evaluation context was cleaned up. This usually happens when an async operation in an event handler (or similar) tries to update state after the element has been removed or the scope destroyed.`,
        );
      }
      if (reactiveState.ø__control.evaluating)
        throw new Error(
          "[VLN010] Setting values during evaluation is forbidden. Use Velin.getSetter",
        );
      // Targeting target directly to avoid triggering traps recursively
      return Reflect.set(target, prop, value);
    },
  });
  if (__DEV__) {
    const t0 = hook.ø__now();
    try {
      const r = evalAst(ast, contextualizedProxy, reactiveState);
      const dt = hook.ø__now() - t0;
      const src = (ast && /** @type {any} */ (ast).ø__src) || "";
      hook.ø__recordExpressionEval(src, dt);
      hook.ø__emit({ kind: "evaluate", state: reactiveState, expr: src, durationMs: dt, ok: true });
      if (dt > 8) hook.ø__emit({ kind: "warn", code: "W002", state: reactiveState, message: `slow-expression: ${src} took ${dt.toFixed(1)}ms`, ref: { expr: src } });
      return r;
    } catch (err) {
      const dt = hook.ø__now() - t0;
      hook.ø__emit({ kind: "evaluate", state: reactiveState, expr: (ast && /** @type {any} */ (ast).ø__src) || "", durationMs: dt, ok: false, error: err && err.message });
      throw err;
    }
  }
  return evalAst(ast, contextualizedProxy, reactiveState);
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
    throw new Error(
      `[VLN014] Async mutation error: Expression "${expr}" evaluation was attempted after the state was cleaned up.`,
    );
  }
  reactiveState.ø__control.evaluating = !allowMutations;
  try {
    const ast = compile(expr);
    return evaluateAst(ast, reactiveState);
  } catch (err) {
    console.error(`Velin evaluate() error in expression "${expr}".`);
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

  // Handle root-level properties (no dots)
  if (lastDotIndex === -1) {
    return (value) => (reactiveState.state[property] = value);
  }

  const parentPath = property.slice(0, lastDotIndex);
  const key = property.slice(lastDotIndex + 1);

  return (value) => {
    const parent = evaluate(reactiveState, parentPath);
    if (parent == null)
      throw new TypeError("Cannot set property on null or undefined");
    parent[key] = value;
  };
}

/**
 * Triggers all reactive effects bound to a property and clears stale bindings
 * @param {string} prop Property path that changed
 * @param {ReactiveState} reactiveState The reactive state
 * @returns {void}
 */
function triggerEffects(prop, reactiveState) {
  if (!reactiveState.bindings.has(prop)) return;
  const ctrl = reactiveState.ø__control;
  if (__DEV__) {
    hook.ø__emit({ kind: "trigger", state: reactiveState, path: prop, queued: ctrl.batchDepth > 0, effectCount: reactiveState.bindings.get(prop)?.size ?? 0 });
  }
  for (const effect of reactiveState.bindings.get(prop) || []) {
    if (__DEV__ && /** @type {any} */ (effect).ø__debug) {
      const dbg = /** @type {any} */ (effect).ø__debug;
      dbg.recentPaths[dbg.ø__pathRingHead] = prop;
      dbg.ø__pathRingHead = (dbg.ø__pathRingHead + 1) % DEBUG_PATH_RING;
    }
    if (ctrl.batchDepth > 0) {
      ctrl.batchQueue.add(effect);
    } else {
      if (__DEV__) {
        hook.stats.updateCounter++;
        const t0 = hook.ø__now();
        effect();
        const dbg = /** @type {any} */ (effect).ø__debug;
        hook.ø__emit({ kind: "effect", state: reactiveState, path: prop, node: dbg?.node, expr: dbg?.expr, pluginName: dbg?.pluginName, durationMs: hook.ø__now() - t0 });
        if (dbg && dbg.node && typeof document !== "undefined" && !document.contains(dbg.node)) {
          hook.stats.orphanedEffectsSinceStart++;
          hook.ø__emit({ kind: "warn", code: "W001", message: "dangling-effect: effect ran on detached node", state: reactiveState, ref: { path: prop, expr: dbg.expr } });
        }
      } else {
        effect();
      }
    }
  }
}

/**
 * Returns the scheduler control for a bound state (as returned by Velin.bind()).
 * Callers use `.batch(fn)` on the result to coalesce effects across mutations.
 * @param {any} state
 * @returns {VelinStateControl}
 */
function getController(state) {
  const wrapper = rootStates.get(state);
  if (!wrapper) {
    throw new Error("[Velin] getController: argument is not a state returned by Velin.bind().");
  }
  return wrapper.ø__control;
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
    /** @type {Set<Function>} */
    batchQueue: new Set(),
    batch(fn) {
      this.batchDepth++;
      try {
        fn();
      } finally {
        this.batchDepth--;
        if (this.batchDepth === 0 && this.batchQueue.size) {
          const effects = [...this.batchQueue];
          this.batchQueue.clear();
          for (const effect of effects) {
            if (__DEV__) {
              hook.stats.updateCounter++;
              const t0 = hook.ø__now();
              effect();
              const dbg = /** @type {any} */ (effect).ø__debug;
              hook.ø__emit({ kind: "effect", state: reactiveState, path: dbg?.recentPaths?.[dbg?.ø__pathRingHead === 0 ? DEBUG_PATH_RING - 1 : dbg.ø__pathRingHead - 1] ?? "", node: dbg?.node, expr: dbg?.expr, pluginName: dbg?.pluginName, durationMs: hook.ø__now() - t0 });
            } else {
              effect();
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
          throw new Error(
            "[VLN010] Setting values during evaluation is forbidden. Use Velin.getSetter",
          );

        const desc = Object.getOwnPropertyDescriptor(target, prop);
        if (desc?.set) {
          desc.set.call(receiver, value);
          return true;
        }

        const old = target[prop];
        const result = Reflect.set(target, prop, value);

        if (old !== value && !init && !ø__control.wrapping) {
          if (__DEV__) hook.ø__emit({ kind: "mutate", state: reactiveState, path: path + "." + prop.toString(), op: "set", from: old, to: value });
          triggerEffects(path + "." + prop.toString(), reactiveState);
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
              if (__DEV__) hook.ø__emit({ kind: "mutate", state: reactiveState, path, op: "arrayMethod", method: prop.toString() });
              triggerEffects(path, reactiveState);
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
          throw new Error(
            "[VLN010] Setting values during evaluation is forbidden. Use Velin.getSetter",
          );

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
            if (__DEV__) hook.ø__emit({ kind: "mutate", state: reactiveState, path: innerPath, op: "set", from: old, to: value });
            triggerEffects(innerPath, reactiveState);
          }
        } else if (old !== value && !init && !ø__control.wrapping) {
          if (__DEV__) hook.ø__emit({ kind: "mutate", state: reactiveState, path: path + "." + prop.toString(), op: "set", from: old, to: value });
          triggerEffects(path + "." + prop.toString(), reactiveState);
          if (prop === "length") {
            if (__DEV__) hook.ø__emit({ kind: "mutate", state: reactiveState, path, op: "set", from: old, to: value });
            triggerEffects(path, reactiveState);
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
 * Creates a child reactive state with scoped variables (interpolations).
 * @param {ReactiveState} reactiveState
 * @param {ImmutableMap<string, Interpolation>} interpolations
 * @returns {ReactiveState}
 * @type {ComposeState}
 */
function composeState(reactiveState, interpolations) {
  /** @type {[string, Interpolation][]} */
  const lerps = [];
  for (const [k, v] of interpolations) {
    if (v.type === "EXPR")
      lerps.push([
        k,
        {
          type: "EXPR",
          value: { expr: v.value.expr, ast: compile(v.value.expr) },
        },
      ]);
    else lerps.push([k, v]);
  }
  /** @type {ReactiveState} */
  const inner = {
    ...reactiveState,
    interpolations: new Map([
      ...(reactiveState.interpolations?.entries() ?? []),
      ...lerps,
    ]),
    ø__innerBindings: new Map(),
    ø__innerStates: new Set(),
    ø__finalizers: [],
  };
  inner.ø__helpers = buildPluginHelpers(inner);
  reactiveState.ø__innerStates.add(inner);
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
  // Delete from chain
  if (!parentState.ø__innerStates.delete(innerState)) {
    throw new Error(
      "[VLN011] Failed to delete inner state from parent. This indicates a state management corruption.",
    );
  }
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
        const availablePlugins = Array.from(plugins.keys()).join(", ");
        throw new Error(
          `[Velin] Plugin '${pluginKey}' is not registered. ` +
            `Available plugins: ${availablePlugins}`,
        );
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
  if (node instanceof HTMLTemplateElement) return;
  if (__DEV__) console.log("Processing node", node);

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
          throw new Error(
            `[VLN013] Duplicate plugin application: '${parsed.plugin.name}' ${
              parsed.subcommand ? "with subcommand '" + parsed.subcommand + "' " : ""
            }is applied multiple times to the same node. Each plugin/subcommand pair must be unique per element.`,
          );
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
        throw new Error(
          `[VLN012] Multiple plugins on the same node cannot create scoped states. Plugin '${plugin.name}' attempted to create a scoped state, but one already exists from a previous plugin.`,
        );
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
  processNode(root, reactiveState);
  rootStates.set(reactiveState.state, reactiveState);
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
    getWrapper: (state) => rootStates.get(state),
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
