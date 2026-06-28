/**
 * @typedef {import('../src/velin-core').VelinCore} VelinCore
 */

const Velin = /** @type {globalThis & {Velin: VelinCore}} */ (globalThis).Velin;

async function injectTemplate(url) {
  const html = await fetch(url).then((r) => r.text());

  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  document.body.appendChild(tpl.content);
}

Velin.plugins.registerPlugin({
  name: "table",
  render: ({ node, expr, reactiveState, attributeValue }) => {
    const tableInfo = Velin.evaluate(reactiveState, expr);
    const saveColumnIndex = Velin.getSetter(reactiveState, expr + ".colIndex");

    const colIndex = {};
    tableInfo.columnDefinitions.forEach(colDef => {
      colIndex[colDef.id] = colDef;
    });
    saveColumnIndex(colIndex);
    node.setAttribute("vln-var:tabledata", attributeValue);

    return {
      plugins: [
        { name: "vln-fragment", value: "'efficient-table'" },
      ],
    };
  },
});

(async () => {
  await injectTemplate("efficient-table.tpl.html");
  // Initialize Velin after templates are loaded
  const state = Velin.bind(document.body, {
    myTable: {
      columnDefinitions: [
        { id: "name", label: "Name" },
        { id: "age", label: "Age"},
        { id: "city", label: "City" },
        { id: "medals", label: "Medals" },
        { id: "actions", label: "Actions"},
        { id: "score", label: "Score" },
        { id: "rank", label: "Rank" },
      ],
      columns: ["name", "age", "city", "medals", "actions", "score", "rank"],
      rows: [],
      rowHeight: 40,
    },
    randomizeRows() {
        const cities = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"];
        const names = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace"];
        const newRows = [];
        const nRows = 1; // Adjust this number to test performance with different row counts
        for (let i = 0; i < nRows; i++) {
            newRows.push({
                name: names[Math.floor(Math.random() * names.length)],
                age: Math.floor(Math.random() * 60) + 20,
                city: cities[Math.floor(Math.random() * cities.length)],
                medals: Math.floor(Math.random() * 10),
                score: Math.floor(Math.random() * 100),
                rank: Math.floor(Math.random() * 100) + 1,
            });
        }
        this.myTable.rows = newRows;
    }
  });
})();
