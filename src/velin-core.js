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

/** @typedef {(reactiveState: ReactiveState, expr: string, allowMutations?: boolean) => any} Evaluate */
/** @typedef {(reactiveState: ReactiveState, expr: string) => (value: any) => void} GetSetter */
/** @typedef {(prop: string, reactiveState: ReactiveState) => void} TriggerEffects */
/** @typedef {(node: Node, reactiveState: ReactiveState) => void} ProcessNode */
/** @typedef {(node: HTMLElement, attr: string, expr: string) => void} ConsumeAttribute */

/** @typedef {(reactiveState: ReactiveState, interpolations: Map<string, any>) => ReactiveState} ComposeState */
/** @typedef {(parentState: ReactiveState, innerState: ReactiveState) => void} CleanupState */
/** @typedef {<T extends object>(root?: Element | DocumentFragment, initialState?: T) => T} Bind */

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
 * @property {Trackers} trackers
 * @property {VelinInternal} ø__internal
 */

/** @type {Map<string, VelinPlugin>} */
const plugins = new Map();
/** @type {WeakMap<Node, any>} */
const pluginStates = new WeakMap();
/** @type {{root?: ReactiveState}} */
const boundState = { root: undefined };

/**
 *
 * @param {Array} arr
 * @returns {any=}
 */
function peek(arr) {
  return arr[arr.length - 1];
}

const trackers = {
  /**
   * Tracks dependencies by evaluating the expression.
   * Used by plugins that need to reactively display or compute values.
   *
   * @param {Object} args
   * @param {ReactiveState} args.reactiveState - The reactive state object
   * @param {string} args.expr - JavaScript expression to evaluate
   * @returns {any} The evaluated result
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
  expressionTracker: ({ reactiveState, expr }) => evaluate(reactiveState, expr),

  /**
   * Returns a setter function for the expression's target property.
   * Used by plugins that need two-way data binding.
   *
   * @param {Object} args
   * @param {ReactiveState} args.reactiveState - The reactive state object
   * @param {string} args.expr - Property path to create setter for
   * @returns {(value: any) => void} Function that sets the property value
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
  setterTracker: ({ reactiveState, expr }) => getSetter(reactiveState, expr),
};

/**
 * Registers a Velin plugin to create custom directives.
 *
 * After registration, the plugin can be used as `vln-{name}` in HTML.
 * Plugins can have priorities, track dependencies, render DOM updates,
 * and cleanup resources.
 *
 * @type {RegisterPlugin}
 *
 * @example
 * // Simple text transformation plugin
 * Velin.plugins.registerPlugin({
 *   name: 'uppercase',
 *   track: Velin.trackers.expressionTracker,
 *   render: ({ node, tracked }) => {
 *     node.textContent = String(tracked).toUpperCase();
 *   }
 * });
 * // Usage: <div vln-uppercase="message"></div>
 *
 * @example
 * // Plugin with cleanup
 * Velin.plugins.registerPlugin({
 *   name: 'clickoutside',
 *   destroy: ({ node, pluginState }) => {
 *     if (pluginState.handler) {
 *       document.removeEventListener('click', pluginState.handler);
 *     }
 *   },
 *   render: ({ reactiveState, expr, node, pluginState = {} }) => {
 *     const handler = (e) => {
 *       if (!node.contains(e.target)) {
 *         Velin.evaluate(reactiveState, expr);
 *       }
 *     };
 *     document.addEventListener('click', handler);
 *     return { state: { handler } };
 *   }
 * });
 *
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/plugins.md|Creating Plugins Guide}
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/api-reference.md#velinpluginsregisterplugin|API Reference}
 */
function registerPlugin(def) {
  plugins.set(def.name, {
    ...def,
  });
}

/**
 * Processes a plugin on a specific node with reactive state.
 *
 * This is an Advanced API typically called automatically by processNode(),
 * but can be called directly in custom plugins that need to manually invoke
 * other plugins.
 *
 * **What it does:**
 * - Sets up dependency tracking
 * - Calls plugin's track() function
 * - Creates reactive effect that calls plugin's render()
 * - Registers cleanup in plugin's destroy() hook
 * - Returns control object from render()
 *
 * @type {ProcessPlugin}
 *
 * @example
 * // Manually calling another plugin from your plugin
 * Velin.plugins.registerPlugin({
 *   name: 'mycombo',
 *   render: ({ reactiveState, node }) => {
 *     const textPlugin = Velin.plugins.get('text');
 *     Velin.plugins.processPlugin(
 *       textPlugin,
 *       reactiveState,
 *       'message',
 *       node,
 *       'vln-text'
 *     );
 *   }
 * });
 *
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/api-reference.md#velinpluginsprocessplugin|API Reference}
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/plugins.md#accessing-other-plugins|Creating Plugins: Accessing Other Plugins}
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

      return control;
    };
    const entries = [...depCapture.deps];
    const deps = entries.filter(
      (e) =>
        !entries.some(
          (other) =>
            other !== e &&
            other.startsWith(e) &&
            [".", "["].includes(other.charAt(e.length))
        )
    );
    if (deps.length && __DEV__)
      console.log("Dependencies tracked: " + deps.join(", "));
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
    const ops = ['===', '!==', '&&', '||', '>=', '<=', '==', '!='];
    let matched = false;
    for (const op of ops) {
      if (expr.slice(i, i + op.length) === op) {
        tokens.push({ type: 'OPERATOR', value: op });
        i += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Single = for assignment
    if (char === '=') {
      tokens.push({ type: 'ASSIGNMENT', value: '=' });
      i++;
      continue;
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

    throw new Error(`Unexpected: ${char}`);
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

  // Helper to check if current token matches criteria
  const match = (type, val) => {
    const t = peek();
    return t && t.type === type && (!val || t.value === val || val.includes?.(t.value));
  };

  // Precedence table for binary operators
  const prec = [[['||']], [['&&']], [['===', '!==', '==', '!=']], [['>', '<', '>=', '<=']], [['+', '-']], [['*', '/', '%']]];

  function parseSequence() {
    let expressions = [parseAssignment()];

    while (match('PUNCTUATION', ',')) {
      next();
      expressions.push(parseAssignment());
    }

    return expressions.length === 1
      ? expressions[0]
      : { type: 'Sequence', expressions };
  }

  function parseAssignment() {
    let node = parseTernary();

    if (match('ASSIGNMENT', '=')) {
      next();
      const right = parseAssignment(); // Right-associative
      return { type: 'Assignment', left: node, right };
    }

    return node;
  }

  function parseTernary() {
    let node = parseBinary(0);

    if (match('PUNCTUATION', '?')) {
      next();
      const consequent = parseTernary();
      expect('PUNCTUATION', ':');
      const alternate = parseTernary();
      return { type: 'Ternary', test: node, consequent, alternate };
    }

    return node;
  }

  // Consolidated binary operator parser with precedence levels
  function parseBinary(p) {
    let left = p === 5 ? parseUnary() : parseBinary(p + 1);

    if (p < 6) {
      while (match('OPERATOR', prec[p][0])) {
        const op = next().value;
        const right = p === 5 ? parseUnary() : parseBinary(p + 1);
        left = { type: 'Binary', operator: op, left, right };
      }
    }

    return left;
  }

  function parseUnary() {
    if (match('OPERATOR', ['!', '-', '+'])) {
      const op = next().value;
      const argument = parseUnary();
      return { type: 'Unary', operator: op, argument };
    }

    return parseCall();
  }

  function parseCall() {
    let node = parseMember();

    while (match('PUNCTUATION', '(')) {
      next();
      const args = [];

      while (!match('PUNCTUATION', ')')) {
        args.push(parseAssignment());
        if (match('PUNCTUATION', ',')) next();
      }

      expect('PUNCTUATION', ')');
      node = { type: 'Call', callee: node, arguments: args };
    }

    return node;
  }

  function parseMember() {
    let node = parsePrimary();

    while (true) {
      if (match('PUNCTUATION', '.')) {
        next();
        const property = expect('IDENTIFIER');
        node = { type: 'Member', object: node, property: property.value, computed: false };
      } else if (match('PUNCTUATION', '[')) {
        next();
        const property = parseAssignment();
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
      throw new Error('Unexpected end');
    }

    if (['NUMBER', 'STRING', 'BOOLEAN', 'NULL', 'UNDEFINED'].includes(token.type)) {
      next();
      return { type: 'Literal', value: token.value };
    }

    if (token.type === 'IDENTIFIER') {
      next();
      return { type: 'Identifier', name: token.value };
    }

    if (match('PUNCTUATION', '(')) {
      next();
      const node = parseSequence();
      expect('PUNCTUATION', ')');
      return node;
    }

    // Object literal
    if (match('PUNCTUATION', '{')) {
      next();
      const properties = [];

      while (!match('PUNCTUATION', '}')) {
        // Parse property key
        let key;
        const keyToken = peek();
        if (keyToken.type === 'IDENTIFIER') {
          key = next().value;
        } else if (keyToken.type === 'STRING') {
          key = next().value;
        } else {
          throw new Error(`Bad property name`);
        }

        // Check for shorthand property syntax: { foo } instead of { foo: foo }
        let value;
        if (match('PUNCTUATION', [',', '}'])) {
          // Shorthand syntax: use key as identifier
          if (keyToken.type !== 'IDENTIFIER') {
            throw new Error(`Bad shorthand`);
          }
          value = { type: 'Identifier', name: key };
        } else {
          // Regular syntax: expect colon and value
          expect('PUNCTUATION', ':');
          value = parseAssignment();
        }

        properties.push({ key, value });

        if (match('PUNCTUATION', ',')) next();
      }

      expect('PUNCTUATION', '}');
      return { type: 'ObjectLiteral', properties };
    }

    throw new Error(`Unexpected: ${token.type}`);
  }

  return parseSequence();
}

/**
 * Evaluates AST with given context
 * @param {Object} ast - The AST node
 * @param {Object} context - The context object (reactive proxy)
 * @param {ReactiveState|null} reactiveState - The reactive state (for mutation control)
 */
function evalAst(ast, context, reactiveState = null) {
  switch (ast.type) {
    case 'Literal':
      return ast.value;

    case 'Identifier':
      return context[ast.name];

    case 'Member': {
      const obj = evalAst(ast.object, context, reactiveState);
      if (obj == null) return undefined;
      if (ast.computed) {
        const prop = evalAst(ast.property, context, reactiveState);
        return obj[prop];
      } else {
        return obj[ast.property];
      }
    }
    case 'Call': {
      const callee = evalAst(ast.callee, context, reactiveState);
      if (typeof callee !== 'function') {
        throw new TypeError('Not a function');
      }
      const args = ast.arguments.map(arg => evalAst(arg, context, reactiveState));
      // Get the object for 'this' binding
      let thisArg = context;
      if (ast.callee.type === 'Member') {
        thisArg = evalAst(ast.callee.object, context, reactiveState);
      }

      return callee.apply(thisArg, args);
    }

    case 'Binary': {
      const left = evalAst(ast.left, context, reactiveState);
      const right = evalAst(ast.right, context, reactiveState);
      const ops = {
        '+':  (a, b) => a + b,
        '-':  (a, b) => a - b,
        '*':  (a, b) => a * b,
        '/':  (a, b) => a / b,
        '%':  (a, b) => a % b,
        '>':  (a, b) => a > b,
        '<':  (a, b) => a < b,
        '>=': (a, b) => a >= b,
        '<=': (a, b) => a <= b,
        '===':(a, b) => a === b,
        '!==':(a, b) => a !== b,
        '==': (a, b) => a == b,
        '!=': (a, b) => a != b,
        '&&': (a, b) => a && b,
        '||': (a, b) => a || b,
      };

      return (ops[ast.operator] || (() => undefined))(left, right);

    }

    case 'Unary': {
      const arg = evalAst(ast.argument, context, reactiveState);
      const ops = {
        '!':  (a) => !a,
        '-':  (a) => -a,
      };

      return (ops[ast.operator] || (() => undefined))(arg);
    }

    case 'Ternary': {
      const test = evalAst(ast.test, context, reactiveState);
      return test ? evalAst(ast.consequent, context, reactiveState) : evalAst(ast.alternate, context, reactiveState);
    }

    case 'ObjectLiteral': {
      const result = {};
      for (const prop of ast.properties) {
        result[prop.key] = evalAst(prop.value, context, reactiveState);
      }
      return result;
    }

    case 'Assignment': {
      const value = evalAst(ast.right, context, reactiveState);

      if (ast.left.type === 'Identifier') {
        // Simple assignment: x = value
        context[ast.left.name] = value;
      } else if (ast.left.type === 'Member') {
        // Member assignment: obj.prop = value or obj[key] = value
        const obj = evalAst(ast.left.object, context, reactiveState);
        if (obj == null) {
          throw new TypeError('Cannot set property on null or undefined');
        }
        if (ast.left.computed) {
          const prop = evalAst(ast.left.property, context, reactiveState);
          obj[prop] = value;
        } else {
          obj[ast.left.property] = value;
        }
      } else {
        throw new Error('Invalid assignment target');
      }

      return value;
    }

    case 'Sequence': {
      let result;
      for (const expr of ast.expressions) {
        result = evalAst(expr, context, reactiveState);
      }
      return result;
    }

    default:
      throw new Error(`Bad AST: ${ast.type}`);
  }
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
 * @example
 * // Evaluating lifecycle hooks in templates
 * if (lifecycle.onMount) {
 *   Velin.evaluate(innerState, lifecycle.onMount, true);
 * }
 *
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/api-reference.md#velintrackersevaluate|API Reference}
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/getting-started.md#expressions-are-javascript|Getting Started: Expressions}
 */
function evaluate(reactiveState, expr, allowMutations = false) {
  reactiveState.ø__control.evaluating = !allowMutations;
  try {
    const inter = reactiveState.interpolations;
    const contextualizedProxy = new Proxy(reactiveState.state, {
      get(target, prop, receiver) {
        const propStr = String(prop);
        if (inter?.has(propStr)) {
          const interp = inter.get(propStr);
          // If interpolation is a string, evaluate it as an expression
          // Otherwise, return the value directly (e.g., event objects)
          return typeof interp === 'string'
            ? evaluate(reactiveState, interp, allowMutations)
            : interp;
        }
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        // TODO: This optional chaining is a hack to prevent crashes when async functions
        // mutate state after their evaluation context has been cleaned up (e.g., event handlers
        // with async operations). We should instead:
        // 1. Detect null ø__control and throw a helpful error explaining the async issue
        // 2. Add explicit async support via vln-on:event|async modifier
        // 3. Await async results before cleanup OR use different cleanup strategy
        // For now, this silently allows mutations that should probably be flagged.
        if (reactiveState.ø__control?.evaluating)
          throw new Error(
            "[VLN010] Setting values during evaluation is forbidden. Use Velin.getSetter"
          );
        return Reflect.set(target, prop, value, receiver);
      },
    });

    // Parse and evaluate using CSP-safe approach
    const tokens = tokenize(expr);
    const ast = parse(tokens);

    return evalAst(ast, contextualizedProxy, reactiveState);
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
    Object.keys(obj).forEach((prop) => {
      const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
      // Skip accessor properties (getters/setters) - they don't need wrapping
      if (descriptor && !descriptor.get && !descriptor.set) {
        state[prop] = wrap(state[prop], path + "." + prop.toString());
      }
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
        if (depCapture?.capturingDeps) {
          // For .length and other properties that depend on array mutations, track the array itself
          if (prop === "length" || typeof value === "function") {
            depCapture.deps.add(path);
          } else {
            depCapture.deps.add(path + "[" + prop.toString() + "]");
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
 * Creates a child reactive state with scoped variables (interpolations).
 *
 * This is a "Danger Zone" API used by structure-altering plugins like vln-loop
 * and vln-fragment to create isolated scopes with their own variables while
 * still accessing the parent state.
 *
 * **How it works:**
 * - Child state inherits parent's reactive proxy
 * - Interpolations map variable names to property paths in parent state
 * - When child accesses interpolated variable, it resolves to parent property
 * - Child tracks its own bindings for cleanup
 *
 * @type {ComposeState}
 *
 * @example
 * // Used in vln-loop to create scoped 'item' and '$index' variables
 * for (let i = 0; i < tracked.length; i++) {
 *   const interpolations = new Map();
 *   interpolations.set('item', `todos[${i}]`);  // 'item' resolves to todos[0], todos[1], etc.
 *   interpolations.set('$index', `${i}`);       // '$index' resolves to 0, 1, 2, etc.
 *
 *   const substate = Velin.composeState(reactiveState, interpolations);
 *   Velin.processNode(clone, substate); // Process with scoped state
 * }
 *
 * @example
 * // Used in vln-fragment for template variables
 * const interpolations = new Map([
 *   ['user', 'currentUser'],      // Template's 'user' maps to state's 'currentUser'
 *   ['onSave', 'handleSave']      // Template's 'onSave' maps to state's 'handleSave'
 * ]);
 * const innerState = Velin.composeState(reactiveState, interpolations);
 *
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/api-reference.md#velincomposestate|API Reference}
 * @see {@link cleanupState} for cleanup when scope is no longer needed
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/plugins.md|Creating Plugins Guide}
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
 * Clears a child reactive state and removes its bindings.
 *
 * **CRITICAL for memory management:** Always call this when removing nodes
 * created with composeState() to prevent memory leaks from stale bindings.
 *
 * This is a "Danger Zone" API used by structure-altering plugins to clean up
 * scoped states when DOM elements are removed or re-rendered.
 *
 * **What it cleans:**
 * - Interpolations (scoped variable mappings)
 * - Inner bindings (reactive effects from this scope)
 * - Finalizers (plugin cleanup functions)
 * - Recursively cleans child states
 * - Removes state from parent's tracking
 *
 * @type {CleanupState}
 *
 * @example
 * // Used in vln-loop's destroy hook
 * destroy: ({ pluginState, reactiveState }) => {
 *   if (pluginState.substates) {
 *     pluginState.substates.forEach((substate) => {
 *       Velin.cleanupState(reactiveState, substate); // Clean each loop item's state
 *     });
 *   }
 * }
 *
 * @example
 * // Used in vln-fragment when template changes
 * if (pluginState?.innerState) {
 *   Velin.cleanupState(reactiveState, pluginState.innerState);
 * }
 * // Now safe to create new inner state
 *
 * @example
 * // Used in vln-loop when removing items
 * for (let i = tracked.length; i < oldChildren.length; i++) {
 *   oldChildren[i].remove();
 *   Velin.cleanupState(reactiveState, oldSubstates[i]); // Prevent memory leak
 * }
 *
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/api-reference.md#velincleanupstate|API Reference}
 * @see {@link composeState} for creating scoped states
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/plugins.md|Creating Plugins Guide}
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
 * Recursively processes a DOM node and its children to apply Velin plugins.
 *
 * Scans for `vln-*` attributes, applies corresponding plugins in priority order,
 * and processes child nodes unless a plugin returns `{ halt: true }`.
 *
 * @param {Node} node - DOM node to process
 * @param {ReactiveState} reactiveState - The reactive state object
 *
 * @example
 * // Used in vln-loop to process cloned template
 * const clone = template.cloneNode(true);
 * const substate = Velin.composeState(reactiveState, interpolations);
 * Velin.processNode(clone, substate); // Sets up reactivity on clone
 *
 * @example
 * // Used in vln-fragment to process template content
 * const clone = template.content.cloneNode(true);
 * Array.from(clone.childNodes).forEach(child => {
 *   node.appendChild(child);
 *   Velin.processNode(child, innerState); // Process with scoped state
 * });
 *
 * @example
 * // Manual usage to make a new element reactive
 * const newElement = document.createElement('div');
 * newElement.setAttribute('vln-text', 'message');
 * document.body.appendChild(newElement);
 * Velin.processNode(newElement, reactiveState); // Apply Velin to new element
 *
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/api-reference.md#velinprocessnode|API Reference}
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/plugins.md|Creating Plugins Guide}
 */
function processNode(node, reactiveState) {
  if (!(node instanceof HTMLElement)) return;
  if (node instanceof HTMLTemplateElement) return;
  if (__DEV__) console.log("Processing node", node);

  // List all applicable plugins
  const applicable = [];
  const attrs = node.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    const name = attr.name;
    const value = attr.value;
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

  // Sort by priorities (highest = first) - skip if 0 or 1 item
  if (applicable.length > 1) {
    applicable.sort((a, b) => (b.plugin.priority || 0) - (a.plugin.priority || 0));
  }

  // Apply
  for (const { plugin, name, value, subcommand } of applicable) {
    const control = processPlugin(plugin, reactiveState, value, node, name, subcommand);
    consumeAttribute(node, name, value);
    if (control?.halt) return;
  }

  // Process tree
  const children = node.children;
  for (let i = 0; i < children.length; i++) {
    processNode(children[i], reactiveState);
  }
}


/**
 * Initializes Velin reactivity on a DOM subtree.
 *
 * This is the main entry point for using Velin. Call it once per app/component
 * with your root element and initial state. Returns a reactive proxy of your state.
 *
 * @param {Element | DocumentFragment} [root] - The root element to make reactive
 * @param {object} [initialState] - Initial state object
 * @returns {object} Reactive proxy of the state
 *
 * @example
 * // Basic usage
 * const vln = Velin.bind(document.getElementById('app'), {
 *   count: 0,
 *   name: 'World'
 * });
 *
 * vln.count++; // Automatically updates DOM
 *
 * @example
 * // With methods and getters
 * const vln = Velin.bind(document.body, {
 *   todos: [],
 *
 *   get remaining() {
 *     return this.todos.filter(t => !t.done).length;
 *   },
 *
 *   addTodo(text) {
 *     this.todos.push({ text, done: false });
 *   }
 * });
 *
 * @example
 * // TypeScript usage
 * interface AppState {
 *   count: number;
 *   name: string;
 * }
 *
 * const vln = Velin.bind<AppState>(root, {
 *   count: 0,
 *   name: 'Alice'
 * });
 *
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/api-reference.md#velinbind|API Reference}
 * @see {@link https://github.com/TFrascaroli/velin/blob/main/docs/getting-started.md|Getting Started Guide}
 */
function bind(root, initialState) {
  if (root === undefined) root = document.body;
  if (initialState === undefined) initialState = {};
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
