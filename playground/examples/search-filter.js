export default function() {
  return {
    search: '',
    users: [
      {
        name: 'Alice Johnson',
        email: 'ajay.dev@techcorp.io',
        role: 'Senior Engineer',
        department: 'Engineering',
        location: 'San Francisco'
      },
      {
        name: 'Bob Smith',
        email: 'robert.m@startup.co',
        role: 'Product Designer',
        department: 'Design',
        location: 'New York'
      },
      {
        name: 'Charlie Brown',
        email: 'chuck.b@innovate.net',
        role: 'DevOps Lead',
        department: 'Engineering',
        location: 'Austin'
      },
      {
        name: 'Diana Prince',
        email: 'wonder.d@heroes.org',
        role: 'Engineering Manager',
        department: 'Engineering',
        location: 'Seattle'
      },
      {
        name: 'Eve Williams',
        email: 'evelyn.w@creative.studio',
        role: 'UX Researcher',
        department: 'Design',
        location: 'Los Angeles'
      },
      {
        name: 'Frank Miller',
        email: 'f.miller@graphics.dev',
        role: 'Frontend Developer',
        department: 'Engineering',
        location: 'Boston'
      },
      {
        name: 'Grace Hopper',
        email: 'admiral.g@legacy.mil',
        role: 'Principal Engineer',
        department: 'Engineering',
        location: 'Remote'
      },
      {
        name: 'Henry Ford',
        email: 'h.ford@manufacturing.biz',
        role: 'Operations Lead',
        department: 'Operations',
        location: 'Detroit'
      }
    ],

    // Computed property - filters across all user fields
    get filteredUsers() {
      const query = this.search.toLowerCase().trim();
      if (!query) return this.users;

      return this.users.filter(user =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query) ||
        user.department.toLowerCase().includes(query) ||
        user.location.toLowerCase().includes(query)
      );
    }
  };
}
