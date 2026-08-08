export default function() {
  return {
    users: ['Alice', 'Bob', 'Charlie'],
    messageCount: 3,

    addUser() {
      const next = ['Dana', 'Eve', 'Frank', 'Gina', 'Hank'][this.users.length - 3] || 'Anon';
      this.users.push(next);
    },
  };
}
