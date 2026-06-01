export default {
  activeView: 'docs',
  blocks: [
    { id: 1, type: 'text', content: 'Welcome to VelinPad' },
    { id: 2, type: 'text', content: 'This is a lightweight reactive editor.' }
  ],
  myApp: { path: '/', params: {}, query: {}, error: null, loading: false },
  
  // Logic
  addBlock(type) {
    this.blocks.push({ id: Date.now(), type, content: 'New block' });
  },
  
  removeBlock(id) {
    this.blocks = this.blocks.filter(b => b.id !== id);
  },
  
  // Watcher
  sync(data) {
    console.log('Syncing document:', data);
  }
};
