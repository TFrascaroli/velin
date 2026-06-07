globalThis.velinpadState = {

  // Feature demo state
  editorText: '',
  showSecret: false,
  counter: 0,
  clicks: 0,
  
  // Tabs
  activeTab: 'info',

  selectTab: function(tab) {
    this.activeTab = tab;
  },
  
  // Color mixer
  red: 128,
  green: 128,
  blue: 128,
  
  // Todo list
  todos: [],
  newTodo: '',
  
  // Number inputs
  num1: 0,
  num2: 0,

  showEditor: false,

  toggleEditor() {
    this.showEditor = !this.showEditor;
  },

  get jsonState() {
    return JSON.stringify({
      editorText: this.editorText,
      showSecret: this.showSecret,
      counter: this.counter,
      clicks: this.clicks,
      activeTab: this.activeTab,
      red: this.red,
      green: this.green,
      blue: this.blue,
      todos: this.todos,
      newTodo: this.newTodo,
      num1: this.num1,
      num2: this.num2
    }, null, 2);
  },

  set jsonState(value) {
    try {
      const data = JSON.parse(value);
      if (data.editorText !== undefined) this.editorText = data.editorText;
      if (data.showSecret !== undefined) this.showSecret = data.showSecret;
      if (data.counter !== undefined) this.counter = data.counter;
      if (data.clicks !== undefined) this.clicks = data.clicks;
      if (data.activeTab !== undefined) this.activeTab = data.activeTab;
      if (data.red !== undefined) this.red = data.red;
      if (data.green !== undefined) this.green = data.green;
      if (data.blue !== undefined) this.blue = data.blue;
      if (data.todos !== undefined) this.todos = data.todos;
      if (data.newTodo !== undefined) this.newTodo = data.newTodo;
      if (data.num1 !== undefined) this.num1 = data.num1;
      if (data.num2 !== undefined) this.num2 = data.num2;
    } catch (e) {
      // Ignore invalid JSON during typing
    }
  },

  // Helper method inside state
  resetVelinpadState() {
    this.editorText = '';
    this.showSecret = false;
    this.counter = 0;
    this.clicks = 0;
    this.activeTab = 'info';
    this.red = 128;
    this.green = 128;
    this.blue = 128;
    this.todos = [];
    this.newTodo = '';
    this.num1 = 0;
    this.num2 = 0;
  }
};
