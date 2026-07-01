/**
 * @typedef {import('../src/velin-core').VelinCore} VelinCore
 */
const Velin = /** @type {globalThis & {Velin: VelinCore}} */ (globalThis).Velin;

// ─── Column catalog ───────────────────────────────────────────────────────────
const MONTH_IDS    = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtNum(v) { return v == null ? '—' : v.toLocaleString(); }

const COLUMN_CATALOG = [
  { id: 'name',         label: 'Name',         template: 'cell-name',   flex: '2 1 180px', sortable: true  },
  { id: 'stack',        label: 'Stack',         template: 'cell-badge',  flex: '0 0 110px', sortable: true  },
  { id: 'team',         label: 'Team',          template: 'cell-text',   flex: '0 0 100px', sortable: true  },
  { id: 'plan',         label: 'Plan',          template: 'cell-text',   flex: '0 0 90px',  sortable: true  },
  { id: 'prs',          label: 'PRs',           template: 'cell-num',    flex: '0 0 80px',  sortable: true, format: fmtNum },
  { id: 'reviews',      label: 'Reviews',       template: 'cell-num',    flex: '0 0 80px',  sortable: true, format: fmtNum },
  { id: 'bugs',         label: 'Bugs',          template: 'cell-num',    flex: '0 0 70px',  sortable: true, format: fmtNum },
  { id: 'rating',       label: 'Rating',        template: 'cell-rating', flex: '0 0 110px', sortable: true  },
  { id: 'totalCommits', label: 'Total Commits', template: 'cell-num',   flex: '1 1 120px', sortable: true, format: fmtNum },
  ...MONTH_IDS.map((id, i) => ({
    id, label: MONTH_LABELS[i], template: 'cell-num', flex: '0 0 80px', sortable: true, format: fmtNum,
  })),
  { id: 'actions',      label: '',              template: 'cell-actions', flex: '0 0 80px', sortable: false },
];

const COL_DEFS = {};
COLUMN_CATALOG.forEach(c => { COL_DEFS[c.id] = c; });

// ─── Data generation ──────────────────────────────────────────────────────────
const STACKS = ['TypeScript','Rust','Go','Python','Zig','C++','Elixir','Swift'];
const TEAMS  = ['Platform','Frontend','Backend','Infra','Security','Data','Mobile','DX'];
const PLANS  = ['Free','Pro','Team','Enterprise'];

const FIRST = ['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Hank',
               'Iris','Jake','Kara','Leo','Mia','Nate','Ora','Pete',
               'Quinn','Rosa','Sam','Tara','Uma','Vic','Wren','Zoe'];
const LAST  = ['Adams','Baker','Clark','Davis','Evans','Foster','Garcia','Harris',
               'Ivanov','Jones','Kim','Lee','Miller','Nguyen','Okafor','Patel',
               'Quinn','Reid','Smith','Taylor','Ueda','Vargas','Walsh','Yang'];

function makeRow(i) {
  const first = FIRST[i % FIRST.length];
  const last  = LAST[Math.floor(i / FIRST.length) % LAST.length];

  let totalCommits = 0;
  const months = {};
  for (let m = 0; m < 12; m++) {
    const v = Math.round(((i * 37 + m * 13 + 7) % 400) + 10);
    months[MONTH_IDS[m]] = v;
    totalCommits += v;
  }

  return {
    id: i,
    name:         `${first} ${last}`,
    initials:     first[0] + last[0],
    email:        `${first.toLowerCase()}@${TEAMS[i % TEAMS.length].toLowerCase()}.dev`,
    stack:        STACKS[i % STACKS.length],
    team:         TEAMS[(i * 3) % TEAMS.length],
    plan:         PLANS[Math.floor((i * 7) % PLANS.length)],
    prs:          Math.round((i * 79 + 31) % 500),
    reviews:      Math.round((i * 53 + 17) % 300),
    bugs:         Math.round((i * 31 + 5)  % 120),
    rating:       (i * 7) % 6,
    totalCommits,
    ...months,
    _flash: {},
  };
}

const CHUNK = 5_000;
const MAX_SCROLL_PX = 33_000_000;

async function generateDataAsync(n, onProgress) {
  const rows = new Array(n);
  for (let i = 0; i < n; i += CHUNK) {
    const end = Math.min(i + CHUNK, n);
    for (let j = i; j < end; j++) rows[j] = makeRow(j);
    onProgress(Math.round((end / n) * 100));
    await new Promise(r => setTimeout(r, 0));
  }
  return rows;
}

// ─── Virtual scroll window ────────────────────────────────────────────────────
// Permanent slot pool — never replaced, only mutated in-place.
// Each slot lives at index di % winSize so a 1-row scroll touches exactly 1 slot.
let ringSlots = null;
let currentVisibleRows = []; // row proxies for dribble

function updateWindow(tableData, viewport) {
  const { viewRows, rowHeight } = tableData;
  const total = viewRows.length;

  const totalPx = total * rowHeight;
  const spacerH = Math.min(totalPx, MAX_SCROLL_PX);
  tableData.spacerHeight = spacerH;

  if (!total) {
    ringSlots = null;
    tableData.visibleItems = [];
    currentVisibleRows = [];
    return;
  }

  const viewH      = viewport.clientHeight || 600;
  const screenRows = Math.ceil(viewH / rowHeight);
  const winSize    = Math.min(Math.ceil(screenRows * 1.5), total);
  const useScale   = totalPx > MAX_SCROLL_PX;

  let startIdx;
  if (useScale) {
    const ratio = spacerH > 0 ? viewport.scrollTop / spacerH : 0;
    startIdx = Math.round(ratio * (total - winSize));
  } else {
    const bufferAbove = Math.floor((winSize - screenRows) / 2);
    startIdx = Math.max(0, Math.floor(viewport.scrollTop / rowHeight) - bufferAbove);
  }
  startIdx = Math.min(Math.max(startIdx, 0), Math.max(0, total - winSize));

  const getTop = (di) => useScale
    ? Math.round((di / Math.max(total - 1, 1)) * spacerH)
    : di * rowHeight;

  // (Re)allocate slot pool only when size changes. Pre-populate with real row
  // data BEFORE assigning to tableData.visibleItems — null rows crash templates.
  if (!ringSlots || ringSlots.length !== winSize) {
    ringSlots = [];
    currentVisibleRows = [];
    for (let i = 0; i < winSize; i++) {
      const di  = startIdx + i;
      const row = viewRows[di];
      ringSlots.push({ row, top: getTop(di) });
      currentVisibleRows.push(row);
    }
    tableData.visibleItems = ringSlots;
    return;
  }

  // Mutate slots in-place. slot index = di % winSize, so each row always lands
  // in the same slot regardless of scroll position. Velin's old !== value check
  // in the proxy set trap means untouched slots emit no reactive effects.
  const reactiveSlots = tableData.visibleItems;
  currentVisibleRows = [];

  for (let i = 0; i < winSize; i++) {
    const di     = startIdx + i;
    const newRow = viewRows[di];
    const newTop = getTop(di);
    const slot = reactiveSlots[di % winSize];
    if (slot.row !== newRow) slot.row = newRow;
    if (slot.top !== newTop) slot.top = newTop;
    currentVisibleRows.push(newRow);
  }
}

// ─── View pipeline (pure) ─────────────────────────────────────────────────────
// The reactive chain (rows|filter|sortCol|sortDir → viewRows → updateWindow)
// is declared in the HTML via vln-watch. These functions are pure transforms;
// no callsite here calls them directly.
const FILTER_FIELDS = ['name', 'stack', 'team', 'plan'];

function computeView(rows, filterText, sortCol, sortDir) {
  const q = (filterText || '').toLowerCase().trim();
  let view;
  if (q) {
    view = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      for (let f = 0; f < FILTER_FIELDS.length; f++) {
        const v = r[FILTER_FIELDS[f]];
        if (typeof v === 'string' && v.toLowerCase().indexOf(q) !== -1) {
          view.push(r);
          break;
        }
      }
    }
  } else {
    view = rows.slice();
  }
  if (sortCol) {
    const dir = sortDir === 'asc' ? 1 : -1;
    view.sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return ((av ?? 0) - (bv ?? 0)) * dir;
    });
  }
  return view;
}

// ─── Dribble ──────────────────────────────────────────────────────────────────
const DRIBBLE_COLS      = ['prs', 'reviews', 'bugs', 'totalCommits', ...MONTH_IDS];
const DRIBBLE_PER_TICK  = 20;
const DRIBBLE_FLASH_MS  = 400;
let dribbleTimer = null;

function dribbleTick() {
  const rows = currentVisibleRows;
  if (!rows.length) return;

  Velin.batch(() => {
    for (let i = 0; i < DRIBBLE_PER_TICK; i++) {
      const row  = rows[Math.floor(Math.random() * rows.length)];
      const col  = DRIBBLE_COLS[Math.floor(Math.random() * DRIBBLE_COLS.length)];
      const old  = row[col];
      const delta = Math.round((Math.random() - 0.45) * 30);
      row[col] = Math.max(0, old + delta);
      row._flash[col] = row[col] > old ? 'up' : 'down';
      const r = row, c = col;
      setTimeout(() => { r._flash[c] = ''; }, DRIBBLE_FLASH_MS);
    }
  });
}

// ─── vln-table plugin ─────────────────────────────────────────────────────────
Velin.plugins.registerPlugin({
  name: 'table',
  track: ({ compiledExpression, evaluateAst }) => evaluateAst(compiledExpression),
  render: ({ expr, getSetter }) => {
    getSetter(expr + '.columnDefs')(COL_DEFS);
  },
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function injectTemplate(url) {
  const html = await fetch(url).then(r => r.text());
  const tpl  = document.createElement('template');
  tpl.innerHTML = html;
  document.body.appendChild(tpl.content);
}

(async () => {
  await injectTemplate('efficient-table.tpl.html');

  let state;
  let viewport;

  viewport = document.querySelector('.vt-viewport');

  state = Velin.bind(document.body, {
    myTable: {
      rows:          [],
      viewRows:      [],
      filterText:    '',
      rowHeight:     56,
      spacerHeight:  0,
      columnDefs:    COL_DEFS,
      columns:       ['name', 'stack', 'team', 'prs', 'reviews', 'bugs', 'rating', 'jan', 'actions'],
      visibleItems:  [],
      allColumnDefs: COLUMN_CATALOG,
      sortCol:       null,
      sortDir:       'asc',
      // Reactive chain (wired in HTML via vln-watch):
      //   [rows, filterText, sortCol, sortDir] → rebuildview → viewRows
      //   viewRows                             → refreshwindow → visibleItems
      rebuildview([rows, filterText, sortCol, sortDir]) {
        const view = computeView(rows, filterText, sortCol, sortDir);
        // Row identities in viewRows change → pool must repopulate from scratch.
        ringSlots = null;
        state.myTable.viewRows = view;
      },
      refreshwindow() {
        if (viewport) updateWindow(state.myTable, viewport);
      },
      actions: {
        deleteRow(row) {
          const t0 = performance.now();
          state.myTable.rows = state.myTable.rows.filter(r => r !== row);
          state.perf.editMs = (performance.now() - t0).toFixed(2) + ' ms';
        },
        inspectRow(row) {
          // Collect raw data (avoid proxy JSON issues with _flash)
          const data = {};
          for (const k of Object.keys(row)) {
            if (k === '_flash') continue;
            data[k] = row[k];
          }
          state.inspect.data = JSON.stringify(data, null, 2);
          state.inspect.open = true;
        },
      },
    },

    modal: { visible: false, progress: 0, label: '' },
    inspect: { open: false, data: '' },

    perf: { setMs: '—', editMs: '—', fps: '—' },

    rowCountInput: 10_000,
    dribbling: false,

    isColumnActive(colId) {
      return this.myTable.columns.includes(colId);
    },

    toggleColumn(colId) {
      const active = state.myTable.columns;
      if (active.includes(colId)) {
        if (active.length <= 1) return;
        state.myTable.columns = active.filter(c => c !== colId);
      } else {
        state.myTable.columns = COLUMN_CATALOG
          .map(d => d.id)
          .filter(id => id === colId || active.includes(id));
      }
    },

    sortBy(colId) {
      const def = COL_DEFS[colId];
      if (!def || !def.sortable) return;
      const t = state.myTable;
      Velin.batch(() => {
        if (t.sortCol === colId) {
          t.sortDir = t.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          t.sortCol = colId;
          t.sortDir = 'asc';
        }
      });
    },

    toggleDribble() {
      state.dribbling = !state.dribbling;
      if (state.dribbling) {
        dribbleTimer = setInterval(dribbleTick, 100);
      } else {
        clearInterval(dribbleTimer);
        dribbleTimer = null;
      }
    },

    generate(n) {
      state.rowCountInput = n;
      return state.doGenerate();
    },

    async doGenerate() {
      const n = +state.rowCountInput;
      if (!n || n < 1) return;

      // Stop dribble if running
      if (state.dribbling) state.toggleDribble();

      state.modal.label    = n.toLocaleString() + ' rows';
      state.modal.progress = 0;
      state.modal.visible  = true;

      const t0   = performance.now();
      const rows = await generateDataAsync(n, p => { state.modal.progress = p; });

      state.myTable.rows = rows; // reactive chain: rebuildview → refreshwindow

      state.perf.setMs    = (performance.now() - t0).toFixed(0) + ' ms';
      state.modal.visible = false;
    },

    closeInspect() { state.inspect.open = false; },
  });

  let rafPending = false;
  viewport.addEventListener('scroll', () => {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        Velin.batch(() => updateWindow(state.myTable, viewport));
      });
    }
  }, { passive: true });

  // FPS counter
  let lastT  = performance.now();
  let frames = 0;
  (function tick() {
    frames++;
    const now = performance.now();
    if (now - lastT >= 1000) {
      state.perf.fps = Math.round(frames / ((now - lastT) / 1000)) + ' fps';
      frames = 0;
      lastT  = now;
    }
    requestAnimationFrame(tick);
  })();

  state.doGenerate();
})();
