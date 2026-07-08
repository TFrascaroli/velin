export default function() {
  return {
    // State - vln-input binds to these properties
    email: '',
    password: '',
    agreed: false,
    loading: false,
    success: false,
    touched: {
      email: false,
      password: false,
      agreed: false
    },

    // Computed properties - getters automatically track dependencies
    get isEmailValid() {
      return this.email.includes('@') && this.email.includes('.');
    },

    get isPasswordValid() {
      return this.password.length >= 8;
    },

    get canSubmit() {
      // Access all dependencies before using in logical expressions
      // to ensure reactivity tracks them (avoids short-circuit skipping)
      const emailValid = this.isEmailValid;
      const passwordValid = this.isPasswordValid;
      const hasAgreed = this.agreed;

      return emailValid && passwordValid && hasAgreed;
    },

    async handleSubmit() {
      this.touched = { email: true, password: true, agreed: true };

      if (!this.canSubmit) return;

      this.loading = true;
      this.success = false;

      await new Promise(resolve => setTimeout(resolve, 1000));

      this.success = true;
      this.email = '';
      this.password = '';
      this.agreed = false;
      this.touched = { email: false, password: false, agreed: false };
      this.loading = false;
    }
  };
}
