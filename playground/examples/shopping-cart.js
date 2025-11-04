export default function() {
  return {
    products: [
      { id: 1, name: 'Widget', price: 9.99 },
      { id: 2, name: 'Gadget', price: 14.99 },
      { id: 3, name: 'Doohickey', price: 19.99 },
      { id: 4, name: 'Thingamajig', price: 24.99 }
    ],
    cart: [],

    get total() {
      return this.cart.reduce((sum, item) => sum + item.price, 0).toFixed(2);
    },

    addToCart(product) {
      this.cart.push({ ...product });
    },

    removeFromCart(item) {
      const index = this.cart.indexOf(item);
      if (index > -1) {
        this.cart.splice(index, 1);
      }
    }
  };
}
