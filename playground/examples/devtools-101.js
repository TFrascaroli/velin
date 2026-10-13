// Devtools 101 — five realistic, hard-to-see-by-eye bugs. Each has a
// walkthrough step in the companion .html that explains the reveal.

// Delegate: tutorial surface mentions (span.dv-link) open the drawer on
// that surface. Attached once per page load; <script> tags inside the
// loaded HTML don't execute via innerHTML, so the handler lives here.
if (!window.__DV_LINK_WIRED__) {
  window.__DV_LINK_WIRED__ = true;
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest(".dv-link");
    if (!t) return;
    const api = window.__VELIN_DEVTOOLS_COMPANION__;
    if (!api) return;
    const surface = (t.dataset.surface || t.textContent || "").trim().toLowerCase();
    if (["inspect", "record", "leaks", "signals", "query", "explain"].includes(surface)) {
      api.open(surface === "explain" ? "inspect" : surface);
    }
  });
}

const PRIORITIES = ["high", "medium", "low"];
const WORDS = ["write", "review", "ship", "test", "triage", "merge", "refactor", "doc", "demo", "fix", "spec", "sync"];

const rndTitle = (i) => `${WORDS[i % WORDS.length]} ${WORDS[(i * 7) % WORDS.length]} #${i}`;
const rndPriority = (i) => PRIORITIES[i % PRIORITIES.length];

export default function () {
  return {
    tasks: Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      title: rndTitle(i),
      done: i % 3 === 0,
      priority: rndPriority(i),
    })),
    nextId: 7,
    filter: "",
    theme: "light",

    get filteredTasks() {
      const q = this.filter.toLowerCase();
      if (!q) return this.tasks;
      return this.tasks.filter((t) => t.title.toLowerCase().includes(q));
    },

    // BUG — JSON.stringify takes a dep on every field of every task.
    get debugLine() {
      const serialized = JSON.stringify(this.tasks);
      const doneCount = this.tasks.filter((t) => t.done).length;
      return `${this.tasks.length} tasks · ${doneCount} done · state size: ${serialized.length}b`;
    },

    addTask() {
      this.tasks.push({
        id: this.nextId++,
        title: `new task #${this.nextId - 1}`,
        done: false,
        priority: rndPriority(this.tasks.length),
      });
    },

    // BUG — N synchronous writes = N × (filter + debugLine + row bindings).
    // Fix: uncomment the batch wrapper.
    markAllDone() {
      // Velin.getController(this).batch(() => {
      for (const t of this.tasks) t.done = true;
      // });
    },

    loadDemo() {
      const start = this.tasks.length;
      for (let i = 0; i < 500; i++) {
        this.tasks.push({
          id: this.nextId++,
          title: rndTitle(start + i),
          done: (start + i) % 4 === 0,
          priority: rndPriority(start + i),
        });
      }
    },

    // BUG — nested Velin.bind() with no matching unbind. Each open+close
    // leaks a full state tree. Fix: uncomment Velin.unbind(nestedState).
    openDetails(task) {
      const Velin = window.Velin;
      const overlay = document.createElement("div");
      overlay.className = "fixed inset-0 bg-black/40 flex items-center justify-center z-50";
      overlay.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl p-5 w-80">
          <h3 class="text-lg font-bold mb-2" vln-text="snapshot.title"></h3>
          <div class="text-sm text-gray-600 mb-1">priority: <span vln-text="snapshot.priority" class="font-mono"></span></div>
          <div class="text-sm text-gray-600 mb-4">done: <span vln-text="snapshot.done ? 'yes' : 'no'"></span></div>
          <button vln-on:click="close()" class="w-full px-3 py-1.5 bg-blue-500 text-white rounded text-sm">close</button>
        </div>`;
      document.body.appendChild(overlay);

      const nestedState = Velin.bind(overlay, {
        snapshot: { title: task.title, priority: task.priority, done: task.done },
        close() {
          // Velin.unbind(nestedState);
          overlay.remove();
        },
      });

      const onKey = (e) => {
        if (e.key !== "Escape") return;
        document.removeEventListener("keydown", onKey);
        // Velin.unbind(nestedState);
        overlay.remove();
      };
      document.addEventListener("keydown", onKey);
    },
  };
}
