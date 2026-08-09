export default function() {
  const DURATION = 300; // must match CSS transition-duration
  let nextId = 4;
  return {
    panelShown: true,
    panelLeaving: false,
    items: [
      { id: 1, label: 'First',  leaving: false },
      { id: 2, label: 'Second', leaving: false },
      { id: 3, label: 'Third',  leaving: false },
    ],

    togglePanel() {
      if (!this.panelShown) {
        this.panelShown = true;
        return;
      }
      this.panelLeaving = true;
      setTimeout(() => {
        this.panelShown = false;
        this.panelLeaving = false;
      }, DURATION);
    },

    add() {
      const n = nextId++;
      this.items.push({ id: n, label: 'Item ' + n, leaving: false });
    },

    remove(id) {
      const item = this.items.find(x => x.id === id);
      if (!item) return;
      item.leaving = true;
      setTimeout(() => {
        this.items = this.items.filter(x => x.id !== id);
      }, DURATION);
    },
  };
}
