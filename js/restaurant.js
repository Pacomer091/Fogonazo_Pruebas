/**
 * Restaurant Dashboard Logic
 * Real-time updates via GourmetStore
 */

let activeChatOrderId = null;

document.addEventListener('DOMContentLoaded', () => {
  renderMetrics();
  renderOrders();
  setupEventListeners();

  // Subscribe to real-time events from other tabs (or this tab)
  window.gStore.subscribe((type, payload) => {
    if (type === 'new_order') {
      showToast(`¡Nuevo pedido recibido! #${payload.id} (${payload.customer.table || payload.customer.address})`, 'warning');
      renderOrders();
      renderMetrics();
    } else if (type === 'order_status_changed' || type === 'reset_data') {
      renderOrders();
      renderMetrics();
    } else if (type === 'new_chat_message') {
      if (activeChatOrderId === payload.orderId) {
        appendChatMessage(payload.message);
      } else {
        showToast(`Mensaje del cliente en comanda #${payload.orderId}`, 'info');
      }
    }
  });
});

function setupEventListeners() {
  // Audio test
  const soundBtn = document.getElementById('btn-sound-test');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      window.gStore.playBeep('new_order');
      showToast('Sonido de alerta probado con éxito', 'info');
    });
  }

  // Toggle service
  const serviceBtn = document.getElementById('btn-toggle-service');
  if (serviceBtn) {
    let isOpen = true;
    serviceBtn.addEventListener('click', () => {
      isOpen = !isOpen;
      if (isOpen) {
        serviceBtn.textContent = '● Abierto a Pedidos';
        serviceBtn.style.color = 'var(--status-ready)';
        serviceBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        showToast('El restaurante está ahora ABIERTO a nuevos pedidos', 'success');
      } else {
        serviceBtn.textContent = '● En Pausa / Cerrado';
        serviceBtn.style.color = 'var(--status-cancelled)';
        serviceBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        showToast('El restaurante está en PAUSA temporal', 'warning');
      }
    });
  }

  // Chat submit
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('chat-input');
      const text = input.value.trim();
      if (!text || !activeChatOrderId) return;

      window.gStore.sendChatMessage(activeChatOrderId, 'restaurant', text);
      input.value = '';
    });
  }
}

// Render Metrics
function renderMetrics() {
  const metrics = window.gStore.getMetrics();
  document.getElementById('kpi-revenue').textContent = `${metrics.totalRevenue} €`;
  document.getElementById('kpi-active-orders').textContent = metrics.activeOrdersCount;
  document.getElementById('kpi-avg-ticket').textContent = `${metrics.avgTicket} €`;
  document.getElementById('kpi-total-orders').textContent = metrics.totalOrders;
}

// Render Orders into Kanban
function renderOrders() {
  const orders = window.gStore.getOrders();

  const listPending = document.getElementById('list-pending');
  const listCooking = document.getElementById('list-cooking');
  const listReady = document.getElementById('list-ready');

  const countPending = document.getElementById('count-pending');
  const countCooking = document.getElementById('count-cooking');
  const countReady = document.getElementById('count-ready');

  listPending.innerHTML = '';
  listCooking.innerHTML = '';
  listReady.innerHTML = '';

  let pCount = 0;
  let cCount = 0;
  let rCount = 0;

  orders.forEach(order => {
    if (order.status === 'delivered' || order.status === 'cancelled') return;

    const card = createOrderCard(order);

    if (order.status === 'pending') {
      listPending.appendChild(card);
      pCount++;
    } else if (order.status === 'cooking') {
      listCooking.appendChild(card);
      cCount++;
    } else if (order.status === 'ready') {
      listReady.appendChild(card);
      rCount++;
    }
  });

  countPending.textContent = pCount;
  countCooking.textContent = cCount;
  countReady.textContent = rCount;

  if (pCount === 0) {
    listPending.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 2rem 0; font-size: 0.85rem;">No hay pedidos pendientes</div>`;
  }
  if (cCount === 0) {
    listCooking.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 2rem 0; font-size: 0.85rem;">Cocina libre por el momento</div>`;
  }
  if (rCount === 0) {
    listReady.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 2rem 0; font-size: 0.85rem;">Ningún pedido pendiente de entrega</div>`;
  }
}

// Generate single order HTML card
function createOrderCard(order) {
  const div = document.createElement('div');
  div.className = `order-card ${order.status === 'pending' ? 'priority' : ''}`;

  const elapsedMinutes = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const timeText = elapsedMinutes <= 0 ? 'Ahora mismo' : `Hace ${elapsedMinutes} min`;

  const isDelivery = order.customer.type === 'delivery';
  const locationBadge = isDelivery 
    ? `Reparto: ${order.customer.address || 'Domicilio'}`
    : `${order.customer.table || 'Mesa General'}`;

  const paymentIcon = {
    bizum: 'Bizum',
    card: 'Tarjeta',
    paypal: 'PayPal'
  }[order.paymentMethod] || 'Efectivo';

  // Build items rows
  const itemsHtml = (order.items || []).map(item => `
    <div class="order-item-row">
      <span><span class="order-item-qty">${item.quantity}x</span> ${escapeHtml(item.name)}</span>
      <span style="color: var(--text-muted);">${(item.price * item.quantity).toFixed(2)} €</span>
    </div>
  `).join('');

  // Note block if present
  const noteHtml = order.note ? `<div class="order-note">Nota: ${escapeHtml(order.note)}</div>` : '';

  // Action buttons depending on status
  let actionButtons = '';
  if (order.status === 'pending') {
    actionButtons = `
      <button onclick="advanceOrderStatus('${order.id}', 'cooking')" class="btn btn-primary btn-sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z"></path></svg>
        A Cocina
      </button>
    `;
  } else if (order.status === 'cooking') {
    actionButtons = `
      <button onclick="advanceOrderStatus('${order.id}', 'ready')" class="btn btn-primary btn-sm" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Listo
      </button>
    `;
  } else if (order.status === 'ready') {
    actionButtons = `
      <button onclick="advanceOrderStatus('${order.id}', 'delivered')" class="btn btn-secondary btn-sm" style="border-color: rgba(139, 92, 246, 0.4); color: var(--status-delivered);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Entregado
      </button>
    `;
  }

  div.innerHTML = `
    <div class="order-top">
      <div>
        <span class="order-id">#${order.id}</span>
        <div class="order-customer-info">
          <strong>${escapeHtml(order.customer.name || 'Cliente')}</strong>
        </div>
      </div>
      <span class="order-time">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:3px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        ${timeText}
      </span>
    </div>

    <div style="display: flex; gap: 6px; margin-bottom: 0.6rem; flex-wrap: wrap;">
      <span class="order-tag">${locationBadge}</span>
      <span class="order-tag" style="color: var(--status-ready);">${paymentIcon} (Pagado)</span>
    </div>

    <div class="order-items-list">
      ${itemsHtml}
    </div>

    ${noteHtml}

    <div class="order-footer">
      <span class="order-price">${Number(order.total).toFixed(2)} €</span>
      <div class="order-actions">
        <button onclick="openChatDrawer('${order.id}', '${escapeHtml(order.customer.name || 'Cliente')}')" class="btn btn-secondary btn-sm" title="Contactar con cliente">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          Chat
        </button>
        ${actionButtons}
      </div>
    </div>
  `;

  return div;
}

// Advance status
window.advanceOrderStatus = function(orderId, newStatus) {
  window.gStore.updateOrderStatus(orderId, newStatus);
  showToast(`Pedido #${orderId} actualizado a estado '${newStatus}'`, 'info');
};

// Chat Drawer Logic
window.openChatDrawer = function(orderId, customerName) {
  activeChatOrderId = orderId;
  const drawer = document.getElementById('chat-drawer');
  document.getElementById('chat-order-title').textContent = `Chat con ${customerName}`;
  document.getElementById('chat-order-subtitle').textContent = `Comanda #${orderId}`;
  
  loadChatHistory(orderId);
  drawer.classList.add('open');
  document.getElementById('chat-input').focus();
};

window.closeChatDrawer = function() {
  const drawer = document.getElementById('chat-drawer');
  drawer.classList.remove('open');
  activeChatOrderId = null;
};

function loadChatHistory(orderId) {
  const container = document.getElementById('chat-messages');
  container.innerHTML = '';
  const messages = window.gStore.getOrderChat(orderId);

  if (messages.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-dim); font-size: 0.8rem; margin-top: 1rem;">No hay mensajes previos. Escribe para comunicarte con el cliente.</div>`;
  } else {
    messages.forEach(msg => appendChatMessage(msg));
  }
}

function appendChatMessage(msg) {
  const container = document.getElementById('chat-messages');
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
