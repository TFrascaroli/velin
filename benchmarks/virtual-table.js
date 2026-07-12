/**
 * @typedef {import('../../src/velin-core').VelinCore} VelinCore
 */
const Velin = /** @type {globalThis & {Velin: VelinCore}} */ (globalThis).Velin;

// ─── Column catalog ───────────────────────────────────────────────────────────
function fmtNum(v) { return v == null ? '—' : v.toLocaleString(); }
function fmtPct(v) { return v == null ? '—' : Math.round(v) + '%'; }

// Deterministic PRNG (mulberry32) — seeded per row so calls within a row
// decorrelate (fixes "all Security team are Free plan" from the old i*K%N).
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLUMN_CATALOG = [
  { id: 'sel',      label: '',         template: 'cell-select',   flex: '0 0 32px',  sortable: false },
  { id: 'name',     label: 'Name',     template: 'cell-name',     flex: '2 1 200px', sortable: true  },
  { id: 'stack',    label: 'Stack',    template: 'cell-badge',    flex: '0 0 110px', sortable: true  },
  { id: 'team',     label: 'Team',     template: 'cell-text',     flex: '0 0 100px', sortable: true  },
  { id: 'pulse',    label: 'Live',     template: 'cell-pulse',    flex: '0 0 70px',  sortable: false },
  { id: 'activity', label: 'Activity', template: 'cell-sparkline',flex: '1 1 140px', sortable: false },
  { id: 'trend',    label: 'Trend',    template: 'cell-trend',    flex: '0 0 100px', sortable: true  },
  { id: 'load',     label: 'Load',     template: 'cell-heat',     flex: '0 0 90px',  sortable: true  },
  { id: 'sprint',   label: 'Sprint',   template: 'cell-progress', flex: '1 1 130px', sortable: true  },
  { id: 'streak',   label: 'Streak',   template: 'cell-streak',   flex: '0 0 100px', sortable: true  },
  { id: 'plan',     label: 'Plan',     template: 'cell-text',     flex: '0 0 90px',  sortable: true  },
  { id: 'prs',      label: 'PRs',      template: 'cell-num',      flex: '0 0 80px',  sortable: true, format: fmtNum },
  { id: 'reviews',  label: 'Reviews',  template: 'cell-num',      flex: '0 0 80px',  sortable: true, format: fmtNum },
  { id: 'rating',   label: 'Rating',   template: 'cell-rating',   flex: '0 0 110px', sortable: true  },
  { id: 'actions',  label: '',         template: 'cell-actions',  flex: '0 0 80px',  sortable: false },
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
  const rand = mulberry32(i + 1);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const first = pick(FIRST);
  const last  = pick(LAST);
  const team  = pick(TEAMS);

  const months = new Array(12);
  for (let m = 0; m < 12; m++) months[m] = 20 + Math.floor(rand() * 380);

  return {
    id: i,
    name:     `${first} ${last}`,
    initials: first[0] + last[0],
    email:    `${first.toLowerCase()}@${team.toLowerCase()}.dev`,
    stack:    pick(STACKS),
    team,
    plan:     pick(PLANS),
    prs:      Math.floor(rand() * 500),
    reviews:  Math.floor(rand() * 300),
    rating:   Math.floor(rand() * 6),

    // Flashy fields — all mutated by dribble / pulse ticker
    months,                                     // → cell-sparkline
    load:     Math.floor(rand() * 100),         // → cell-heat (0–100)
    sprintPct: Math.floor(rand() * 100),        // → cell-progress (0–100)
    trendPct: Math.round((rand() - 0.5) * 60),  // → cell-trend (-30..+30)
    streak:   Math.floor(rand() * 6),           // → cell-streak (0–15)
    pulse:    1,                                // → cell-pulse scale (ticker-driven)
    selected: false,                            // → cell-select
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
// All inputs come from reactive state (viewRows, rowHeight, scrollTop,
// viewportHeight). The scroll/resize listeners are one-line bridges that only
// write those state properties; this function is invoked by a vln-watch, so
// the reactive-chain panel is telling the truth.
let ringSlots = null;

function updateWindow(tableData) {
  const { viewRows, rowHeight, scrollTop, viewportHeight } = tableData;
  const total = viewRows.length;

  const totalPx = total * rowHeight;
  const spacerH = Math.min(totalPx, MAX_SCROLL_PX);
  tableData.spacerHeight = spacerH;

  if (!total) {
    ringSlots = null;
    tableData.visibleItems = [];
    return;
  }

  const viewH      = viewportHeight || 600;
  const screenRows = Math.ceil(viewH / rowHeight);
  const winSize    = Math.min(Math.ceil(screenRows * 1.5), total);
  const useScale   = totalPx > MAX_SCROLL_PX;

  let startIdx;
  if (useScale) {
    const ratio = spacerH > 0 ? scrollTop / spacerH : 0;
    startIdx = Math.round(ratio * (total - winSize));
  } else {
    const bufferAbove = Math.floor((winSize - screenRows) / 2);
    startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - bufferAbove);
  }
  startIdx = Math.min(Math.max(startIdx, 0), Math.max(0, total - winSize));

  const getTop = (di) => useScale
    ? Math.round((di / Math.max(total - 1, 1)) * spacerH)
    : di * rowHeight;

  if (!ringSlots || ringSlots.length !== winSize) {
    ringSlots = [];
    for (let i = 0; i < winSize; i++) {
      const di  = startIdx + i;
      const row = viewRows[di];
      ringSlots.push({ row, top: getTop(di) });
    }
    tableData.visibleItems = ringSlots;
    return;
  }

  const reactiveSlots = tableData.visibleItems;

  for (let i = 0; i < winSize; i++) {
    const di     = startIdx + i;
    const newRow = viewRows[di];
    const newTop = getTop(di);
    const slot = reactiveSlots[di % winSize];
    if (slot.row !== newRow) slot.row = newRow;
    if (slot.top !== newTop) slot.top = newTop;
  }
}

// ─── View pipeline (pure) ─────────────────────────────────────────────────────
const FILTER_FIELDS = ['name', 'stack', 'team', 'plan'];

function computeView(rows, filterText, sortCol, sortDir) {
  const words = (filterText || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  let view;
  if (words.length) {
    view = [];
    outer: for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      for (let w = 0; w < words.length; w++) {
        const word = words[w];
        let matched = false;
        for (let f = 0; f < FILTER_FIELDS.length; f++) {
          const v = r[FILTER_FIELDS[f]];
          if (typeof v === 'string' && v.toLowerCase().indexOf(word) !== -1) {
            matched = true;
            break;
          }
        }
        if (!matched) continue outer;
      }
      view.push(r);
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

// ─── Filter debounce ──────────────────────────────────────────────────────────
const FILTER_DEBOUNCE_MS = 200;
let filterDebounceTimer = null;

// ─── Dribble ──────────────────────────────────────────────────────────────────
// Each tick mutates a handful of visible rows across several "flashy" fields.
// Every write flows through Velin's reactive core → the bound cell re-renders,
// and CSS `transition` on the target property produces the visible motion.
// No @keyframes anywhere; nothing moves without a data write behind it.
// Two-tier dribble: heavy fraction hits visible rows every tick so the user
// SEES motion, lighter fraction hits random rows across the full dataset so
// scrolling anywhere reveals fresh data. Ratio tuned so a 500K set still
// feels alive without burning too many cycles.
const DRIBBLE_VISIBLE_FRAC = 0.6; // fraction of visible rows mutated per tick
const DRIBBLE_BG_COUNT     = 200; // random full-set mutations per tick
let dribbleTimer = null;
let pulseRafId   = null;
let state        = null; // set by the bootstrap IIFE below
let ctrl         = null; // Velin scheduler control; set alongside `state`

// Reactive-op counter: incremented on every proxy write we control (dribble
// mutateRow calls + pulse ticker row.pulse writes). FPS ticker resets it each
// second and publishes to state.perf.ops so the perf panel can display it.
let writeCount = 0;

function bump(v, min, max, step) {
  const nv = v + (Math.random() - 0.5) * step * 2;
  return Math.max(min, Math.min(max, nv));
}

function mutateRow(row) {
  const which = Math.floor(Math.random() * 5);
  writeCount++;
  switch (which) {
    case 0: row.load      = Math.round(bump(row.load,      0, 100, 18)); break;
    case 1: row.sprintPct = Math.round(bump(row.sprintPct, 0, 100, 12)); break;
    case 2: row.trendPct  = Math.round(bump(row.trendPct, -35, 35, 12)); break;
    case 3: {
      // Replace months array so the sparkline template's `row.months` read
      // fires reactively regardless of per-index proxy behavior.
      const m = Math.floor(Math.random() * 12);
      const next = row.months.slice();
      next[m] = Math.max(0, Math.round(bump(next[m], 0, 500, 80)));
      row.months = next;
      break;
    }
    case 4: {
      const d = Math.random() < 0.5 ? -1 : 1;
      row.streak = Math.max(0, Math.min(15, row.streak + d));
      break;
    }
  }
}

function dribbleTick() {
  const allRows = state && state.myTable && state.myTable.rows;
  const slots   = state && state.myTable && state.myTable.visibleItems;
  if (!allRows || !allRows.length) return;

  ctrl.batch(() => {
    // Foreground: many visible rows every tick → obvious on-screen motion.
    const visN = Math.ceil((slots ? slots.length : 0) * DRIBBLE_VISIBLE_FRAC);
    for (let i = 0; i < visN; i++) {
      const slot = slots[Math.floor(Math.random() * slots.length)];
      if (slot && slot.row) mutateRow(slot.row);
    }
    // Background: random full-set touches → scrolled areas stay fresh.
    for (let i = 0; i < DRIBBLE_BG_COUNT; i++) {
      const row = allRows[Math.floor(Math.random() * allRows.length)];
      if (row) mutateRow(row);
    }
  });
}

// Pulse ticker: writes row.pulse each frame for every visible row. The dot's
// transform is bound to row.pulse via vln-attr:style, so this is pure reactive
// churn producing visible motion — no CSS animation involved. Also a nice
// stress-test signal: ~60 rows × 60 fps = ~3600 reactive writes/sec.
function pulseTick() {
  pulseRafId = requestAnimationFrame(pulseTick);
  const slots = state && state.myTable && state.myTable.visibleItems;
  if (!slots || !slots.length) return;
  const t = performance.now() / 1000;
  ctrl.batch(() => {
    for (let i = 0; i < slots.length; i++) {
      const row = slots[i] && slots[i].row;
      if (!row) continue;
      row.pulse = 0.75 + (Math.sin(t * 2 + row.id * 0.37) + 1) * 0.25; // 0.75..1.25
      writeCount++;
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
  await injectTemplate('virtual-table.tpl.html');

  const viewport = document.querySelector('.vt-viewport');

  state = Velin.bind(document.body, {
    myTable: {
      rows:          [],
      viewRows:      [],
      filterRaw:     '',
      filterText:    '',
      rowHeight:     56,
      spacerHeight:  0,
      // Reactive mirrors of the viewport's scroll position and height. The
      // scroll listener + ResizeObserver below are one-line bridges that write
      // these; refreshwindow watches them and derives visibleItems.
      scrollTop:     0,
      viewportHeight: 0,
      columnDefs:    COL_DEFS,
      columns:       ['sel', 'name', 'stack', 'team', 'pulse', 'activity', 'trend', 'load', 'sprint', 'streak', 'actions'],
      // Object mirror of `columns` used exclusively by the keyed vln-loop
      // in the header + cell renderers. Kept in sync by `oncolschange` below.
      // Rebuilt on every columns change but the *key* (colId) is stable, so
      // the keyed diff reuses substates and just moves DOM.
      activeCols:    [],
      visibleItems:  [],
      allColumnDefs: COLUMN_CATALOG,
      sortCol:       null,
      sortDir:       'asc',
      selectedCount: 0,
      actions: {
        deleteRow(row) {
          const t0 = performance.now();
          if (row.selected) state.myTable.selectedCount--;
          state.myTable.rows = state.myTable.rows.filter(r => r !== row);
          state.perf.editMs = (performance.now() - t0).toFixed(2) + ' ms';
        },
        inspectRow(row) {
          const data = {};
          for (const k of Object.keys(row)) {
            if (k === 'pulse') continue; // ticker-driven noise
            data[k] = row[k];
          }
          state.inspect.data = JSON.stringify(data, null, 2);
          state.inspect.open = true;
        },
        toggleRow(row, checked) {
          if (row.selected === checked) return;
          row.selected = checked;
          state.myTable.selectedCount += checked ? 1 : -1;
        },
        deleteSelected() {
          const t0 = performance.now();
          state.myTable.rows = state.myTable.rows.filter(r => !r.selected);
          state.myTable.selectedCount = 0;
          state.perf.editMs = (performance.now() - t0).toFixed(2) + ' ms';
        },
        // Uses ctrl.batch() so N per-row writes coalesce into a single
        // downstream flush — the visible reason batch() exists.
        clearSelection() {
          ctrl.batch(() => {
            const rows = state.myTable.rows;
            for (let i = 0; i < rows.length; i++) {
              if (rows[i].selected) rows[i].selected = false;
            }
          });
          state.myTable.selectedCount = 0;
        },
      },
    },

    modal: { visible: false, progress: 0, label: '' },
    inspect: { open: false, data: '' },

    // Hover popover: reflects the actual <template id="…"> HTML of whichever
    // cell the mouse is over. Nothing to fetch — read straight from the DOM.
    preview: { visible: false, title: '', source: '', x: 0, y: 0 },

    // Column drag-and-drop state. drop() only mutates myTable.columns; the
    // header and cell loops both read that array so the reorder cascades
    // through the DOM without a single manual node touch.
    drag: { col: null, over: null },

    // Router state — populated by vln-router; used to reflect filter+sort
    // +density into location.hash and vice-versa.
    route: { path: '/', params: {}, query: {} },
    routerReady: false,

    perf: { setMs: '—', editMs: '—', fps: '—', ops: '—' },

    // Reactive-chain telemetry — each vln-watch handler bumps its cell.
    // Turns the plumbing (which used to be `<div hidden>`) into a visible
    // demonstration of "what fires when."
    chain: {
      onfilterraw:   { hits: 0, ms: '0.00' },
      rebuildview:   { hits: 0, ms: '0.00' },
      refreshwindow: { hits: 0, ms: '0.00' },
    },

    rowCountInput: 10_000,
    dribbling: false,

    // Cell helpers — pure derivations from row data. Templates call these so
    // the sparkline / heat / trend cells stay declarative.
    // NOTE: no `this.` inside these methods — Velin's evaluator doesn't bind
    // `this` to the helpers object, which triggers infinite recursion.
    helpers: {
      // 12 (v, index) pairs → SVG polyline points inside viewBox 0 0 110 24
      sparkPoints(months) {
        let s = '';
        for (let i = 0; i < 12; i++) {
          const v = months[i];
          const y = 22 - Math.min(v, 500) / 500 * 20;
          s += (i ? ' ' : '') + (i * 10) + ',' + y.toFixed(1);
        }
        return s;
      },
      // 0..100 load → green(120°) → red(0°) via hue interp
      heatBg(load) {
        const h = 120 - Math.min(Math.max(load, 0), 100) * 1.2;
        return 'hsl(' + h.toFixed(0) + ' 65% 42% / 0.85)';
      },
      trendStyle(pct) {
        const clamped = Math.max(-30, Math.min(30, pct));
        const rot = clamped * 1.5; // ±45°
        const hue = clamped >= 0 ? 140 : 0;
        return 'transform: rotate(' + rot.toFixed(0) + 'deg); color: hsl(' + hue + ' 70% 55%);';
      },
      trendLabel(pct) {
        const sign = pct > 0 ? '+' : '';
        return sign + pct + '%';
      },
      statusColor(load) {
        if (load < 20) return '#64748b';  // idle — slate
        if (load < 55) return '#22c55e';  // active — green
        if (load < 85) return '#f59e0b';  // busy — amber
        return '#ef4444';                 // hot — red
      },
      statusLabel(load) {
        if (load < 20) return 'idle';
        if (load < 55) return 'active';
        if (load < 85) return 'busy';
        return 'hot';
      },
      pulseClass(load) {
        if (load < 20) return 'pulse-idle';
        if (load < 55) return 'pulse-active';
        if (load < 85) return 'pulse-busy';
        return 'pulse-hot';
      },
      fires(n) {
        const capped = Math.min(n, 5);
        return '🔥'.repeat(capped) + (n > 5 ? '+' : '');
      },
    },

    // Derive the keyed loop's input from the source-of-truth columns array.
    // A single reactive write here fans out through the keyed loops.
    oncolschange(cols) {
      if (!state) return;
      state.myTable.activeCols = cols.map(id => ({ colId: id }));
    },

    onfilterraw(raw) {
      const t0 = performance.now();
      clearTimeout(filterDebounceTimer);
      filterDebounceTimer = setTimeout(() => {
        if (state) state.myTable.filterText = raw;
      }, FILTER_DEBOUNCE_MS);
      const c = state && state.chain.onfilterraw;
      if (c) { c.hits++; c.ms = (performance.now() - t0).toFixed(2); }
    },
    rebuildview([rows, filterText, sortCol, sortDir]) {
      if (!state) return;
      const t0 = performance.now();
      const view = computeView(rows, filterText, sortCol, sortDir);
      ringSlots = null;
      state.myTable.viewRows = view;
      const c = state.chain.rebuildview;
      c.hits++; c.ms = (performance.now() - t0).toFixed(2);
    },
    refreshwindow() {
      if (!state) return;
      const t0 = performance.now();
      updateWindow(state.myTable);
      const c = state.chain.refreshwindow;
      c.hits++; c.ms = (performance.now() - t0).toFixed(2);
    },
    // Timer lifecycle reacts to state.dribbling — callers just flip the flag,
    // they don't need to know a timer exists.
    ondribbling(on) {
      if (on) {
        if (!dribbleTimer) dribbleTimer = setInterval(dribbleTick, 80);
        if (!pulseRafId)   pulseTick(); // schedules its own rAF
      } else {
        if (dribbleTimer) { clearInterval(dribbleTimer); dribbleTimer = null; }
        if (pulseRafId)   { cancelAnimationFrame(pulseRafId); pulseRafId = null; }
      }
    },

    get sortarrow() {
      const t = this.myTable;
      const sortCol = t.sortCol;
      const sortDir = t.sortDir;
      const arrow = sortDir === 'asc' ? ' ↑' : ' ↓';
      return (col) => sortCol === col ? arrow : '';
    },
    get sorttitle() {
      const t = this.myTable;
      const sortCol = t.sortCol;
      const sortDir = t.sortDir;
      const defs = t.columnDefs;
      return (col) => {
        const def = defs[col];
        if (!def || !def.sortable) return '';
        const label = def.label || col;
        if (sortCol !== col)     return 'Sort ' + label + ' ascending';
        if (sortDir === 'asc')   return 'Sort ' + label + ' descending';
        return 'Remove sort';
      };
    },
    get headerclass() {
      const t = this.myTable;
      const sortCol = t.sortCol;
      const defs = t.columnDefs;
      return (col) => {
        const parts = ['vt-hcell'];
        if (defs[col] && defs[col].sortable) parts.push('vt-hcell-sortable');
        if (sortCol === col) parts.push('vt-hcell-sorted');
        return parts.join(' ');
      };
    },

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
      ctrl.batch(() => {
        if (t.sortCol !== colId) {
          t.sortCol = colId;
          t.sortDir = 'asc';
        } else if (t.sortDir === 'asc') {
          t.sortDir = 'desc';
        } else {
          t.sortCol = null;
          t.sortDir = 'asc';
        }
      });
    },

    generate(n) {
      state.rowCountInput = n;
      return state.doGenerate();
    },

    async doGenerate() {
      const n = +state.rowCountInput;
      if (!n || n < 1) return;

      if (state.dribbling) state.dribbling = false;

      state.modal.label    = n.toLocaleString() + ' rows';
      state.modal.progress = 0;
      state.modal.visible  = true;

      const t0   = performance.now();
      const rows = await generateDataAsync(n, p => { state.modal.progress = p; });

      state.myTable.rows = rows;

      state.perf.setMs    = (performance.now() - t0).toFixed(0) + ' ms';
      state.modal.visible = false;

      // Auto-start ambient motion so the page is visibly alive on load —
      // pulse dots + sparkline drift + heat/trend/sprint mutation.
      state.dribbling = true;
    },

    closeInspect() { state.inspect.open = false; },

    startDragCol(col, event) {
      state.drag.col = col;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', col);
      }
    },
    dropCol(target, event) {
      event.preventDefault();
      const src = state.drag.col;
      state.drag.col  = null;
      state.drag.over = null;
      if (!src || src === target) return;
      const cols = state.myTable.columns.slice();
      const from = cols.indexOf(src);
      const to   = cols.indexOf(target);
      if (from < 0 || to < 0) return;
      cols.splice(from, 1);
      cols.splice(to, 0, src);
      // One reactive write — the header loop and every row's cell loop
      // both read myTable.columns and rerender in lockstep.
      state.myTable.columns = cols;
    },

    peekCell(templateId, event) {
      const tpl = document.getElementById(templateId);
      if (!tpl) return;
      state.preview.title = templateId;
      state.preview.source = tpl.innerHTML.trim();
      // Clamp so the popover never spills off-screen.
      const pad = 16, w = 460, h = 260;
      state.preview.x = Math.min(event.clientX + pad, window.innerWidth  - w - pad);
      state.preview.y = Math.min(event.clientY + pad, window.innerHeight - h - pad);
      state.preview.visible = true;
    },
    unpeekCell() { state.preview.visible = false; },

    // Density slider → CSS var. The layout recompute happens via refreshwindow,
    // which watches rowHeight among other things.
    onrowheight(h) {
      const n = +h || 56;
      document.documentElement.style.setProperty('--row-h', n + 'px');
    },

    // URL hash ↔ state sync via vln-router. First hashchange sets routerReady
    // so we don't clobber the initial URL with defaults before it's parsed.
    onroute(path) {
      if (!state) return; // fires during initial bind, before state is assigned
      const q = path.indexOf('?');
      const params = new URLSearchParams(q === -1 ? '' : path.slice(q + 1));
      const filter  = params.get('filter') || '';
      const sort    = params.get('sort')   || '';
      const density = parseInt(params.get('density') || '', 10);
      const t = state.myTable;
      ctrl.batch(() => {
        if (t.filterRaw !== filter) t.filterRaw = filter;
        if (sort) {
          const [col, dir] = sort.split(':');
          if (t.sortCol !== col) t.sortCol = col;
          const d = dir === 'desc' ? 'desc' : 'asc';
          if (t.sortDir !== d) t.sortDir = d;
        } else if (t.sortCol) {
          t.sortCol = null;
          t.sortDir = 'asc';
        }
        if (!isNaN(density) && density >= 30 && density <= 80 && t.rowHeight !== density) {
          t.rowHeight = density;
        }
      });
      state.routerReady = true;
    },
    onurlstate([filter, sortCol, sortDir, rowH]) {
      if (!state || !state.routerReady) return;
      const p = new URLSearchParams();
      if (filter)  p.set('filter', filter);
      if (sortCol) p.set('sort', sortCol + ':' + sortDir);
      if (rowH !== 56) p.set('density', String(rowH));
      const query   = p.toString();
      const desired = '#/' + (query ? '?' + query : '');
      const current = window.location.hash || '';
      // '#/' and '' both render as the same location — skip the no-op write.
      if (current !== desired && !(current === '' && desired === '#/')) {
        window.location.hash = desired;
      }
    },
  });
  ctrl = Velin.getController(state);

  // Scroll → state bridge. The listener does one thing: push scrollTop into
  // reactive state. refreshwindow reacts to that write and updates the ring
  // slots. rAF-throttling coalesces bursts of scroll events into one write
  // per frame, so downstream watchers fire at most 60 Hz.
  let scrollRafPending = false;
  viewport.addEventListener('scroll', () => {
    if (scrollRafPending) return;
    scrollRafPending = true;
    requestAnimationFrame(() => {
      scrollRafPending = false;
      state.myTable.scrollTop = viewport.scrollTop;
    });
  }, { passive: true });

  // Viewport resize → state bridge. Same shape as the scroll bridge.
  const ro = new ResizeObserver(() => {
    state.myTable.viewportHeight = viewport.clientHeight;
  });
  ro.observe(viewport);
  state.myTable.viewportHeight = viewport.clientHeight || 600;

  let lastT  = performance.now();
  let frames = 0;
  (function tick() {
    frames++;
    const now = performance.now();
    if (now - lastT >= 1000) {
      const dt = (now - lastT) / 1000;
      state.perf.fps = Math.round(frames / dt) + ' fps';
      state.perf.ops = Math.round(writeCount / dt).toLocaleString() + '/s';
      frames = 0;
      writeCount = 0;
      lastT  = now;
    }
    requestAnimationFrame(tick);
  })();

  // Now that `state` is assigned, re-run onroute so the initial hash is
  // parsed and routerReady flips true. (onroute fires during bind but has
  // to bail there because `state` isn't set yet.)
  state.onroute(state.route.path || '/');
  // First fire of oncolschange also happens pre-state during bind, so
  // populate activeCols manually here — the loops depend on it.
  state.oncolschange(state.myTable.columns);

  state.doGenerate();
})();
