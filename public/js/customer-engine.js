/**
 * FOGONAZO OS - Customer Engine (Mobile-First)
 * Maneja la carta por categorías, bottom sheets táctiles, carrito con pedido mínimo,
 * pago simulado, scroll horizontal de categorías fluido y seguimiento en tiempo real.
 */

let cart = []; // [{ id, nombre, precioBaseCents, cantidad, selectedOptions: [{ id, nombre, precioExtraCents }], uniqueKey }]
let currentServiceType = 'delivery'; // 'delivery' | 'recogida'
let selectedPayment = 'tarjeta';
let currentModalProd = null;
let currentModalQty = 1;
let currentModalSelectedOptions = new Map(); // groupId -> Set(optionIds)

// Formateador de céntimos a euros
function formatCents(cents) {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

document.addEventListener('DOMContentLoaded', () => {
  renderCategoryPills();
  renderMenu();
  updateCartUI();
  initCategoryScrollSpy();
});

// 1. RENDERIZADO DE PÍLDORAS DE CATEGORÍA
function renderCategoryPills() {
  const container = document.getElementById('cat-pills-container');
  if (!container) return;

  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'cat-btn active';
  allBtn.id = 'pill-all';
  allBtn.type = 'button';
  allBtn.textContent = 'Toda la Carta';
  allBtn.onclick = () => scrollToCat('all', allBtn);
  container.appendChild(allBtn);

  MENU_DATA.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.id = `pill-cat-${cat.id}`;
    btn.type = 'button';
    btn.textContent = cat.nombre;
    btn.onclick = () => scrollToCat(cat.id, btn);
    container.appendChild(btn);
  });
}

function scrollToCat(catId, btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  if (catId === 'all') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    const el = document.getElementById(`cat-sec-${catId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

// Scroll spy para resaltar la categoría visible al hacer scroll
function initCategoryScrollSpy() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const catId = entry.target.id.replace('cat-sec-', '');
        const targetBtn = document.getElementById(`pill-cat-${catId}`);
        if (targetBtn) {
          document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
          targetBtn.classList.add('active');
          targetBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    });
  }, {
    rootMargin: '-100px 0px -60% 0px',
    threshold: 0
  });

  document.querySelectorAll('.category-section-block').forEach(sec => {
    observer.observe(sec);
  });
}

// 2. BUSCADOR EN VIVO FLUIDO
function handleSearch(val) {
  const query = (val || '').toLowerCase().trim();
  renderMenu(query);
}

// 3. RENDERIZADO DE LA CARTA POR CATEGORÍAS
function renderMenu(searchQuery = '') {
  const container = document.getElementById('menu-sections-container');
  if (!container) return;

  container.innerHTML = '';

  let totalRendered = 0;

  MENU_DATA.forEach(cat => {
    let prods = cat.productos || [];

    if (searchQuery) {
      prods = prods.filter(p =>
        p.nombre.toLowerCase().includes(searchQuery) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(searchQuery))
      );
    }

    if (prods.length === 0) return;
    totalRendered += prods.length;

    const catBlock = document.createElement('div');
    catBlock.className = 'category-section-block';
    catBlock.id = `cat-sec-${cat.id}`;

    const title = document.createElement('h2');
    title.className = 'category-title';
    title.textContent = cat.nombre;
    catBlock.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'dishes-grid';

    prods.forEach(prod => {
      const card = document.createElement('div');
      card.className = 'dish-card';
      card.onclick = () => openDishModal(prod);

      const hasExtras = prod.grupos_opciones && prod.grupos_opciones.length > 0;
      const btnText = hasExtras ? 'Elegir' : '+ Añadir';

      card.innerHTML = `
        <div class="dish-info">
          <div>
            <h3 class="dish-name">${prod.nombre}</h3>
            <p class="dish-desc">${prod.descripcion || ''}</p>
          </div>
          <div class="dish-bottom">
            <span class="dish-price">${formatCents(prod.precio_cents)}</span>
            <button class="btn-add-dish" type="button" onclick="event.stopPropagation(); openDishModal(window.getProdById('${prod.id}'))">
              <span>${btnText}</span>
            </button>
          </div>
        </div>
        ${prod.imagen_url ? `
          <div class="dish-image-wrap">
            <img src="${prod.imagen_url}" alt="${prod.nombre}" class="dish-img" loading="lazy" width="90" height="90">
          </div>
        ` : ''}
      `;

      grid.appendChild(card);
    });

    catBlock.appendChild(grid);
    container.appendChild(catBlock);
  });

  if (totalRendered === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted);">
        <p style="font-weight:800; font-size:1.1rem; color:var(--text-main); margin:0 0 6px 0;">Sin resultados</p>
        <span style="font-size:0.9rem;">No hay platos que coincidan con "${searchQuery}".</span>
      </div>
    `;
  }
}

// Helper para buscar producto por ID
window.getProdById = function(prodId) {
  for (const cat of MENU_DATA) {
    for (const p of cat.productos) {
      if (p.id === prodId) return p;
    }
  }
  return null;
};

// 4. MODAL / BOTTOM SHEET DE PERSONALIZACIÓN DEL PLATO
function openDishModal(prod) {
  if (!prod) return;
  currentModalProd = prod;
  currentModalQty = 1;
  currentModalSelectedOptions.clear();

  document.getElementById('modal-dish-name').textContent = prod.nombre;
  document.getElementById('modal-dish-desc').textContent = prod.descripcion || '';
  document.getElementById('modal-qty').textContent = '1';

  const groupsContainer = document.getElementById('modal-groups-container');
  groupsContainer.innerHTML = '';

  const groups = prod.grupos_opciones || [];

  if (groups.length === 0) {
    groupsContainer.innerHTML = '<div style="font-size:0.85rem; color:var(--text-muted); padding:6px 0;">Este plato se prepara con su receta artesanal estándar.</div>';
  } else {
    groups.forEach(group => {
      const box = document.createElement('div');
      box.className = 'opt-group-box';

      const isSingleChoice = group.max_seleccion === 1;
      const reqTag = group.obligatorio
        ? '<span class="opt-req-tag required">Obligatorio</span>'
        : `<span class="opt-req-tag optional">Opcional (máx ${group.max_seleccion})</span>`;

      box.innerHTML = `
        <div class="opt-group-header">
          <h4 class="opt-group-title">${group.nombre}</h4>
          ${reqTag}
        </div>
        <div class="opt-list" id="opt-list-${group.id}"></div>
      `;

      const list = box.querySelector(`#opt-list-${group.id}`);

      // Auto-seleccionar primera opción si es obligatoria y de selección única
      if (group.obligatorio && isSingleChoice && group.opciones.length > 0) {
        currentModalSelectedOptions.set(group.id, new Set([group.opciones[0].id]));
      } else {
        currentModalSelectedOptions.set(group.id, new Set());
      }

      group.opciones.forEach(opt => {
        const row = document.createElement('label');
        const isChecked = currentModalSelectedOptions.get(group.id).has(opt.id);
        row.className = `opt-label-row ${isChecked ? 'selected' : ''}`;
        row.id = `opt-label-${opt.id}`;

        const priceText = opt.precio_extra_cents > 0 ? `+${formatCents(opt.precio_extra_cents)}` : 'Incluido';
        const inputType = isSingleChoice ? 'radio' : 'checkbox';

        row.innerHTML = `
          <div style="display:flex; align-items:center;">
            <input type="${inputType}" class="opt-input-ctrl" name="grp_${group.id}" value="${opt.id}" ${isChecked ? 'checked' : ''} onchange="handleOptionToggle('${group.id}', '${opt.id}', ${isSingleChoice}, ${group.max_seleccion})">
            <span>${opt.nombre}</span>
          </div>
          <strong style="font-size:0.85rem; color:${opt.precio_extra_cents > 0 ? 'var(--brand-orange)' : 'var(--text-muted)'}; white-space:nowrap;">${priceText}</strong>
        `;

        list.appendChild(row);
      });

      groupsContainer.appendChild(box);
    });
  }

  updateModalPrice();
  
  // Bloquear scroll de fondo y abrir bottom sheet
  document.body.classList.add('modal-open');
  document.getElementById('dish-modal').classList.add('open');
}

function closeDishModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('dish-modal').classList.remove('open');
}

function handleOverlayClick(e, modalId) {
  if (e.target.id === modalId) {
    if (modalId === 'dish-modal') closeDishModal();
    if (modalId === 'checkout-modal') closeCheckoutModal();
  }
}

function handleOptionToggle(groupId, optId, isSingleChoice, maxSelection) {
  const currentSet = currentModalSelectedOptions.get(groupId) || new Set();

  if (isSingleChoice) {
    currentSet.clear();
    currentSet.add(optId);

    // Actualiza estilo visual de la fila
    document.querySelectorAll(`input[name="grp_${groupId}"]`).forEach(inp => {
      const lbl = document.getElementById(`opt-label-${inp.value}`);
      if (lbl) lbl.classList.toggle('selected', inp.value === optId);
    });
  } else {
    if (currentSet.has(optId)) {
      currentSet.delete(optId);
      document.getElementById(`opt-label-${optId}`)?.classList.remove('selected');
    } else {
      if (currentSet.size >= maxSelection) {
        showToast(`Solo puedes seleccionar hasta ${maxSelection} opciones para este grupo.`, 'error');
        const chk = document.querySelector(`input[name="grp_${groupId}"][value="${optId}"]`);
        if (chk) chk.checked = false;
        return;
      }
      currentSet.add(optId);
      document.getElementById(`opt-label-${optId}`)?.classList.add('selected');
    }
  }

  currentModalSelectedOptions.set(groupId, currentSet);
  updateModalPrice();
}

function changeModalQty(delta) {
  currentModalQty = Math.max(1, Math.min(20, currentModalQty + delta));
  document.getElementById('modal-qty').textContent = currentModalQty;
  updateModalPrice();
}

function updateModalPrice() {
  if (!currentModalProd) return;

  let unitCents = currentModalProd.precio_cents;

  (currentModalProd.grupos_opciones || []).forEach(group => {
    const selected = currentModalSelectedOptions.get(group.id) || new Set();
    group.opciones.forEach(opt => {
      if (selected.has(opt.id)) {
        unitCents += opt.precio_extra_cents;
      }
    });
  });

  const totalCents = unitCents * currentModalQty;
  document.getElementById('modal-add-price').textContent = formatCents(totalCents);
}

function confirmAddDishToCart() {
  if (!currentModalProd) return;

  // Validar grupos obligatorios
  const groups = currentModalProd.grupos_opciones || [];
  for (const group of groups) {
    const selected = currentModalSelectedOptions.get(group.id) || new Set();
    if (group.obligatorio && selected.size === 0) {
      showToast(`Debes elegir una opción para "${group.nombre}"`, 'error');
      return;
    }
  }

  // Recolectar opciones seleccionadas
  const chosenOptions = [];
  groups.forEach(group => {
    const selected = currentModalSelectedOptions.get(group.id) || new Set();
    group.opciones.forEach(opt => {
      if (selected.has(opt.id)) {
        chosenOptions.push({
          id: opt.id,
          nombre: opt.nombre,
          precioExtraCents: opt.precio_extra_cents
        });
      }
    });
  });

  // Generar clave única de item en carrito para agrupar idénticos
  chosenOptions.sort((a, b) => a.id.localeCompare(b.id));
  const uniqueKey = currentModalProd.id + '__' + chosenOptions.map(o => o.id).join('_');

  const existing = cart.find(item => item.uniqueKey === uniqueKey);
  if (existing) {
    existing.cantidad += currentModalQty;
  } else {
    cart.push({
      id: currentModalProd.id,
      nombre: currentModalProd.nombre,
      precioBaseCents: currentModalProd.precio_cents,
      cantidad: currentModalQty,
      selectedOptions: chosenOptions,
      uniqueKey
    });
  }

  closeDishModal();
  updateCartUI();
  showToast(`¡Añadido! ${currentModalProd.nombre}`);
}

// 5. GESTIÓN DEL CARRITO (CÁLCULO EN CÉNTIMOS Y PEDIDO MÍNIMO)
function setServiceType(type) {
  currentServiceType = type === 'recogida' ? 'recogida' : 'delivery';

  // Sincronizar en desktop
  document.getElementById('btn-service-delivery')?.classList.toggle('active', currentServiceType === 'delivery');
  document.getElementById('btn-service-takeaway')?.classList.toggle('active', currentServiceType === 'recogida');

  // Sincronizar en modal móvil
  document.getElementById('modal-btn-delivery')?.classList.toggle('active', currentServiceType === 'delivery');
  document.getElementById('modal-btn-takeaway')?.classList.toggle('active', currentServiceType === 'recogida');

  const addrGroup = document.getElementById('checkout-address-group');
  if (addrGroup) {
    addrGroup.style.display = currentServiceType === 'delivery' ? 'block' : 'none';
  }

  updateCartUI();
}

function updateCartQty(uniqueKey, delta) {
  const idx = cart.findIndex(i => i.uniqueKey === uniqueKey);
  if (idx === -1) return;

  cart[idx].cantidad += delta;
  if (cart[idx].cantidad <= 0) {
    cart.splice(idx, 1);
  }

  updateCartUI();
}

function updateCartUI() {
  const totalCount = cart.reduce((sum, item) => sum + item.cantidad, 0);

  // Subtotal en céntimos enteros
  let subtotalCents = 0;
  cart.forEach(item => {
    const extrasSum = item.selectedOptions.reduce((s, o) => s + o.precioExtraCents, 0);
    subtotalCents += (item.precioBaseCents + extrasSum) * item.cantidad;
  });

  // Gastos de envío
  const shippingCents = currentServiceType === 'delivery' && totalCount > 0
    ? RESTAURANTE.costeEnvioCents
    : 0;

  const totalCents = subtotalCents + shippingCents;

  // Validación de pedido mínimo para domicilio
  const minRequiredCents = RESTAURANTE.pedidoMinimoCents;
  const isDelivery = currentServiceType === 'delivery';
  const minReached = !isDelivery || (subtotalCents >= minRequiredCents);

  // 1. Elementos del carrito Desktop
  const countEl = document.getElementById('desktop-cart-count');
  if (countEl) countEl.textContent = `${totalCount} plato${totalCount === 1 ? '' : 's'}`;

  const desktopItemsContainer = document.getElementById('desktop-cart-items');
  if (desktopItemsContainer) {
    if (cart.length === 0) {
      desktopItemsContainer.innerHTML = `
        <div style="text-align:center; padding:2rem 0; color:var(--text-muted); font-size:0.85rem;">
          Tu cesta está vacía.<br>Selecciona platos de la carta.
        </div>
      `;
    } else {
      desktopItemsContainer.innerHTML = cart.map(item => {
        const extrasSum = item.selectedOptions.reduce((s, o) => s + o.precioExtraCents, 0);
        const lineTotal = (item.precioBaseCents + extrasSum) * item.cantidad;
        const extrasText = item.selectedOptions.map(o => o.nombre).join(', ');

        return `
          <div class="cart-item-row">
            <div style="flex:1; min-width:0;">
              <strong style="color:var(--text-main); font-size:0.92rem;">${item.nombre}</strong>
              ${extrasText ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">+ ${extrasText}</div>` : ''}
              <div class="cart-qty-ctrl">
                <button type="button" class="btn-qty" onclick="updateCartQty('${item.uniqueKey}', -1)">&minus;</button>
                <span style="font-size:0.9rem; font-weight:800; min-width:20px; text-align:center;">${item.cantidad}</span>
                <button type="button" class="btn-qty" onclick="updateCartQty('${item.uniqueKey}', 1)">&plus;</button>
              </div>
            </div>
            <strong style="font-size:0.92rem; color:var(--text-main); margin-left:8px;">${formatCents(lineTotal)}</strong>
          </div>
        `;
      }).join('');
    }
  }

  // 2. Elementos del carrito Modal Móvil
  const modalItemsContainer = document.getElementById('modal-cart-items-list');
  if (modalItemsContainer) {
    if (cart.length === 0) {
      modalItemsContainer.innerHTML = `
        <div style="text-align:center; padding:1.25rem 0; color:var(--text-muted); font-size:0.88rem;">
          Tu cesta está vacía. Añade hamburguesas o entrantes de la carta.
        </div>
      `;
    } else {
      modalItemsContainer.innerHTML = cart.map(item => {
        const extrasSum = item.selectedOptions.reduce((s, o) => s + o.precioExtraCents, 0);
        const lineTotal = (item.precioBaseCents + extrasSum) * item.cantidad;
        const extrasText = item.selectedOptions.map(o => o.nombre).join(', ');

        return `
          <div class="cart-item-row" style="background:#ffffff; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
            <div style="flex:1; min-width:0;">
              <strong style="color:var(--text-main); font-size:0.95rem;">${item.nombre}</strong>
              ${extrasText ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">+ ${extrasText}</div>` : ''}
              <div class="cart-qty-ctrl" style="margin-top:6px;">
                <button type="button" class="btn-qty" onclick="updateCartQty('${item.uniqueKey}', -1)">&minus;</button>
                <span style="font-size:0.95rem; font-weight:800; min-width:24px; text-align:center;">${item.cantidad}</span>
                <button type="button" class="btn-qty" onclick="updateCartQty('${item.uniqueKey}', 1)">&plus;</button>
              </div>
            </div>
            <strong style="font-size:0.95rem; color:var(--text-main);">${formatCents(lineTotal)}</strong>
          </div>
        `;
      }).join('');
    }
  }

  // 3. Totales Desktop
  document.getElementById('desktop-subtotal')?.replaceChildren(document.createTextNode(formatCents(subtotalCents)));
  document.getElementById('desktop-shipping')?.replaceChildren(document.createTextNode(formatCents(shippingCents)));
  const shipRow = document.getElementById('desktop-delivery-row');
  if (shipRow) shipRow.style.display = isDelivery ? 'flex' : 'none';
  document.getElementById('desktop-total')?.replaceChildren(document.createTextNode(formatCents(totalCents)));
  document.getElementById('desktop-btn-total')?.replaceChildren(document.createTextNode(formatCents(totalCents)));
  const btnDesktopCheckout = document.getElementById('btn-desktop-checkout');
  if (btnDesktopCheckout) btnDesktopCheckout.disabled = !(totalCount > 0 && minReached);

  // 4. Mínimo Alert Box Desktop & Modal
  const updateMinBox = (boxId, diffId, fillId) => {
    const box = document.getElementById(boxId);
    const diffEl = document.getElementById(diffId);
    const fillEl = document.getElementById(fillId);
    if (!box) return;

    if (!isDelivery || totalCount === 0) {
      box.style.display = 'none';
    } else {
      box.style.display = 'block';
      if (subtotalCents >= minRequiredCents) {
        if (diffEl) {
          diffEl.textContent = '¡Mínimo alcanzado!';
          diffEl.style.color = '#059669';
        }
        if (fillEl) {
          fillEl.style.width = '100%';
          fillEl.style.background = '#10b981';
        }
      } else {
        const diff = minRequiredCents - subtotalCents;
        if (diffEl) {
          diffEl.textContent = `Faltan ${formatCents(diff)}`;
          diffEl.style.color = '#ea580c';
        }
        const pct = Math.min(100, Math.round((subtotalCents / minRequiredCents) * 100));
        if (fillEl) {
          fillEl.style.width = pct + '%';
          fillEl.style.background = 'var(--brand-orange)';
        }
      }
    }
  };

  updateMinBox('min-order-box', 'min-order-diff', 'min-order-fill');
  updateMinBox('modal-min-order-box', 'modal-min-diff', 'modal-min-fill');

  // 5. Barra inferior flotante móvil (SIEMPRE VISIBLE)
  const mobileCount = document.getElementById('mobile-badge-count');
  const mobileLabel = document.getElementById('mobile-cart-btn-label');
  const mobileTotal = document.getElementById('mobile-btn-total');
  const mobileBtn = document.getElementById('btn-mobile-checkout');

  if (mobileCount) mobileCount.textContent = totalCount;
  if (mobileLabel) mobileLabel.textContent = `Ver pedido (${totalCount})`;
  if (mobileTotal) mobileTotal.textContent = formatCents(totalCents);
  
  if (mobileBtn) {
    mobileBtn.disabled = totalCount === 0;
  }

  // 6. Totales en Modal
  document.getElementById('modal-subtotal-val')?.replaceChildren(document.createTextNode(formatCents(subtotalCents)));
  document.getElementById('modal-shipping-val')?.replaceChildren(document.createTextNode(formatCents(shippingCents)));
  const mShipRow = document.getElementById('modal-shipping-row');
  if (mShipRow) mShipRow.style.display = isDelivery ? 'flex' : 'none';
  document.getElementById('modal-total-val')?.replaceChildren(document.createTextNode(formatCents(totalCents)));

  const btnSubmitOrder = document.getElementById('btn-submit-order');
  if (btnSubmitOrder) {
    btnSubmitOrder.disabled = !(totalCount > 0 && minReached);
  }
}

// 6. MODAL / BOTTOM SHEET DE TRAMITACIÓN Y PAGO
function openCheckoutModal() {
  document.body.classList.add('modal-open');
  document.getElementById('checkout-modal').classList.add('open');
}

function closeCheckoutModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('checkout-modal').classList.remove('open');
}

function setPaymentMethod(method) {
  selectedPayment = method;
  ['card', 'bizum', 'cash'].forEach(m => {
    const btn = document.getElementById(`pay-btn-${m}`);
    if (btn) btn.classList.remove('active');
  });

  const activeBtn = method === 'tarjeta' ? 'pay-btn-card'
    : method === 'bizum' ? 'pay-btn-bizum'
    : 'pay-btn-cash';
  document.getElementById(activeBtn)?.classList.add('active');
}

// 7. ENVÍO DEL PEDIDO CON VALIDACIÓN DE FORMULARIO
async function handleFormCheckout(e) {
  e.preventDefault();

  if (cart.length === 0) {
    showToast('Tu cesta está vacía. Añade algún plato para pedir.', 'error');
    return;
  }

  const nameInput = document.getElementById('cust-name');
  const phoneInput = document.getElementById('cust-phone');
  const addrInput = document.getElementById('cust-address');

  const clienteNombre = nameInput.value.trim();
  const clienteTelefono = phoneInput.value.trim();
  const direccionEntrega = currentServiceType === 'delivery' ? addrInput.value.trim() : null;
  const notasCliente = document.getElementById('cust-notes').value.trim();

  // Validación básica visual
  let hasError = false;
  if (!clienteNombre) {
    document.getElementById('err-cust-name').style.display = 'block';
    hasError = true;
  } else {
    document.getElementById('err-cust-name').style.display = 'none';
  }

  if (!clienteTelefono) {
    document.getElementById('err-cust-phone').style.display = 'block';
    hasError = true;
  } else {
    document.getElementById('err-cust-phone').style.display = 'none';
  }

  if (currentServiceType === 'delivery' && !direccionEntrega) {
    document.getElementById('err-cust-address').style.display = 'block';
    hasError = true;
  } else {
    document.getElementById('err-cust-address').style.display = 'none';
  }

  if (hasError) return;

  const btn = document.getElementById('btn-submit-order');
  btn.disabled = true;
  btn.innerHTML = '<span>Validando comanda en el servidor...</span>';

  // Clave de idempotencia única
  const idempotencyKey = 'idemp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  const payload = {
    tipo_servicio: currentServiceType,
    cliente_nombre: clienteNombre,
    cliente_telefono: clienteTelefono,
    direccion_entrega: direccionEntrega,
    notas_cliente: notasCliente,
    metodo_pago: selectedPayment,
    idempotency_key: idempotencyKey,
    items: cart.map(item => ({
      id: item.id,
      cantidad: item.cantidad,
      opciones_ids: item.selectedOptions.map(o => o.id)
    }))
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Error al procesar el pedido.');
    }

    cart = [];
    updateCartUI();
    closeCheckoutModal();

    showToast('¡Comanda aceptada! Abriendo seguimiento...');

    setTimeout(() => {
      window.location.href = `/pedido/${data.tracking_token}`;
    }, 350);

  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = '<span>Confirmar y Enviar Pedido</span>';
    showToast(err.message, 'error');
  }
}

// 8. NOTIFICACIONES TOAST
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// Auto-open para inspección visual y capturas
try {
  const urlParams = new URLSearchParams(window.location.search);
  const openModalType = urlParams.get('modal');
  if (openModalType === 'dish' && MENU_DATA && MENU_DATA[0] && MENU_DATA[0].productos[0]) {
    setTimeout(() => openDishModal(MENU_DATA[0].productos[0]), 80);
  } else if (openModalType === 'checkout' && MENU_DATA && MENU_DATA[0] && MENU_DATA[0].productos[0]) {
    const p = MENU_DATA[0].productos[0];
    cart.push({
      id: p.id,
      nombre: p.nombre,
      precioBaseCents: p.precio_cents,
      cantidad: 1,
      selectedOptions: [{ id: 'opt_b1_p1', nombre: 'Al punto con costra crujiente', precioExtraCents: 0 }, { id: 'opt_b1_e1', nombre: 'Bacon crujiente caramelizado', precioExtraCents: 120 }],
      uniqueKey: 'cart_preview_sample'
    });
    updateCartUI();
    setTimeout(() => openCheckoutModal(), 80);
  }
} catch (_) {}
