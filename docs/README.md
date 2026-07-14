# Velin Documentation

Complete documentation for Velin - a lightweight reactive JavaScript library.

## Documentation Structure

Velin's documentation is organized into several key sections:

### Learning Path

**New to Velin?** Start here:
1. [Getting Started](./getting-started.md) - Installation, first app, core concepts
2. [Interactive Examples](../playground/index.html) - See Velin in action
3. [Directives Guide](./directives.md) - Learn all built-in directives

**Building with Velin:**
- [API Reference](./api-reference.md) - Complete API documentation
- [Templates & Fragments](./templates.md) - Advanced composition patterns

**Extending Velin:**
- [Creating Plugins](./plugins.md) - Build custom directives

**Debugging Velin:**
- [Devtools](./devtools.md) - In-page inspector for state, bindings, and updates

### Quick Start by Use Case

#### "I want to build a simple reactive UI"
→ Start with [Getting Started](./getting-started.md), then try the [Form Validation example](../playground/index.html)

#### "I need to understand what each directive does"
→ [Directives Guide](./directives.md) has detailed reference for all `vln-*` attributes

#### "I want to see real working examples"
→ [Interactive Examples](../playground/index.html) - Live demos you can interact with

#### "I need to create a custom directive"
→ [Creating Plugins](./plugins.md) + [API Reference: Advanced APIs](./api-reference.md#advanced-apis)

#### "I'm building a complex app with nested components"
→ [Templates & Fragments](./templates.md) for component composition patterns

#### "I need TypeScript types"
→ [API Reference: TypeScript Support](./api-reference.md#typescript-support) + `dist/types/` directory

#### "I want to understand how Velin works internally"
→ [Getting Started: Reactivity Explained](./getting-started.md#reactivity-explained) + [API Reference: Low-Level APIs](./api-reference.md#low-level-apis)

## Core Concepts

### Reactivity
Velin uses JavaScript Proxy to track property access and update the DOM. Read about it in [Getting Started: Reactive State](./getting-started.md#reactive-state).

### Directives
HTML attributes prefixed with `vln-` that add reactive behavior. See [Directives Guide](./directives.md) for the complete list.

### Plugins
Velin's extension system for creating custom directives. Learn in [Creating Plugins](./plugins.md).

### State Composition
Child states that inherit from parent states with scoped variables. Used by `vln-loop` and `vln-fragment`. See [API Reference: Low-Level APIs](./api-reference.md#low-level-apis).

## File Organization

```
docs/
├── README.md              # This file - documentation hub
├── getting-started.md     # Installation & basics
├── directives.md          # Complete directive reference
├── api-reference.md       # JavaScript API
├── plugins.md             # Creating custom directives
├── templates.md           # Advanced templates
└── devtools.md            # In-page inspector for state and updates

playground/
├── index.html                # Sidebar landing — vln-load fragments
├── examples/                 # Fragment examples (form, crud, tabs, …)
├── benchmarks/               # Virtual table + stress test
├── hello-world.html          # Minimal standalone
├── router.html               # Router & lifecycle
└── directive-inspector.html  # 4-quadrant directive diff view

dist/types/                # TypeScript type definitions
└── velin-core.d.ts
```

## Additional Resources

- **Source Code:** [src/velin-core.js](../src/velin-core.js) - Well-commented core implementation
- **Examples:** [playground/](../playground/) - Interactive demos and test cases
- **Tests:** [test/unit/](../test/unit/) - Full test suite with usage examples

## Contributing to Documentation

Found an issue or want to improve the docs? The documentation is written in Markdown and lives in the `docs/` folder.

## See Also

- [README.md](../README.md) - Project overview and quick introduction
