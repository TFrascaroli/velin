// vln-md="url-to-markdown-file"
// Fetches a markdown file, renders with marked, syntax-highlights code
// fences via VelinSyntax, and slugs h2/h3 for anchor links.
(function () {
  Velin.plugins.registerPlugin({
    name: 'md',
    track: Velin.trackers.expressionTracker,
    render: ({ node, tracked, pluginState = {} }) => {
      if (!tracked) return { halt: true };
      if (pluginState.lastUrl === tracked) return { halt: true, pluginState };

      pluginState.lastUrl = tracked;
      node.innerHTML = '<div class="md-loading">Loading…</div>';

      fetch(tracked)
        .then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))
        .then(md => {
          if (!window.marked) {
            node.innerHTML = '<div class="md-error">marked not loaded</div>';
            return;
          }
          const html = window.marked.parse(md);
          const wrap = document.createElement('div');
          wrap.className = 'md';
          wrap.innerHTML = html;

          wrap.querySelectorAll('pre code').forEach(codeEl => {
            const cls = codeEl.className || '';
            const lang = (cls.match(/language-(\w+)/) || [])[1];
            const src = codeEl.textContent;
            if (lang === 'js' || lang === 'javascript') {
              codeEl.innerHTML = window.VelinSyntax.highlightJS(src);
            } else if (lang === 'html' || lang === 'xml') {
              codeEl.innerHTML = window.VelinSyntax.highlightHTML(src);
            }
          });

          wrap.querySelectorAll('h2, h3').forEach(h => {
            if (h.id) return;
            const slug = h.textContent.toLowerCase()
              .replace(/[^\w\s-]/g, '')
              .trim()
              .replace(/\s+/g, '-');
            if (slug) h.id = slug;
          });

          node.innerHTML = '';
          node.appendChild(wrap);
        })
        .catch(err => {
          node.innerHTML = '<div class="md-error">Failed to load ' + tracked + ': ' + err.message + '</div>';
        });

      return { halt: true, pluginState };
    },
  });
})();
