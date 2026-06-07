/// <reference path="./global.d.ts" />
// @ts-check

/**
 * @typedef {Object} DepCapture
 * @property {boolean} capturingDeps Whether dependencies are being captured
 * @property {Set<string>} deps Set of dependency property paths currently captured
 */

/**
 * @typedef {Object} VelinStateControl
 * @property {boolean} evaluating Whether or not we are currently in an evaluation (to prevent multi-sets in evaluation)
 * @property {boolean} wrapping Whether or not we are currently wrapping nested objects (to prevent false positives when setting the wrapped values)
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
 * @property {ImmutableMap<string, Interpolation>=} interpolations Optional map of interpolation keys to expressions
 * @property {Map<string, Set<VelinBindingEffect>>} ø__innerBindings Optional map of inner bindings (for cleanup)
 * @property {Set<ReactiveState>} ø__innerStates Optional set of inner states (for cleanup)
 * @property {Array<() => void>} ø__finalizers Optional array of plugin finalizers attached to this state (for cleanup)
 * @property {string=} tricklingRoot Optional root path for dependency filtering. Dependencies at or above this level will be filtered out (used by vln-loop to prevent unnecessary recalculations)
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

/** @typedef {(args: {node: HTMLElement, pluginState?: any, reactiveState: ReactiveState, subkey: string}) => void} PluginDestroyerFn*/

/**
 * @template Ttracked
 * @typedef {Object} VelinPlugin
 * @property {string} name
 * @property {number=} priority
 * @property {(args: {reactiveState: ReactiveState, compiledExpression: ASTNode, expr: string, node: Node, subkey: string | null}) => Ttracked} [track] Optional function to track dependencies from an expression
 * @property {(args: {reactiveState: ReactiveState, compiledExpression: ASTNode, expr: string, node: HTMLElement, subkey: string | null, tracked: Ttracked, pluginState?: any, attributeName: string}) => PluginControl | void} render Function to apply reactive updates to a node
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
 * @property {{root?: ReactiveState}} boundState
 * @property {(node: HTMLElement, attr: string, expr: string) => void} consumeAttribute
 * @property {(prop: string, reactiveState: ReactiveState) => void} triggerEffects
 */

/**
 * @template Ttracked
 * @typedef {Object} VelinPluginManager
 * @property {RegisterPlugin<Ttracked>} registerPlugin
 * @property {ProcessPlugin<Ttracked>} processPlugin
 * @property {(pluginKey: string) => VelinPlugin<Ttracked>} get
 * @property {{ [key in keyof typeof DefaultPluginPriorities]: number }} priorities
 */

/**
 * @typedef {Object} PluginControl
 * @property {any=} state Optional plugin state to persist across renders
 * @property {boolean=} halt Optional signal whether to stop processing further plugins on this node
 * @property {ReactiveState=} scopedState Optional scoped state to use for child nodes (e.g., for vln-fragment)
 */

/**
 * @template Ttracked
 * @typedef {(def: VelinPlugin<Ttracked>) => void} RegisterPlugin
 * */
/** 
 * @template Ttracked
 * @typedef {(plugin: VelinPlugin<Ttracked>, reactiveState: ReactiveState, expr: string, node: HTMLElement, attributeName: string, subkey?: string | null) => PluginControl | void} ProcessPlugin */

/** @typedef {(reactiveState: ReactiveState, expr: string, allowMutations?: boolean) => any} Evaluate */
/** @typedef {(reactiveState: ReactiveState, expr: string) => (value: any) => void} GetSetter */
/** @typedef {(prop: string, reactiveState: ReactiveState) => void} TriggerEffects */
/** @typedef {(node: Node, reactiveState: ReactiveState) => void} ProcessNode */
/** @typedef {(node: HTMLElement, attr: string, expr: string) => void} ConsumeAttribute */

/** @typedef {(reactiveState: ReactiveState, interpolations: Map<string, Interpolation>) => ReactiveState} ComposeState */
/** @typedef {(parentState: ReactiveState, innerState: ReactiveState, node?: Node | null) => void} CleanupState */
/** @typedef {<T extends object>(root?: Element | DocumentFragment, initialState?: T) => T} Bind */

/** @typedef {(args: { reactiveState: ReactiveState, expr: string, compiledExpression: ASTNode }) => any} ExpressionTracker */
/** @typedef {(args: { reactiveState: ReactiveState, expr: string, compiledExpression: ASTNode }) => (value: any) => void} SetterTracker */
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
 * @property {VelinInternal} ø__internal
 */

/** @type {Map<string, VelinPlugin<any>>} */
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
  expressionTracker: ({ reactiveState, compiledExpression }) =>
    wrapE(() => evaluateAst(compiledExpression, reactiveState), compiledExpression),

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
  setterTracker: ({ reactiveState, expr }) => wrapE(() => getSetter(reactiveState, expr), expr),

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
 * Processes a plugin on a specific node.
 * @type {ProcessPlugin<any>}
 */
function processPlugin(
  plugin,
  reactiveState,
  expr,
  node,
  attributeName,
  subkey = null,
) {
  /** @type {DepCapture} */
  const depCapture = { capturingDeps: true, deps: new Set() };
  reactiveState.ø__depCaptures.push(depCapture);
  const nodeState = pluginStates.get(node) || {};
  const stateKey = plugin.name + (subkey ? "_" + subkey : "");
  nodeState[stateKey] = {};

  const compiledExpression = compile(expr);
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
          node,
          pluginState: nodeState[stateKey],
          reactiveState,
          subkey,
        });
      }
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
            reactiveState,
            compiledExpression,
            expr,
            node,
            subkey,
          })
        : null;
    try {
      track();
    } catch (error) {
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
      const control = plugin.render({
        reactiveState,
        compiledExpression,
        node,
        subkey,
        tracked,
        pluginState: nodeState[stateKey],
        attributeName,
        expr,
      });
      if (control && control.state) {
        nodeState[stateKey] = control.state;
        pluginStates.set(node, nodeState);
      }

      return control;
    };
    const entries = [...depCapture.deps];
    // Filter dependencies only if tricklingRoot is set, otherwise keep all
    const deps = reactiveState.tricklingRoot
      ? entries.filter((e) => {
          const tricklingRoot = reactiveState.tricklingRoot;
          // Dependencies are always in "root.*" format, so normalize tricklingRoot to match
          const normalizedRoot = tricklingRoot.startsWith("root.")
            ? tricklingRoot
            : `root.${tricklingRoot}`;
          // Remove dependencies that are upstream from or at the tricklingRoot level
          // (i.e., if normalizedRoot starts with e, then e is a branch upstream)
          return !normalizedRoot.startsWith(e);
        })
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
  switch (ast.type) {
    case "Literal":
      return evalLiteral(/** @type {ASTLiteralNode} */ (ast));

    case "Identifier":
      return evalIdentifier(/** @type {ASTIdentifierNode} */ (ast), context);

    case "Member":
      return evalMember(
        /** @type {ASTMemberNode} */ (ast),
        context,
        reactiveState,
      );

    case "Call":
      return evalCall(/** @type {ASTCallNode} */ (ast), context, reactiveState);

    case "Binary":
      return evalBinary(
        /** @type {ASTBinaryNode} */ (ast),
        context,
        reactiveState,
      );

    case "Unary":
      return evalUnary(
        /** @type {ASTUnaryNode} */ (ast),
        context,
        reactiveState,
      );

    case "Ternary":
      return evalTernary(
        /** @type {ASTTernaryNode} */ (ast),
        context,
        reactiveState,
      );

    case "ObjectLiteral":
      return evalObjectLiteral(
        /** @type {ASTObjectLiteralNode} */ (ast),
        context,
        reactiveState,
      );

    case "ArrayLiteral":
      return evalArrayLiteral(
        /** @type {ASTNode} */ (ast),
        context,
        reactiveState,
      );

    case "Assignment":
      return evalAssignment(
        /** @type {ASTAssignmentNode} */ (ast),
        context,
        reactiveState,
      );

    case "Sequence":
      return evalSequence(
        /** @type {ASTSequenceNode} */ (ast),
        context,
        reactiveState,
      );

    default:
      throw new Error(`Bad AST: ${ast.type}`);
  }
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
    // If interpolation is a string, evaluate it as an expression
    // Otherwise, return the value directly (e.g., event objects)
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
  if (__DEV__)
    console.log(
      prop +
        " changed, triggering effects. " +
        (reactiveState.bindings.get(prop)
          ? reactiveState.bindings.get(prop).size
          : 0) +
        " found",
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
    wrapping: false,
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
            triggerEffects(innerPath, reactiveState);
          }
        } else if (old !== value && !init && !ø__control.wrapping) {
          triggerEffects(path + "." + prop.toString(), reactiveState);
          if (prop === "length") {
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
  reactiveState.ø__innerStates.add(inner);
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
 * Recursively processes a DOM node to apply Velin plugins.
 * @param {Node} node
 * @param {ReactiveState} reactiveState
 */
function processNode(node, reactiveState) {
  if (!(node instanceof HTMLElement)) return;
  if (node instanceof HTMLTemplateElement) return;
  if (__DEV__) console.log("Processing node", node);

  // List all applicable plugins
  const applicable = [];
  const seenPlugins = new Set();

  for (const { name, value } of Array.from(node.attributes)) {
    if (!name.startsWith("vln-")) continue;

    const key = name.slice(4);

    let pluginKey = key;
    let subcommand = null;

    if (key.includes(":")) {
      [pluginKey, subcommand] = key.split(":");
    }

    if (plugins.has(pluginKey)) {
      const plugin = plugins.get(pluginKey);
      const uniqueKey = `${plugin.name}${subcommand ? ":" + subcommand : ""}`;

      if (seenPlugins.has(uniqueKey)) {
        throw new Error(
          `[VLN013] Duplicate plugin application: '${plugin.name}' ${
            subcommand ? "with subcommand '" + subcommand + "' " : ""
          }is applied multiple times to the same node. Each plugin/subcommand pair must be unique per element.`,
        );
      }
      seenPlugins.add(uniqueKey);

      applicable.push({
        pluginKey,
        name,
        value,
        subcommand,
        plugin,
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
      });
    }
  }

  // Sort by priorities (highest = first)
  applicable.sort(
    (a, b) => (b.plugin.priority || 0) - (a.plugin.priority || 0),
  );
  /** {ReactiveState | null} */
  let scopedReactiveState = null;
  // Apply
  for (const { plugin, name, value, subcommand } of applicable) {
    const control = processPlugin(
      plugin,
      reactiveState,
      value,
      node,
      name,
      subcommand,
    );
    consumeAttribute(node, name, value);
    if (!control) continue;
    if (control.halt) {
      emitLifecycle(node, "init", { state: reactiveState });
      return;
    }
    if (control.scopedState) {
      if (!scopedReactiveState) scopedReactiveState = control.scopedState;
      else
        throw new Error(
          `[VLN012] Multiple plugins on the same node cannot create scoped states. Plugin '${plugin.name}' attempted to create a scoped state, but one already exists from a previous plugin.`,
        );
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
  boundState.root = reactiveState;
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
  plugins: {
    registerPlugin,
    processPlugin,
    get: plugins.get.bind(plugins),
    priorities: DefaultPluginPriorities,
  },
  trackers,
  ø__internal: {
    pluginStates,
    boundState,
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
