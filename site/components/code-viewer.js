// vln-code-viewer="[{name, url, lang}, ...]"
// Renders a tabbed, read-only code viewer with syntax highlighting and copy button.
(function () {
  Velin.plugins.registerPlugin({
    name: 'code-viewer',
    track: Velin.trackers.expressionTracker,
    render: ({ node, tracked, pluginState = {} }) => {
      if (!tracked || !tracked.length) return { halt: true };
      if (pluginState.lastFilesKey === keyOf(tracked)) return { halt: true, pluginState };

      pluginState.lastFilesKey = keyOf(tracked);
      node.innerHTML = '';
      const wrapper = build(tracked);
      node.appendChild(wrapper);
      return { halt: true, pluginState };
    },
  });

  function keyOf(files) {
    return files.map(f => f.url).join('|');
  }

  function build(files) {
    const wrapper = document.createElement('div');
    wrapper.className = 'code-viewer';

    const bar = document.createElement('div');
    bar.className = 'code-viewer-bar';
    const tabs = document.createElement('div');
    tabs.className = 'code-viewer-tabs';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-copy';
    copyBtn.textContent = 'Copy';
    bar.appendChild(tabs);
    bar.appendChild(copyBtn);

    const panels = document.createElement('div');
    panels.className = 'code-viewer-panels';

    files.forEach((f, idx) => {
      const btn = document.createElement('button');
      btn.className = 'code-tab' + (idx === 0 ? ' active' : '');
      btn.type = 'button';
      btn.textContent = f.name;
      btn.addEventListener('click', () => activate(idx));
      tabs.appendChild(btn);

      const panel = document.createElement('div');
      panel.className = 'code-panel' + (idx === 0 ? ' active' : '');
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = 'Loading…';
      pre.appendChild(code);
      panel.appendChild(pre);
      panels.appendChild(panel);

      fetch(f.url)
        .then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))
        .then(src => {
          const highlight = f.lang === 'js'
            ? window.VelinSyntax.highlightJS
            : window.VelinSyntax.highlightHTML;
          code.innerHTML = highlight(src);
          code.dataset.raw = src;
        })
        .catch(err => {
          code.textContent = 'Failed to load ' + f.url + ': ' + err.message;
        });
    });

    copyBtn.addEventListener('click', () => {
      const activeCode = panels.querySelector('.code-panel.active code');
      if (!activeCode) return;
      const text = activeCode.dataset.raw || activeCode.textContent;
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
      });
    });

    function activate(i) {
      tabs.querySelectorAll('.code-tab').forEach((el, idx) => {
        el.classList.toggle('active', idx === i);
      });
      panels.querySelectorAll('.code-panel').forEach((el, idx) => {
        el.classList.toggle('active', idx === i);
      });
    }

    wrapper.appendChild(bar);
    wrapper.appendChild(panels);
    return wrapper;
  }
})();
