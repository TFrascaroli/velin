export default function() {
  return {
    search: '',
    users: [
      { name: 'Alice Johnson', email: 'alice@example.com' },
      { name: 'Bob Smith', email: 'bob@example.com' },
      { name: 'Charlie Brown', email: 'charlie@example.com' },
      { name: 'Diana Prince', email: 'diana@example.com' },
      { name: 'Eve Williams', email: 'eve@example.com' },
      { name: 'Frank Miller', email: 'frank@example.com' }
    ],

    get filteredUsers() {
      const query = this.search.toLowerCase().trim();
      if (!query) return this.users;

      return this.users.filter(user =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      );
    }
  };
}
