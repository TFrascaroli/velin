// vln-md="url-to-markdown-file"
// Fetches a markdown file, renders with marked, syntax-highlights code
// fences via VelinSyntax, and slugs h2/h3 for anchor links.
(function () {
  // Rewrite <a href> inside rendered markdown. The doc renders inside a SPA
  // served at /velin/, so browser resolution of relative hrefs is wrong for
  // both sibling docs (would 404 at /velin/sibling.md) and repo-only paths
  // (../src, ../README.md — not deployed at all). We resolve against the
  // doc's own repo path and route accordingly.
  function rewriteLinks(wrap, docUrl) {
    const site = window.VELIN_SITE || { docIds: [], repoBlobBase: '', repoTreeBase: '' };
    const docIds = new Set(site.docIds);
    // Fake origin so URL() gives us a clean pathname to inspect.
    const base = new URL(docUrl, 'http://x/');

    wrap.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      if (href.startsWith('#')) return;
      if (/^[a-z]+:/i.test(href)) {
        if (/^https?:/i.test(href)) {
          a.target = '_blank';
          a.rel = 'noopener';
        }
        return;
      }

      const u = new URL(href, base);
      if (u.origin !== 'http://x') return;
      const repoPath = u.pathname.replace(/^\//, '');

      const docMatch = repoPath.match(/^docs\/([^/]+)\.md$/);
      if (docMatch && docIds.has(docMatch[1])) {
        a.setAttribute('href', '#/docs/' + docMatch[1]);
        a.removeAttribute('target');
        a.removeAttribute('rel');
        return;
      }
      if (repoPath === 'playground/index.html') {
        a.setAttribute('href', '#/examples');
        a.removeAttribute('target');
        a.removeAttribute('rel');
        return;
      }

      const isDir = repoPath.endsWith('/');
      const ghBase = isDir ? site.repoTreeBase : site.repoBlobBase;
      a.setAttribute('href', ghBase + repoPath + u.hash);
      a.target = '_blank';
      a.rel = 'noopener';
    });
  }

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

          rewriteLinks(wrap, tracked);

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
