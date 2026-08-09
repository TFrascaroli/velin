export default function() {
  let nextId = 4;
  return {
    visible: true,
    items: [
      { id: 1, label: 'First' },
      { id: 2, label: 'Second' },
      { id: 3, label: 'Third' },
    ],
    whichCard: 'card-user',
    add() {
      const n = nextId++;
      this.items.push({ id: n, label: 'Item ' + n });
    },
    remove(id) {
      const i = this.items.findIndex(x => x.id === id);
      if (i >= 0) this.items.splice(i, 1);
    },
  };
}
