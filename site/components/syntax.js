// Tiny syntax highlighter — JS + HTML. Regex tokenizer, no AST.
// Output: HTML with <span class="tok-*"> wrappers.
// Class names match those in styles.css.
(function () {
  const JS_KEYWORDS = new Set([
    'var', 'let', 'const', 'function', 'return', 'if', 'else', 'for', 'while',
    'do', 'switch', 'case', 'break', 'continue', 'default', 'new', 'delete',
    'typeof', 'instanceof', 'void', 'throw', 'try', 'catch', 'finally',
    'class', 'extends', 'super', 'this', 'import', 'export', 'from', 'as',
    'async', 'await', 'yield', 'of', 'in',
  ]);
  const JS_LITERALS = new Set(['true', 'false', 'null', 'undefined']);

  function escape(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function highlightJS(src) {
    let out = '';
    let i = 0;
    while (i < src.length) {
      const rest = src.slice(i);
      let m;

      if ((m = rest.match(/^\/\/[^\n]*/))) {
        out += `<span class="tok-comment">${escape(m[0])}</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^\/\*[\s\S]*?\*\//))) {
        out += `<span class="tok-comment">${escape(m[0])}</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^"(?:\\.|[^"\\\n])*"/))) {
        out += `<span class="tok-string">${escape(m[0])}</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^'(?:\\.|[^'\\\n])*'/))) {
        out += `<span class="tok-string">${escape(m[0])}</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^`(?:\\.|\$\{[^}]*\}|[^`\\])*`/))) {
        out += `<span class="tok-string">${escape(m[0])}</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^\d+(?:\.\d+)?(?:e[+-]?\d+)?/i))) {
        out += `<span class="tok-number">${escape(m[0])}</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^[a-zA-Z_$][\w$]*/))) {
        const cls = JS_KEYWORDS.has(m[0])
          ? 'tok-keyword'
          : JS_LITERALS.has(m[0])
            ? 'tok-literal'
            : 'tok-ident';
        out += `<span class="${cls}">${escape(m[0])}</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^\s+/))) {
        out += m[0];
        i += m[0].length; continue;
      }
      out += `<span class="tok-punct">${escape(src[i])}</span>`;
      i++;
    }
    return out;
  }

  function highlightHTML(src) {
    let out = '';
    let i = 0;
    while (i < src.length) {
      const rest = src.slice(i);
      let m;

      if ((m = rest.match(/^<!--[\s\S]*?-->/))) {
        out += `<span class="tok-comment">${escape(m[0])}</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^<!DOCTYPE[^>]*>/i))) {
        out += `<span class="tok-comment">${escape(m[0])}</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^<script\b([^>]*)>([\s\S]*?)<\/script>/i))) {
        out += renderTag('script', m[1], false);
        out += highlightJS(m[2]);
        out += `<span class="tok-punct">&lt;/</span><span class="tok-tag">script</span><span class="tok-punct">&gt;</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^<style\b([^>]*)>([\s\S]*?)<\/style>/i))) {
        out += renderTag('style', m[1], false);
        out += escape(m[2]);
        out += `<span class="tok-punct">&lt;/</span><span class="tok-tag">style</span><span class="tok-punct">&gt;</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^<\/([a-zA-Z][\w-]*)\s*>/))) {
        out += `<span class="tok-punct">&lt;/</span><span class="tok-tag">${escape(m[1])}</span><span class="tok-punct">&gt;</span>`;
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^<([a-zA-Z][\w-]*)([^>]*)>/))) {
        out += renderTag(m[1], m[2], m[0].endsWith('/>'));
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^[^<]+/))) {
        out += escape(m[0]);
        i += m[0].length; continue;
      }
      out += escape(src[i]);
      i++;
    }
    return out;
  }

  function renderTag(name, attrsRaw, selfClose) {
    let inner = `<span class="tok-punct">&lt;</span><span class="tok-tag">${escape(name)}</span>`;
    let ai = 0;
    while (ai < attrsRaw.length) {
      const r = attrsRaw.slice(ai);
      let am;
      if ((am = r.match(/^\s+/))) { inner += am[0]; ai += am[0].length; continue; }
      if ((am = r.match(/^([a-zA-Z_@:][\w:.\-]*)(?:\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s>]+))?/))) {
        inner += `<span class="tok-attr">${escape(am[1])}</span>`;
        if (am[2]) {
          inner += `<span class="tok-punct">=</span>`;
          inner += `<span class="tok-string">${escape(am[2])}</span>`;
        }
        ai += am[0].length;
        continue;
      }
      if ((am = r.match(/^\/$/))) { inner += `<span class="tok-punct">/</span>`; ai += 1; continue; }
      inner += escape(attrsRaw[ai]);
      ai++;
    }
    inner += `<span class="tok-punct">${selfClose ? ' /&gt;' : '&gt;'}</span>`;
    return inner;
  }

  window.VelinSyntax = { highlightJS, highlightHTML, escape };
})();
