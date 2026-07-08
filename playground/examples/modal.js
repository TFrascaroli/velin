export default function() {
  return {
    isModalOpen: false,
    modalMessage: 'This is a modal dialog! Click outside or press Close to dismiss.',

    openModal() {
      this.isModalOpen = true;
    },

    closeModal() {
      this.isModalOpen = false;
    },

    handleConfirm() {
      alert('Confirmed!');
      this.closeModal();
    }
  };
}
