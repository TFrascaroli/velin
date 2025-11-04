export default function() {
  return {
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

    get isEmailValid() {
      return this.email.includes('@') && this.email.includes('.');
    },

    get isPasswordValid() {
      return this.password.length >= 8;
    },

    get canSubmit() {
      // IMPORTANT: To ensure reactive tracking works correctly with getters,
      // access all dependencies BEFORE using them in logical expressions.
      // This prevents JavaScript short-circuit evaluation from skipping
      // property accesses, which would prevent those properties from being
      // tracked as dependencies.
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
