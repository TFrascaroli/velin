# Plugin API Design Specification

## Problem
Currently, Velin plugins directly access internal state via `ø__internal` and take raw arguments like `reactiveState` and `node`. This makes the API brittle and forces plugins to be aware of internal implementation details.

## Proposed Recommendation
Introduce a stable `PluginContext` object passed to the plugin `render` function.

### Implementation
1.  **Define Interface:** Create a clear, frozen API surface for plugins.
2.  **Pass Context:** Change `render` signature from positional arguments to a `PluginContext` object.
3.  **Encapsulation:** Hide `ø__internal` from the plugin entirely.

```typescript
// Proposed Plugin API surface
interface PluginContext {
  node: HTMLElement;
  pluginState: any;
  state: any; // Only the proxied state, not the ReactiveState wrapper
  evaluate: (expr: string) => any;
  getSetter: (expr: string) => (val: any) => void;
  emit: (eventName: string, detail: any) => void;
}
```

This ensures the core can change its internal representation of `ReactiveState` without breaking every single plugin in the ecosystem.
