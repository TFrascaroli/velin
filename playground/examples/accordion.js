export default function() {
  return {
    items: [
      {
        id: 1,
        title: 'What is Velin?',
        content: 'Velin is a fine-grained reactivity engine for building interactive UIs with a pure JavaScript model.',
        opened: false
      },
      {
        id: 2,
        title: 'How does it work?',
        content: 'Velin uses native Proxies to track state changes at the property level and surgically update the DOM.',
        opened: false
      },
      {
        id: 3,
        title: 'Why use Velin?',
        content: 'The core provides a direct API with no build step. Logic is defined in standard JS objects while the view stays in HTML.',
        opened: false
      }
    ]
  };
}
