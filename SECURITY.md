# Security

Velin ships its own AST evaluator instead of `eval` / `new Function()`, so it
works under strict CSP (`script-src 'self'`). Its threat model assumes the
page it runs on isn't already hostile.

## Reporting

If you think you've found a security issue, please report it privately via
[GitHub security advisories](https://github.com/TFrascaroli/velin/security/advisories/new)
rather than a public issue. I'll take a look within a few days and prioritize
it over other work.
