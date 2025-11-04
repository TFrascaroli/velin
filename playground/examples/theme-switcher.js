export default {
  currentTheme: 'modern',

  blog: {
    title: 'The Design Chronicle',
    tagline: 'Exploring the intersection of design, technology, and creativity',

    get categories() {
      // Extract unique categories from posts
      const cats = [...new Set(this.posts.map(p => p.category))];
      return cats.sort();
    },

    posts: [
      {
        id: 1,
        title: 'The Evolution of Modern Web Design',
        excerpt: 'From the early days of table layouts to today\'s component-based architectures, web design has transformed dramatically. Explore the key milestones that shaped our digital landscape.',
        author: 'Sarah Chen',
        date: 'March 15, 2025',
        category: 'Design',
        readTime: '8 min read'
      },
      {
        id: 2,
        title: 'Reactive Programming: A Paradigm Shift',
        excerpt: 'Reactive programming isn\'t just a trend—it\'s a fundamental shift in how we think about data flow and state management. Discover why major frameworks are embracing this approach.',
        author: 'Marcus Rodriguez',
        date: 'March 12, 2025',
        category: 'Technology',
        readTime: '12 min read'
      },
      {
        id: 3,
        title: 'Typography in Digital Spaces',
        excerpt: 'Good typography is invisible, but its impact is profound. Learn how to choose and pair fonts that enhance readability and create emotional resonance.',
        author: 'Emma Thompson',
        date: 'March 10, 2025',
        category: 'Design',
        readTime: '6 min read'
      },
      {
        id: 4,
        title: 'The Art of Minimalism',
        excerpt: 'Less is more, but achieving true minimalism requires careful thought. Explore the principles behind creating designs that are simple yet powerful.',
        author: 'James Wilson',
        date: 'March 8, 2025',
        category: 'Philosophy',
        readTime: '10 min read'
      },
      {
        id: 5,
        title: 'Building Accessible Interfaces',
        excerpt: 'Accessibility isn\'t optional—it\'s essential. Learn practical techniques for creating web experiences that work for everyone, regardless of ability.',
        author: 'Priya Patel',
        date: 'March 5, 2025',
        category: 'Development',
        readTime: '9 min read'
      },
      {
        id: 6,
        title: 'Color Theory for Developers',
        excerpt: 'Understanding color isn\'t just for designers. Developers who grasp color theory can make better technical decisions and create more cohesive user experiences.',
        author: 'Alex Kim',
        date: 'March 3, 2025',
        category: 'Design',
        readTime: '7 min read'
      }
    ]
  }
};
