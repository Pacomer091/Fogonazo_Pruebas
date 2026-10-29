/**
 * Customer Ordering & Menu Logic
 * Interacts with GourmetStore for real-time synchronization
 */

let cart = []; // [{ id, name, price, quantity }]
let currentCategory = 'all';
let selectedPaymentMethod = 'card';
let activeCustomerOrderId = localStorage.getItem('last_customer_order_id') || null;

document.addEventListener('DOMContentLoaded', () => {
  renderDishes();
  updateCartUI();
  checkActiveOrder();
  setupCustomerChat();

  // Listen to cross-tab updates from Restaurant panel
  window.gStore.subscribe((type, payload) => {
    if (type === 'order_status_changed' && payload.orderId === activeCustomerOrderId) {
      updateTrackerStatus(payload.newStatus);
      showToast(`¡Actualización de tu comanda! Estado: ${formatStatusName(payload.newStatus)}`, 'info');
    } else if (type === 'new_chat_message' && payload.orderId === activeCustomerOrderId) {
      appendCustomerChatMessage(payload.message);
      if (payload.message.sender === 'restaurant') {
        showToast('El restaurante te ha enviado un mensaje', 'info');
      }
    } else if (type === 'menu_updated') {
      renderDishes();
    }
  });
});

// Render dishes from Store
function renderDishes() {
  const container = document.getElementById('dishes-container');
  const menu = window.gStore.getMenu();

  const filtered = currentCategory === 'all' 
    ? menu 
    : menu.filter(dish => dish.category === currentCategory);

  container.innerHTML = '';

  filtered.forEach(dish => {
    const card = document.createElement('div');
    card.className = 'dish-card';

    const allergensHtml = (dish.allergens || []).map(a => 
      `<span class="allergen-tag">${a}</span>`
    ).join('');

    const starSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle; margin-right:4px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

    card.innerHTML = `
      <div class="dish-img-wrapper">
        <img src="${dish.image}" alt="${escapeHtml(dish.name)}" class="dish-img" loading="lazy">
        ${dish.popular ? `<span class="popular-badge">${starSvg} Destacado</span>` : ''}
      </div>
      <div class="dish-details">
        <div class="dish-title-row">
          <h3 class="dish-name">${escapeHtml(dish.name)}</h3>
          <span class="dish-price">${dish.price.toFixed(2)} €</span>
        </div>
        <p class="dish-desc">${escapeHtml(dish.description)}</p>
        <div class="dish-bottom">
          <div class="allergens-row">
            ${allergensHtml}
          </div>
          <button onclick="addToCart('${dish.id}')" class="btn btn-primary btn-sm">
            + Añadir
          </button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// Category filter
window.filterCategory = function(cat) {
  currentCategory = cat;
  const pills = document.querySelectorAll('.category-pill');
  pills.forEach(p => p.classList.remove('active'));

  const activeBtn = Array.from(pills).find(p => 
    (cat === 'all' && p.textContent.includes('Toda la Carta')) || p.textContent.includes(cat)
  );
  if (activeBtn) activeBtn.classList.add('active');

  renderDishes();
};

// Cart Management
window.addToCart = function(dishId) {
  const dish = window.gStore.getMenu().find(d => d.id === dishId);
  if (!dish) return;

  const existing = cart.find(item => item.id === dishId);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({
      id: dish.id,
      name: dish.name,
      price: dish.price,
      quantity: 1
    });
  }

  window.gStore.playBeep('notification');
  updateCartUI();
  showToast(`Añadido: ${dish.name}`, 'success');
};

function changeQty(dishId, delta) {
  const item = cart.find(i => i.id === dishId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.id !== dishId);
  }
  updateCartUI();
  renderCartModalItems();
}

function updateCartUI() {
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const floatingBar = document.getElementById('floating-cart');
  const totalQtyBadge = document.getElementById('cart-total-qty');
  const totalPriceSpan = document.getElementById('cart-total-price');
  const btnCheckout = document.getElementById('btn-confirm-checkout');

  if (totalQty > 0) {
    floatingBar.style.display = 'flex';
    totalQtyBadge.textContent = totalQty;
    totalPriceSpan.textContent = `${totalPrice.toFixed(2)} €`;
    btnCheckout.textContent = `Pagar y Enviar Pedido (${totalPrice.toFixed(2)} €)`;
  } else {
    floatingBar.style.display = 'none';
  }
}

// Modal controls
window.openCartModal = function() {
  renderCartModalItems();
  document.getElementById('cart-modal').classList.add('open');
};

window.closeCartModal = function() {
  document.getElementById('cart-modal').classList.remove('open');
};

function renderCartModalItems() {
  const container = document.getElementById('cart-items-container');
  container.innerHTML = '';

  if (cart.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:2rem 0;">Tu carrito está vacío.</p>';
    return;
  }

  cart.forEach(item => {
    const row = document.createElement('div');
    row.className = 'cart-item-row';
    row.innerHTML = `
      <div class="cart-item-info">
        <h4>${escapeHtml(item.name)}</h4>
        <span style="font-size: 0.85rem; color: var(--brand-orange-light);">${item.price.toFixed(2)} € ud.</span>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" onclick="changeQty('${item.id}', -1)">-</button>
        <span style="font-weight: 700; min-width: 20px; text-align: center;">${item.quantity}</span>
        <button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
      </div>
    `;
    container.appendChild(row);
  });
}

// Payment method selection
window.selectPaymentMethod = function(method) {
  selectedPaymentMethod = method;
  
  ['card', 'bizum', 'paypal'].forEach(m => {
    document.getElementById(`tab-btn-${m}`).classList.toggle('active', m === method);
    document.getElementById(`pay-box-${m}`).style.display = (m === method) ? 'block' : 'none';
  });
};

// Handle Location / Delivery switch
window.handleOrderTypeChange = function() {
  const select = document.getElementById('select-order-type');
  const isDelivery = select.value === 'delivery';
  document.getElementById('delivery-address-group').style.display = isDelivery ? 'block' : 'none';
};

// Execute Checkout
window.executeCheckout = function() {
  if (cart.length === 0) {
    showToast('El carrito está vacío', 'warning');
    return;
  }

  const nameInput = document.getElementById('checkout-customer-name');
  const customerName = nameInput.value.trim() || 'Cliente';

  const orderTypeSelect = document.getElementById('select-order-type');
  const isDelivery = orderTypeSelect.value === 'delivery';
  
  const address = isDelivery 
    ? (document.getElementById('checkout-address').value.trim() || 'Dirección de entrega no indicada')
    : null;

  const table = isDelivery ? null : orderTypeSelect.options[orderTypeSelect.selectedIndex].text;
  const note = document.getElementById('checkout-note').value.trim();
  const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Create order via Store
  const newOrder = window.gStore.createOrder({
    customer: {
      name: customerName,
      phone: '+34 600 000 000',
      type: isDelivery ? 'delivery' : 'dine_in',
      table: table,
      address: address
    },
    items: [...cart],
    total: totalPrice,
    paymentMethod: selectedPaymentMethod,
    note: note
  });

  activeCustomerOrderId = newOrder.id;
  localStorage.setItem('last_customer_order_id', activeCustomerOrderId);

  // Send initial automated welcome in chat
  window.gStore.sendChatMessage(activeCustomerOrderId, 'restaurant', `¡Hola ${customerName}! Hemos recibido tu comanda #${activeCustomerOrderId}. Enseguida nos ponemos con ella. Si necesitas cualquier cosa, ¡escríbenos por aquí!`);

  // Clear cart
  cart = [];
  updateCartUI();
  closeCartModal();

  showToast(`¡Comanda #${newOrder.id} enviada y pagada con éxito!`, 'success');
  checkActiveOrder();
};

// Live Order Tracker UI
function checkActiveOrder() {
  if (!activeCustomerOrderId) return;

  const order = window.gStore.getOrderById(activeCustomerOrderId);
  const tracker = document.getElementById('live-order-tracker');
  const chatBtn = document.getElementById('btn-customer-chat');

  if (order && order.status !== 'cancelled') {
    tracker.style.display = 'flex';
    chatBtn.style.display = 'inline-flex';
    document.getElementById('tracker-order-id').textContent = `#${order.id}`;
    updateTrackerStatus(order.status);
  } else {
    tracker.style.display = 'none';
  }
}

function updateTrackerStatus(status) {
  const stepPending = document.getElementById('step-pending');
  const stepCooking = document.getElementById('step-cooking');
  const stepReady = document.getElementById('step-ready');
  const desc = document.getElementById('tracker-status-desc');

  stepPending.className = 'timeline-step';
  stepCooking.className = 'timeline-step';
  stepReady.className = 'timeline-step';

  if (status === 'pending') {
    stepPending.classList.add('active');
    desc.textContent = 'Tu comanda ha entrado en el sistema y el personal la está revisando.';
  } else if (status === 'cooking') {
    stepPending.classList.add('done');
    stepCooking.classList.add('active');
    desc.textContent = 'En cocina: el personal está preparando tus platos.';
  } else if (status === 'ready' || status === 'delivered') {
    stepPending.classList.add('done');
    stepCooking.classList.add('done');
    stepReady.classList.add('active');
    desc.textContent = 'Comanda lista: un camarero o repartidor te los está entregando.';
  }
}

function formatStatusName(s) {
  const map = {
    pending: 'Recibido en espera',
    cooking: 'En Cocina',
    ready: 'Listo para servir',
    delivered: 'Entregado'
  };
  return map[s] || s;
}

// Customer Chat Logic
function setupCustomerChat() {
  const form = document.getElementById('customer-chat-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('customer-chat-input');
      const text = input.value.trim();
      if (!text || !activeCustomerOrderId) return;

      window.gStore.sendChatMessage(activeCustomerOrderId, 'customer', text);
      input.value = '';
    });
  }
}

window.openCustomerChat = function() {
  if (!activeCustomerOrderId) {
    showToast('Haz un pedido para poder chatear con el restaurante', 'warning');
    return;
  }
  const drawer = document.getElementById('customer-chat-drawer');
  document.getElementById('cust-chat-sub').textContent = `Comanda #${activeCustomerOrderId}`;
  loadCustomerChatHistory();
  drawer.classList.add('open');
  document.getElementById('customer-chat-input').focus();
};

window.closeCustomerChat = function() {
  document.getElementById('customer-chat-drawer').classList.remove('open');
};

function loadCustomerChatHistory() {
  const container = document.getElementById('customer-chat-messages');
  container.innerHTML = '';
  const messages = window.gStore.getOrderChat(activeCustomerOrderId);

  if (messages.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-dim); font-size: 0.8rem; margin-top: 1rem;">Escribe aquí para contactar con los camareros o cocina.</div>`;
  } else {
    messages.forEach(msg => appendCustomerChatMessage(msg));
  }
}

function appendCustomerChatMessage(msg) {
  const container = document.getElementById('customer-chat-messages');
  const emptyHint = container.querySelector('div[style*="text-align: center"]');
  if (emptyHint) emptyHint.remove();

  const bubble = document.createElement('div');
  bubble.className = `chat-msg ${msg.sender}`;
  bubble.innerHTML = `
    ${escapeHtml(msg.text)}
    <span class="chat-time">${msg.time}</span>
  `;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

// Toast helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconSvg = type === 'success'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    : type === 'warning'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

  toast.innerHTML = `
    <span class="svg-icon">${iconSvg}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(60px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[m]);
}
