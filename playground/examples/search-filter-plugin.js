/**
 * Custom vln-highlight plugin
 *
 * Highlights search terms within text content using <mark> tags.
 * Automatically reads the 'search' property from state and highlights
 * any matching text (case-insensitive).
 *
 * Usage: vln-highlight="user.name"
 *
 * This demonstrates:
 * - Custom plugin registration with Velin.plugins.registerPlugin()
 * - Using Velin.trackers.expressionTracker to track dependencies
 * - Accessing state with Velin.evaluate() within a plugin
 * - Returning { halt: true } to prevent further plugin processing
 */
export function registerHighlightPlugin(Velin) {
  Velin.plugins.registerPlugin({
    name: 'highlight',
    track: Velin.trackers.expressionTracker,
    render: ({ node, tracked, reactiveState }) => {
      if (!tracked || typeof tracked !== 'string') {
        node.innerHTML = '';
        return { halt: true };
      }

      // Access the 'search' property from reactive state
      const searchTerm = Velin.evaluate(reactiveState, 'search');

      if (!searchTerm || searchTerm.trim() === '') {
        // No search term - just show plain text
        node.textContent = tracked;
        return { halt: true };
      }

      // Escape HTML in the original text
      const text = tracked;
      const query = searchTerm.trim();

      // Case-insensitive search and highlight
      const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
      const highlighted = text.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');

      node.innerHTML = highlighted;
      return { halt: true };
    }
  });
}

// Helper to escape special regex characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
