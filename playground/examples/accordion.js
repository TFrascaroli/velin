export default function() {
  return {
    openIds: [],
    items: [
      {
        id: 1,
        title: 'What is Velin?',
        content: 'Velin is a lightweight reactive framework for building interactive web applications with minimal overhead.'
      },
      {
        id: 2,
        title: 'How does it work?',
        content: 'Velin uses a proxy-based reactivity system that automatically tracks dependencies and updates the DOM when state changes.'
      },
      {
        id: 3,
        title: 'Why use Velin?',
        content: 'Velin provides a simple, intuitive API with no build step required. Perfect for adding reactivity to existing projects or building new ones from scratch.'
      }
    ],

    isOpen(id) {
      return this.openIds.includes(id);
    },

    toggle(id) {
      if (this.isOpen(id)) {
        this.openIds = this.openIds.filter(i => i !== id);
      } else {
        this.openIds.push(id);
      }
    }
  };
}
