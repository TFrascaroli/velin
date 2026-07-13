export interface UserStateInterface {
  user: {
    name: string;
    email: string;
    isActive: boolean;
    profile: {
      avatar: string;
      bio: string;
      preferences: {
        theme: 'light' | 'dark';
        notifications: boolean;
      };
    };
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
  }>;
  currentUserId: string | null;
  isLoading: boolean;
  error: string | null;

  // Methods
  updateUser(updates: Partial<UserStateInterface['user']>): void;
  addUser(user: { name: string; email: string }): void;
  removeUser(id: string): void;
  setCurrentUser(id: string): void;
  clearError(): void;
  
  // Computed properties
  getCurrentUser(): UserStateInterface['users'][0] | null;
  getUserCount(): number;
}