# Velin FAQ

For a direct feature comparison with Alpine / petite-vue / htmx / Stimulus
/ Vue, see [vs.md](./vs.md).

## Why not Solid, Lit, Svelte runes?

They all need a build step. Velin is for the script-tag case.

## Why not Vue in no-build mode?

Vue's global build works fine via a script tag — it's ~52 KB gzipped
(with the in-browser template compiler) and needs `unsafe-eval` in your
CSP. Velin is smaller and CSP-clean by default; that's the trade-off.

## Why not Stimulus?

Stimulus organizes behavior as controller classes wired to
`data-controller` attributes. Velin organizes state as a plain object and
lets directives express the binding. Different mental model, pick the one
you prefer.

## Does it work with TypeScript?

Yes. The published package ships `.d.ts` alongside each bundle. Templates
are HTML with string-typed directive attributes, so template-level type
checking (à la Volar) isn't a thing — that's the tradeoff for having no
build step. Model objects and plugin code get real types.

## Is it production-ready?

Velin core is in beta (`1.0.0-beta.0`). It's already running
production-shaped workloads in the demos (500k-row virtual table, hash
router, form CRUD). It's beta because I want more real-world usage before
freezing the API — treat it as such.

The devtools package is separately versioned and in alpha.

## Can I use it with a build tool?

Yes. `import Velin from '@velinjs/all'` works in any bundler. "No build
step required" is a floor, not a ceiling.
