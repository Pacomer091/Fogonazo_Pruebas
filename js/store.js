/**
 * GourmetOS - Store & Real-time Synchronization Engine
 * Uses localStorage + BroadcastChannel for real-time multi-tab synchronization.
 */

const STORAGE_KEYS = {
  RESTAURANTS: 'gourmet_restaurants',
  MENU: 'gourmet_menu',
  ORDERS: 'gourmet_orders',
  CHATS: 'gourmet_chats',
  SETTINGS: 'gourmet_settings'
};

const SEED_DATA = {
  restaurant: {
    id: 'rest_demo',
    name: 'Gourmet Restobar',
    tagline: 'Cocina mediterránea de autor & Horno de leña',
    address: 'Avenida Principal 42, Ciudad',
    phone: '+34 910 000 000',
    currency: '€',
    deliveryFee: 2.50,
    minOrder: 15.00,
    isOpen: true
  },
  menu: [
    {
      id: 'dish_1',
      name: 'Pizza Diávola al Forno',
      category: 'Pizzas Artesanas',
      price: 13.90,
      description: 'Masa madre 48h, salsa pomodoro San Marzano, mozzarella fiordilatte, spianata piccante y orégano fresco.',
      image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&auto=format&fit=crop&q=80',
      available: true,
      popular: true,
      allergens: ['gluten', 'lacteos']
    },
    {
      id: 'dish_2',
      name: 'Tagliatelle al Tartufo',
      category: 'Pastas Frescas',
      price: 16.50,
      description: 'Pasta fresca al huevo con crema de trufa negra de verano, parmigiano reggiano 24 meses y yema curada.',
      image: 'https://images.unsplash.com/photo-1621996346565-e3d5d62816e8?w=600&auto=format&fit=crop&q=80',
      available: true,
      popular: true,
      allergens: ['gluten', 'lacteos', 'huevo']
    },
    {
      id: 'dish_3',
      name: 'Burrata Pugliese con Pesto',
      category: 'Entrantes',
      price: 11.80,
      description: 'Burrata de 200g rellena de stracciatella, tomates confitados, pesto genovés al mortero y piñones tostados.',
      image: 'https://images.unsplash.com/photo-1592417817098-8f3d6910985b?w=600&auto=format&fit=crop&q=80',
      available: true,
      popular: false,
      allergens: ['lacteos', 'frutos-secos']
    },
    {
      id: 'dish_4',
      name: 'Tiramisú Tradizionale',
      category: 'Postres',
      price: 6.50,
      description: 'Savoiardi empapados en café espresso Illy y amaretto, crema batida de mascarpone y cacao amargo.',
      image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&auto=format&fit=crop&q=80',
      available: true,
      popular: true,
      allergens: ['gluten', 'lacteos', 'huevo']
    },
    {
      id: 'dish_5',
      name: 'Vino Chianti Classico DOCG',
      category: 'Bebidas & Vinos',
      price: 18.00,
      description: 'Botella 75cl. Uva Sangiovese, notas de frutos rojos maduros, toque especiado y paso elegante.',
      image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&auto=format&fit=crop&q=80',
      available: true,
      popular: false,
      allergens: ['sulfitos']
    }
  ],
  orders: [
    {
      id: 'ORD-701',
      customer: {
        name: 'Carlos Mendoza',
        phone: '+34 654 987 321',
        table: 'Mesa 4',
        type: 'dine_in' // 'dine_in' o 'delivery'
      },
      items: [
        { id: 'dish_1', name: 'Pizza Diávola al Forno', quantity: 2, price: 13.90 },
        { id: 'dish_5', name: 'Vino Chianti Classico DOCG', quantity: 1, price: 18.00 }
      ],
      total: 45.80,
      paymentMethod: 'bizum',
      paymentStatus: 'paid',
      status: 'cooking', // 'pending' | 'cooking' | 'ready' | 'delivered' | 'cancelled'
      createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      note: 'La pizza bien tostada por favor'
    },
    {
      id: 'ORD-702',
      customer: {
        name: 'Elena Ramos',
        phone: '+34 611 223 344',
        address: 'Paseo de la Castellana 88, 3ºB',
        type: 'delivery'
      },
      items: [
        { id: 'dish_2', name: 'Tagliatelle al Tartufo', quantity: 1, price: 16.50 },
        { id: 'dish_3', name: 'Burrata Pugliese con Pesto', quantity: 1, price: 11.80 },
        { id: 'dish_4', name: 'Tiramisú Tradizionale', quantity: 2, price: 6.50 }
      ],
      total: 43.80,
      paymentMethod: 'card',
      paymentStatus: 'paid',
      status: 'pending',
      createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      note: 'Sin cubiertos de plástico'
    }
  ],
  chats: {
    'ORD-701': [
      { sender: 'customer', text: 'Hola! ¿Podríais traernos un poco de aceite picante a la mesa 4?', time: '19:08' },
      { sender: 'restaurant', text: '¡Por supuesto Carlos! En un segundo te lo acerca el camarero.', time: '19:09' }
    ]
  }
};

class GourmetStore {
  constructor() {
    this.channel = new BroadcastChannel('gourmet_sync_channel');
    this.listeners = [];
    this.initDatabase();

    // Listen to real-time events from other tabs/windows
    this.channel.onmessage = (event) => {
      this.notifyListeners(event.data.type, event.data.payload);
    };
  }

  initDatabase() {
    if (!localStorage.getItem(STORAGE_KEYS.MENU)) {
      localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(SEED_DATA.menu));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ORDERS)) {
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(SEED_DATA.orders));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(SEED_DATA.restaurant));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CHATS)) {
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(SEED_DATA.chats));
    }
  }

  // --- Broadcast & Subscription Engine ---
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notifyListeners(type, payload) {
    this.listeners.forEach(cb => {
      try {
        cb(type, payload);
      } catch (e) {
        console.error('Error in store listener:', e);
      }
    });
  }

  broadcast(type, payload) {
    // Notify own tab
    this.notifyListeners(type, payload);
    // Broadcast to other tabs
    this.channel.postMessage({ type, payload });
  }

  // --- Audio Synthesis for instant alerts (No external MP3 needed!) ---
  playBeep(type = 'notification') {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'new_order') {
        // High double-tone chime for new incoming order
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      } else {
        // Soft bubble pop for chat / status update
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {
      // Audio context might be restricted before first click
    }
  }

  // --- Menu Methods ---
  getMenu() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.MENU)) || [];
  }

  updateDish(id, updates) {
    const menu = this.getMenu();
    const index = menu.findIndex(d => d.id === id);
    if (index !== -1) {
      menu[index] = { ...menu[index], ...updates };
      localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(menu));
      this.broadcast('menu_updated', menu);
    }
  }

  // --- Orders Methods ---
  getOrders() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS)) || [];
  }

  getOrderById(id) {
    return this.getOrders().find(o => o.id === id);
  }

  createOrder(orderData) {
    const orders = this.getOrders();
    const newId = 'ORD-' + Math.floor(100 + Math.random() * 900);
    const newOrder = {
      id: newId,
      status: 'pending',
      paymentStatus: 'paid',
      createdAt: new Date().toISOString(),
      ...orderData
    };
    orders.unshift(newOrder);
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    this.broadcast('new_order', newOrder);
    this.playBeep('new_order');
    return newOrder;
  }

  updateOrderStatus(orderId, newStatus) {
    const orders = this.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (order) {
      order.status = newStatus;
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
      this.broadcast('order_status_changed', { orderId, newStatus, order });
      this.playBeep('notification');
    }
  }

  // --- Chat Methods ---
  getChats() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CHATS)) || {};
  }

  getOrderChat(orderId) {
    const chats = this.getChats();
    return chats[orderId] || [];
  }

  sendChatMessage(orderId, sender, text) {
    const chats = this.getChats();
    if (!chats[orderId]) chats[orderId] = [];
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const msg = { sender, text, time: timeStr, timestamp: Date.now() };
    chats[orderId].push(msg);
    localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
    this.broadcast('new_chat_message', { orderId, message: msg });
    this.playBeep('notification');
    return msg;
  }

  // --- Metrics Calculation ---
  getMetrics() {
    const orders = this.getOrders();
    const completedOrders = orders.filter(o => o.status !== 'cancelled');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const activeOrders = orders.filter(o => o.status === 'pending' || o.status === 'cooking');
    const avgTicket = completedOrders.length ? (totalRevenue / completedOrders.length) : 0;

    return {
      totalOrders: orders.length,
      activeOrdersCount: activeOrders.length,
      totalRevenue: totalRevenue.toFixed(2),
      avgTicket: avgTicket.toFixed(2),
      platformFee: (totalRevenue * 0.05).toFixed(2) // 5% SaaS commission preview
    };
  }

  // Reset to initial demo data
  resetDemoData() {
    localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(SEED_DATA.menu));
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(SEED_DATA.orders));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(SEED_DATA.restaurant));
    localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(SEED_DATA.chats));
    this.broadcast('reset_data', null);
  }
}

// Global singleton instance
window.gStore = new GourmetStore();
