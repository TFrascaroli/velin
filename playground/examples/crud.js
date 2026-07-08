let nextId = 1;

export default function() {
  return {
    tasks: [],
    newTask: '',
    editingId: null,
    editText: '',

    // Array mutations (push, splice, etc.) trigger reactivity automatically
    addTask() {
      if (this.newTask.trim()) {
        this.tasks.push({
          id: nextId++,
          text: this.newTask,
          done: false
        });
        this.newTask = '';
      }
    },

    deleteTask(id) {
      this.tasks = this.tasks.filter(t => t.id !== id);
    },

    startEdit(task) {
      this.editingId = task.id;
      this.editText = task.text;
    },

    saveEdit(task) {
      task.text = this.editText;
      this.editingId = null;
      this.editText = '';
    },

    cancelEdit() {
      this.editingId = null;
      this.editText = '';
    }
  };
}
