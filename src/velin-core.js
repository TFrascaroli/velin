/// <reference path="./global.d.ts" />
// @ts-check

/**
 * @typedef {Object} DepCapture
 * @property {boolean} capturingDeps Whether dependencies are being captured
 * @property {Set<string>} deps Set of dependency property paths currently captured
 */

/**
 * @typedef {Object} VelinStateControl
 * @property {boolean} evaluating Wether or not we are currently in an evaluation (to prevent multi-sets in evaluation)
 */

/**
 * @typedef {() => void} VelinBindingEffect
 */

/**
 * @typedef {Object} ReactiveState
 * @property {any} state The proxied reactive state object
 * @property {DepCapture[]} ø__depCaptures Dependency capture
 * @property {Map<string, Set<VelinBindingEffect>>} bindings Map of property paths to sets of reactive effect functions
 * @property {VelinStateControl} ø__control Dependency capture state
 * @property {Map<string, string>=} interpolations Optional map of interpolation keys to expressions
 * @property {Map<string, Set<VelinBindingEffect>>} ø__innerBindings Optional map of inner bindings (for cleanup)
 * @property {Set<ReactiveState>} ø__innerStates Optional set of inner states (for cleanup)
 * @property {Array<() => void>} ø__finalizers Optional array of plugin finalizers attached to this state (for cleanup)
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
  STOPPER: 50
};

/** @typedef {(args: {node: HTMLElement, pluginState?: any, reactiveState: ReactiveState, subkey: string}) => void} PluginDestroyerFn*/

/**
 * @typedef {Object} VelinPlugin
 * @property {string} name
 * @property {number=} priority
 * @property {(args: {reactiveState: ReactiveState, expr: string, node: Node, subkey: string | null}) => any} [track] Optional function to track dependencies from an expression
 * @property {(args: {reactiveState: ReactiveState, expr: string, node: HTMLElement, subkey: string | null, tracked: any, pluginState?: any, attributeName: string}) => any} render Function to apply reactive updates to a node
 * @property {PluginDestroyerFn} [destroy]
 */

/**
 * @typedef {Object} VelinInternal
 * @property {WeakMap<Node, any>} pluginStates
 * @property {{root?: ReactiveState}} boundState
 * @property {(node: HTMLElement, attr: string, expr: string) => void} consumeAttribute
 * @property {(prop: string, reactiveState: ReactiveState) => void} triggerEffects
 */

/**
 * @typedef {Object} VelinPluginManager
 * @property {RegisterPlugin} registerPlugin
 * @property {ProcessPlugin} processPlugin
 * @property {(pluginKey: string) => VelinPlugin} get
 * @property {{ [key in keyof typeof DefaultPluginPriorities]: number }} priorities
 */

/** @typedef {(def: VelinPlugin) => void} RegisterPlugin */
/** @typedef {(plugin: VelinPlugin, reactiveState: ReactiveState, expr: string, node: HTMLElement, attributeName: string, subkey?: string | null) => any} ProcessPlugin */

/** @typedef {(reactiveState: ReactiveState, expr: string) => any} Evaluate */
/** @typedef {(reactiveState: ReactiveState, expr: string) => (value: any) => void} GetSetter */
/** @typedef {(prop: string, reactiveState: ReactiveState) => void} TriggerEffects */
/** @typedef {(node: Node, reactiveState: ReactiveState) => void} ProcessNode */
/** @typedef {(node: HTMLElement, attr: string, expr: string) => void} ConsumeAttribute */

/** @typedef {(reactiveState: ReactiveState, interpolations: Map<string, any>) => ReactiveState} ComposeState */
/** @typedef {(parentState: ReactiveState, innerState: ReactiveState) => void} CleanupState */
/** @typedef {(root?: Element | DocumentFragment, initialState?: Object) => Object} Bind */

/** @typedef {(args: { reactiveState: ReactiveState, expr: string }) => any} ExpressionTracker */
/** @typedef {(args: { reactiveState: ReactiveState, expr: string }) => (value: any) => void} SetterTracker */
/** 
 * @typedef {Object} Trackers
 * @property {ExpressionTracker} expressionTracker
 * @property {SetterTracker} setterTracker
 */

/**
 * @typedef {Object} VelinCore
 * @property {Bind} bind
 * @property {VelinPluginManager} plugins
 * @property {Evaluate} evaluate
 * @property {GetSetter} getSetter
 * @property {ComposeState} composeState
 * @property {CleanupState} cleanupState
 * @property {ProcessNode} processNode
 * @property {Subscribe} on - Listener subscription function.
 * @property {Trackers} trackers
 * @property {VelinInternal} ø__internal
 */

/** @typedef {{selector?: string, plugin?: string, parentSelector?: string}} EvtOpts */
/** @typedef {{plugin: string, node: HTMLElement, reactiveState: ReactiveState, originalNode: HTMLElement}} EvtArgs */
/** @typedef {(event: string, args: EvtArgs) => void} Emit */
/** @typedef {(event: string, fn: (args: EvtArgs) => void, opts: EvtOpts?) => () => void} Subscribe */

/** @type {Map<string, VelinPlugin>} */
const plugins = new Map();
/** @type {WeakMap<Node, any>} */
const pluginStates = new WeakMap();
/** @type {{root?: ReactiveState}} */
const boundState = { root: undefined };

/** @type {Map<string, Set<{fn: (...args: any[]) => void, opts: EvtOpts}>>} */
const listeners = new Map();

/**
 *
 * @param {Array} arr
 * @returns {any=}
 */
function peek(arr) {
  return arr[arr.length - 1];
}

/**
 * Subscribes a function to an event.
 * @type {Subscribe}
 */
function on(event, fn, opts = {}) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  const evt = {fn, opts};
  listeners.get(event).add(evt);
  return () => {
    listeners.get(event)?.delete(evt);
    if (listeners.get(event)?.size === 0) listeners.delete(event);
  };
}

/**
 * Emits an event with optional arguments.
 * @internal
 * @type {Emit}
 */
function emit(event, args) {
  Array.from(listeners.get(event) || [])
    .filter(evt => {
      const opts = evt.opts || {};
      if (opts.selector && !args.node.matches(opts.selector)) return false;
      if (opts.parentSelector) {
        const parent = document.querySelector(opts.parentSelector);
        if (!parent || !parent.contains(args.node)) return false;
      }
      if (opts.plugin && args.plugin !== opts.plugin) return false;
      return true;
    })
    .forEach(evt => evt.fn(args));
}


const trackers = {
  /**
   * Tracks dependencies by evaluating the expression
   * @param {Object} args
   * @param {ReactiveState} args.reactiveState
   * @param {string} args.expr
   * @returns {any}
   */
  expressionTracker: ({ reactiveState, expr }) => evaluate(reactiveState, expr),

  /**
   * Returns a setter function for the expression's target property
   * @param {Object} args
   * @param {ReactiveState} args.reactiveState
   * @param {string} args.expr
   * @returns {(value: any) => void}
   */
  setterTracker: ({ reactiveState, expr }) => getSetter(reactiveState, expr),
};

/**
 * Registers a Velin plugin by name
 * @type {RegisterPlugin}
 */
function registerPlugin(def) {
  plugins.set(def.name, {
    ...def,
  });
}

/**
 * Processes a plugin on a node with reactiveState and expression
 * @type {ProcessPlugin}
 */
function processPlugin(plugin, reactiveState, expr, node, attributeName, subkey = null) {
  /** @type {DepCapture} */
  const depCapture = { capturingDeps: true, deps: new Set() };
  reactiveState.ø__depCaptures.push(depCapture);
  const nodeState = pluginStates.get(node) || {};
  const stateKey = plugin.name + (subkey ? "_" + subkey : "");
  nodeState[stateKey] = {};
  nodeState["ø__originalNode"] = node.cloneNode(true);
  nodeState["ø__lastTriggerID"] = null;
  pluginStates.set(node, nodeState);
  if (__DEV__) console.log("  - Processing plugin", plugin, node);
  try {
    reactiveState.ø__finalizers.push(() => {
      if (plugin.destroy) {
        plugin.destroy({node, pluginState: nodeState[stateKey], reactiveState, subkey});
        nodeState[stateKey] = null;
        if (Object.keys(nodeState).every(k => nodeState[k] === null)) {
          pluginStates.delete(node);
        }
      }
    });
    const track = () =>
      plugin.track
        ? plugin.track({ reactiveState, expr, node, subkey })
        : null;
    track();
    depCapture.capturingDeps = false;
    /** @type {VelinBindingEffect} */
    const effect = () => {
      if (!nodeState || !nodeState[stateKey]) return; // Is finalized
      const tracked = track();
      const control = plugin.render({
        reactiveState,
        expr,
        node,
        subkey,
        tracked,
        pluginState: nodeState[stateKey],
        attributeName
      });
      if (control?.state) {
        nodeState[stateKey] = control.state;
        pluginStates.set(node, nodeState);
      }

      emit("afterProcessNode", {
        reactiveState,
        node,
        plugin: plugin.name,
        originalNode: nodeState["ø__originalNode"],
      });
      return control;
    };
    const entries = Array.from(depCapture.deps);
    const deps = entries.filter(
      (e) =>
        !entries.some(
          (other) =>
            other !== e &&
            other.startsWith(e) &&
            [".", "["].includes(other.charAt(e.length))
        )
    );
    if (deps.length)
      if (__DEV__)
        console.log("Dependencies tracked: " + Array.from(deps).join(", "));
    for (const dep of deps) {
      let prop = dep;
      if (reactiveState.interpolations) {
        for (const [key, value] of reactiveState.interpolations.entries()) {
          if ("root." + key === prop) {
            prop = value.replace("vln", "root");
          }
        }
      }
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
 */
function tokenize(expr) {
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
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i++];
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(num) });
      continue;
    }

    // Strings
    if (char === '"' || char === "'") {
      const quote = char;
      let str = '';
      i++; // skip opening quote
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === '\\') {
          i++; // skip escape
          if (i < expr.length) str += expr[i++];
        } else {
          str += expr[i++];
        }
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Identifiers
    if (/[a-zA-Z_$]/.test(char)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) {
        ident += expr[i++];
      }
      // Handle keywords/literals
      if (ident === 'true') tokens.push({ type: 'BOOLEAN', value: true });
      else if (ident === 'false') tokens.push({ type: 'BOOLEAN', value: false });
      else if (ident === 'null') tokens.push({ type: 'NULL', value: null });
      else if (ident === 'undefined') tokens.push({ type: 'UNDEFINED', value: undefined });
      else tokens.push({ type: 'IDENTIFIER', value: ident });
      continue;
    }

    // Multi-char operators
    if (i + 2 < expr.length && expr.substr(i, 3) === '===') {
      tokens.push({ type: 'OPERATOR', value: '===' });
      i += 3;
      continue;
    }
    if (i + 2 < expr.length && expr.substr(i, 3) === '!==') {
      tokens.push({ type: 'OPERATOR', value: '!==' });
      i += 3;
      continue;
    }
    if (i + 1 < expr.length && expr.substr(i, 2) === '&&') {
      tokens.push({ type: 'OPERATOR', value: '&&' });
      i += 2;
      continue;
    }
    if (i + 1 < expr.length && expr.substr(i, 2) === '||') {
      tokens.push({ type: 'OPERATOR', value: '||' });
      i += 2;
      continue;
    }
    if (i + 1 < expr.length && expr.substr(i, 2) === '>=') {
      tokens.push({ type: 'OPERATOR', value: '>=' });
      i += 2;
      continue;
    }
    if (i + 1 < expr.length && expr.substr(i, 2) === '<=') {
      tokens.push({ type: 'OPERATOR', value: '<=' });
      i += 2;
      continue;
    }
    if (i + 1 < expr.length && expr.substr(i, 2) === '==') {
      tokens.push({ type: 'OPERATOR', value: '==' });
      i += 2;
      continue;
    }
    if (i + 1 < expr.length && expr.substr(i, 2) === '!=') {
      tokens.push({ type: 'OPERATOR', value: '!=' });
      i += 2;
      continue;
    }

    // Check for assignment (not supported)
    if (char === '=') {
      throw new Error('[VLN010] Setting values during evaluation is forbidden. Use Velin.getSetter');
    }

    // Single-char tokens
    if ('+-*/%><()[]{}.,?:!'.includes(char)) {
      if ('+-*/%><!='.includes(char)) {
        tokens.push({ type: 'OPERATOR', value: char });
      } else {
        tokens.push({ type: 'PUNCTUATION', value: char });
      }
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${char}`);
  }

  return tokens;
}

/**
 * Parser for CSP-safe expression evaluation
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
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error(`Expected ${type} ${value || ''}, got ${token ? token.type : 'EOF'}`);
    }
    return token;
  }

  function parseTernary() {
    let node = parseLogicalOr();

    if (peek() && peek().type === 'PUNCTUATION' && peek().value === '?') {
      next(); // consume ?
      const consequent = parseTernary();
      expect('PUNCTUATION', ':');
      const alternate = parseTernary();
      return { type: 'Ternary', test: node, consequent, alternate };
    }

    return node;
  }

  function parseLogicalOr() {
    let left = parseLogicalAnd();

    while (peek() && peek().type === 'OPERATOR' && peek().value === '||') {
      const op = next().value;
      const right = parseLogicalAnd();
      left = { type: 'Binary', operator: op, left, right };
    }

    return left;
  }

  function parseLogicalAnd() {
    let left = parseEquality();

    while (peek() && peek().type === 'OPERATOR' && peek().value === '&&') {
      const op = next().value;
      const right = parseEquality();
      left = { type: 'Binary', operator: op, left, right };
    }

    return left;
  }

  function parseEquality() {
    let left = parseComparison();

    while (peek() && peek().type === 'OPERATOR' && ['===', '!==', '==', '!='].includes(peek().value)) {
      const op = next().value;
      const right = parseComparison();
      left = { type: 'Binary', operator: op, left, right };
    }

    return left;
  }

  function parseComparison() {
    let left = parseAdditive();

    while (peek() && peek().type === 'OPERATOR' && ['>', '<', '>=', '<='].includes(peek().value)) {
      const op = next().value;
      const right = parseAdditive();
      left = { type: 'Binary', operator: op, left, right };
    }

    return left;
  }

  function parseAdditive() {
    let left = parseMultiplicative();

    while (peek() && peek().type === 'OPERATOR' && ['+', '-'].includes(peek().value)) {
      const op = next().value;
      const right = parseMultiplicative();
      left = { type: 'Binary', operator: op, left, right };
    }

    return left;
  }

  function parseMultiplicative() {
    let left = parseUnary();

    while (peek() && peek().type === 'OPERATOR' && ['*', '/', '%'].includes(peek().value)) {
      const op = next().value;
      const right = parseUnary();
      left = { type: 'Binary', operator: op, left, right };
    }

    return left;
  }

  function parseUnary() {
    if (peek() && peek().type === 'OPERATOR' && ['!', '-', '+'].includes(peek().value)) {
      const op = next().value;
      const argument = parseUnary();
      return { type: 'Unary', operator: op, argument };
    }

    return parseCall();
  }

  function parseCall() {
    let node = parseMember();

    while (peek() && peek().type === 'PUNCTUATION' && peek().value === '(') {
      next(); // consume (
      const args = [];

      while (!peek() || (peek().type !== 'PUNCTUATION' || peek().value !== ')')) {
        args.push(parseTernary());
        if (peek() && peek().type === 'PUNCTUATION' && peek().value === ',') {
          next(); // consume ,
        }
      }

      expect('PUNCTUATION', ')');
      node = { type: 'Call', callee: node, arguments: args };
    }

    return node;
  }

  function parseMember() {
    let node = parsePrimary();

    while (true) {
      if (peek() && peek().type === 'PUNCTUATION' && peek().value === '.') {
        next(); // consume .
        const property = expect('IDENTIFIER');
        node = { type: 'Member', object: node, property: property.value, computed: false };
      } else if (peek() && peek().type === 'PUNCTUATION' && peek().value === '[') {
        next(); // consume [
        const property = parseTernary();
        expect('PUNCTUATION', ']');
        node = { type: 'Member', object: node, property, computed: true };
      } else {
        break;
      }
    }

    return node;
  }

  function parsePrimary() {
    const token = peek();

    if (!token) {
      throw new Error('Unexpected end of expression');
    }

    if (token.type === 'NUMBER' || token.type === 'STRING' || token.type === 'BOOLEAN' || token.type === 'NULL' || token.type === 'UNDEFINED') {
      next();
      return { type: 'Literal', value: token.value };
    }

    if (token.type === 'IDENTIFIER') {
      next();
      return { type: 'Identifier', name: token.value };
    }

    if (token.type === 'PUNCTUATION' && token.value === '(') {
      next(); // consume (
      const node = parseTernary();
      expect('PUNCTUATION', ')');
      return node;
    }

    // Object literal
    if (token.type === 'PUNCTUATION' && token.value === '{') {
      next(); // consume {
      const properties = [];

      while (peek() && !(peek().type === 'PUNCTUATION' && peek().value === '}')) {
        // Parse property key
        let key;
        const keyToken = peek();
        if (keyToken.type === 'IDENTIFIER') {
          key = next().value;
        } else if (keyToken.type === 'STRING') {
          key = next().value;
        } else {
          throw new Error(`Expected property name, got ${keyToken.type}`);
        }

        expect('PUNCTUATION', ':');
        const value = parseTernary();
        properties.push({ key, value });

        if (peek() && peek().type === 'PUNCTUATION' && peek().value === ',') {
          next(); // consume ,
        }
      }

      expect('PUNCTUATION', '}');
      return { type: 'ObjectLiteral', properties };
    }

    throw new Error(`Unexpected token: ${token.type} ${token.value}`);
  }

  return parseTernary();
}

/**
 * Evaluates an expression against the reactive state with optional context proxying
 * CSP-safe implementation using tokenizer + parser + AST walker
 *
 * @type {Evaluate}
 */
function evaluate(reactiveState, expr) {
  reactiveState.ø__control.evaluating = true;

  /**
   * Evaluates AST with given context
   * Nested function to access reactiveState
   */
  function evalAst(ast, context) {
    switch (ast.type) {
      case 'Literal':
        return ast.value;

      case 'Identifier':
        return context[ast.name];

      case 'Member':
        const obj = evalAst(ast.object, context);
        if (obj == null) return undefined;
        if (ast.computed) {
          const prop = evalAst(ast.property, context);
          return obj[prop];
        } else {
          return obj[ast.property];
        }

      case 'Call':
        const callee = evalAst(ast.callee, context);
        if (typeof callee !== 'function') {
          throw new Error('Cannot call non-function');
        }
        const args = ast.arguments.map(arg => evalAst(arg, context));
        // Get the object for 'this' binding
        let thisArg = undefined;
        if (ast.callee.type === 'Member') {
          thisArg = evalAst(ast.callee.object, context);
        }

        // Temporarily disable evaluating flag for user function calls
        // This allows event handlers and user functions to modify state
        const wasEvaluating = reactiveState.ø__control.evaluating;
        reactiveState.ø__control.evaluating = false;
        try {
          return callee.apply(thisArg, args);
        } finally {
          reactiveState.ø__control.evaluating = wasEvaluating;
        }

      case 'Binary':
        const left = evalAst(ast.left, context);
        const right = evalAst(ast.right, context);
        switch (ast.operator) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/': return left / right;
          case '%': return left % right;
          case '>': return left > right;
          case '<': return left < right;
          case '>=': return left >= right;
          case '<=': return left <= right;
          case '===': return left === right;
          case '!==': return left !== right;
          case '==': return left == right;
          case '!=': return left != right;
          case '&&': return left && right;
          case '||': return left || right;
          default:
            throw new Error(`Unknown operator: ${ast.operator}`);
        }

      case 'Unary':
        const argument = evalAst(ast.argument, context);
        switch (ast.operator) {
          case '!': return !argument;
          case '-': return -argument;
          case '+': return +argument;
          default:
            throw new Error(`Unknown unary operator: ${ast.operator}`);
        }

      case 'Ternary':
        const test = evalAst(ast.test, context);
        return evalAst(test ? ast.consequent : ast.alternate, context);

      case 'ObjectLiteral':
        const result = {};
        for (const prop of ast.properties) {
          result[prop.key] = evalAst(prop.value, context);
        }
        return result;

      default:
        throw new Error(`Unknown AST node type: ${ast.type}`);
    }
  }

  try {
    const inter = reactiveState.interpolations;
    const contextualizedProxy = new Proxy(reactiveState.state, {
      get(target, prop, receiver) {
        const propStr = String(prop);
        if (inter && inter.has(propStr)) {
          const interp = inter.get(propStr);
          return evaluate(reactiveState, interp);
        }
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (reactiveState.ø__control.evaluating)
          throw new Error(
            "[VLN010] Setting values during evaluation is forbidden. Use Velin.getSetter"
          );
        return Reflect.set(target, prop, value, receiver);
      },
    });

    // Parse and evaluate using CSP-safe approach
    const tokens = tokenize(expr);
    const ast = parse(tokens);

    // Create sandboxed wrapper for Math to prevent constructor access
    const sandboxedGlobals = {
      Math: new Proxy(Math, {
        get(target, prop) {
          if (prop === 'constructor') return undefined;
          return Reflect.get(target, prop);
        }
      }),
    };

    // Create evaluation context with state and sandboxed globals
    const context = new Proxy(contextualizedProxy, {
      get(target, prop, receiver) {
        // Return sandboxed globals
        if (prop in sandboxedGlobals) {
          return sandboxedGlobals[prop];
        }
        return Reflect.get(target, prop, receiver);
      }
    });

    return evalAst(ast, context);
  } catch (err) {
    console.error(
      `Velin evaluate() error in expression "${expr}".`
    );
    throw err;
  } finally {
    reactiveState.ø__control.evaluating = false;
  }
}

/**
 * Creates a setter function for the last property in an expression path
 * @type {GetSetter}
 */
function getSetter(reactiveState, expr) {
  const inter = reactiveState.interpolations;
  const property = inter?.has(expr) ? inter.get(expr) : expr;
  const lastDotIndex = property.lastIndexOf(".");

  // Handle root-level properties (no dots)
  if (lastDotIndex === -1) {
    return (value) => (reactiveState.state[property] = value);
  }

  const parent = evaluate(reactiveState, property.slice(0, lastDotIndex));
  const key = property.slice(lastDotIndex + 1);
  return (value) => (parent[key] = value);
}

/**
 * Triggers all reactive effects bound to a property and clears stale bindings
 * @param {string} prop Property path that changed
 * @param {ReactiveState} reactiveState The reactive state
 * @returns {void}
 */
function triggerEffects(prop, reactiveState) {
  if (__DEV__)
    console.log(
      prop +
        " changed, triggering effects. " +
        (reactiveState.bindings.get(prop)
          ? reactiveState.bindings.get(prop).size
          : 0) +
        " found"
    );
  if (!reactiveState.bindings.has(prop)) return;
  for (const effect of reactiveState.bindings.get(prop) || []) {
    effect();
  }
}

/**
 * Sets up a reactive state proxy wrapping an object or array
 * @param {Object|Array} obj Initial state object/array
 * @returns {ReactiveState} Reactive state with proxies and dependency tracking
 */
function setupState(obj) {
  const ø__depCaptures = [];
  const ø__control = {
    evaluating: false,
    currentCycleID: null,
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
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (!init && ø__control.evaluating)
          throw new Error(
            "[VLN010] Setting values during evaluation is forbidden. Use Velin.getSetter"
          );
        const innerPath = path + "." + prop.toString();
        const old = target[prop];
        const result = Reflect.set(
          target,
          prop,
          wrap(value, innerPath),
          receiver
        );
        if (old !== value && !init) {
          triggerEffects(path + "." + prop.toString(), reactiveState);
        }
        return result;
      },
    });
    Object.keys(obj).forEach(
      (prop) => (state[prop] = wrap(state[prop], path + "." + prop.toString()))
    );
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
        if (depCapture?.capturingDeps)
          depCapture.deps.add(path + "[" + prop.toString() + "]");

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
              init = true;
              try {
                for (let i = 0; i < arr.length; i++) {
                  arr[i] = wrap(arr[i], path + "[" + i + "]");
                }
              } finally {
                init = false;
              }
              triggerEffects(path, reactiveState);
            }
            return result;
          };
        }
        return value;
      },
      set(target, prop, value, receiver) {
        if (!init && ø__control.evaluating)
          throw new Error(
            "[VLN010] Setting values during evaluation is forbidden. Use Velin.getSetter"
          );
        if ((typeof prop === 'number' && !isNaN(prop)) || /^\d+$/.test(prop.toString())) {
          const innerPath = path + "[" + prop.toString() + "]";
          const old = target[prop];
          const result = Reflect.set(
            target,
            prop,
            wrap(value, innerPath),
            receiver
          );
          if (old !== value && !init) {
            triggerEffects(innerPath, reactiveState);
          }
          return result;
        }
        return Reflect.set(target, prop, value, receiver);
      },
    });

    for (let i = 0; i < arr.length; i++) {
      arrayProxy[i] = wrap(arr[i], path + "[" + i + "]");
    }

    return arrayProxy;
  }

  /**
   * Wraps a value recursively if it's object or array
   * @param {any} value
   * @param {string} path
   * @returns {any}
   */
  function wrap(value, path) {
    if (value === null || value === undefined) return value;
    if (value.ø__velinObj) return value;
    if (typeof value === "object") {
      if (Array.isArray(value)) return wrapArray(value, path);
      return wrapObj(value, path);
    }
    return value;
  }

  const state = wrap(obj, "root");
  reactiveState.state = state;
  init = false;
  return reactiveState;
}

/**
 * Creates a child reactive state from parent, combining interpolations and sub-context if they exist.
 * Both interpolations and context will be replaced
 * @type {ComposeState}
 */
function composeState(reactiveState, interpolations) {
  /** @type {ReactiveState} */
  const inner = {
    ...reactiveState,
    interpolations: new Map([
      ...(reactiveState.interpolations?.entries() ?? []),
      ...interpolations.entries(),
    ]),
    ø__innerBindings: new Map(),
    ø__innerStates: new Set(),
    ø__finalizers: []
  };
  reactiveState.ø__innerStates.add(inner);
  return inner;
}

/**
 * Clears a child reactive state, especially now obsolete bindings
 * @type {CleanupState}
 */
function cleanupState(parentState, innerState) {
  if (parentState === innerState) return;
  // Clear interpolations
  if (innerState.interpolations) {
    innerState.interpolations.clear();
  }
  // Clear inner bindings
  if (innerState.ø__innerBindings) {
    for (const [property, effects] of Array.from(
      innerState.ø__innerBindings.entries()
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
  innerState.ø__finalizers.forEach(fn => fn());
  // Recursively clear child states
  innerState.ø__innerStates.forEach((inner) => cleanupState(innerState, inner));
  // Delete from chain
  if (!parentState.ø__innerStates.delete(innerState)) {
    throw new Error("[VLN011] Failed to delete inner state from parent. This indicates a state management corruption.");
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
 * Recursively processes a DOM node and its children to apply Velin plugins based on data attributes.
 * @param {Node} node DOM node to process
 * @param {ReactiveState} reactiveState The reactive state object
 */
function processNode(node, reactiveState) {
  if (!(node instanceof HTMLElement)) return;
  if (node instanceof HTMLTemplateElement) return;
  if (__DEV__) console.log("Processing node", node);

  // List all applicable plugins
  const applicable = [];
  for (const { name, value } of Array.from(node.attributes)) {
    if (!name.startsWith("vln-")) continue;

    const key = name.slice(4);
    let pluginKey = key;
    let subcommand = null;

    if (key.includes(":")) {
      [pluginKey, subcommand] = key.split(":");
    }

    if (plugins.has(pluginKey)) {
      applicable.push({
        pluginKey,
        name,
        value,
        subcommand,
        plugin: plugins.get(pluginKey),
      });
    } else {
      // Unknown plugin - add error handler with lowest priority
      // If another plugin halts before this, error won't be thrown
      applicable.push({
        pluginKey: null,
        name,
        value,
        subcommand,
        plugin: {
          name: '__error__',
          priority: -Infinity,
          render: () => {
            const availablePlugins = Array.from(plugins.keys()).join(', ');
            throw new Error(
              `[Velin] Plugin '${pluginKey}' is not registered. ` +
              `Available plugins: ${availablePlugins}`
            );
          }
        }
      });
    }
  }

  // Sort by priorities (highest = first)
  applicable.sort((a, b) => (b.plugin.priority || 0) - (a.plugin.priority || 0));

  // Apply
  for (const { plugin, name, value, subcommand } of applicable) {
    const control = processPlugin(plugin, reactiveState, value, node, name, subcommand);
    consumeAttribute(node, name, value);
    if (control?.halt) return;
  }

  // Process tree
  for (const child of Array.from(node.children)) {
    processNode(child, reactiveState);
  }
}


/**
 * Initializes Velin reactivity on the DOM subtree starting at root with the given initial state.
 * @type {Bind}
 */
function bind(root = document.body, initialState = {}) {
  const reactiveState = setupState(initialState);
  processNode(root, reactiveState);
  boundState.root = reactiveState;
  return reactiveState.state;
}

/** @type {VelinCore} */
const Velin = {
  bind,
  evaluate,
  getSetter,
  composeState,
  cleanupState,
  processNode,
  on,
  plugins: {
    registerPlugin,
    processPlugin,
    get: plugins.get.bind(plugins),
    priorities: DefaultPluginPriorities
  },
  trackers,
  ø__internal: {
    pluginStates,
    boundState,
    consumeAttribute,
    triggerEffects
  },
};

export default Velin;

/** @type {any} */
const __win = window;

if (typeof window !== 'undefined' && !__win.Velin) {
  __win.Velin = Velin;
}
