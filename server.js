/**
 * FOGÓN OS - Servidor Multi-Inquilino (Multi-Tenant)
 * Resuelve restaurantes a partir del subdominio de la petición (req.headers.host).
 * Todos los precios y cálculos se ejecutan estrictamente en el servidor.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Carga automática de variables de entorno desde .env si existe
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

const db = require('./db/db.js');

const PORT = process.env.PORT || 8080;

// Almacén de clientes Server-Sent Events (SSE) agrupados por restaurante_id
const sseClientsByTenant = new Map(); // tenantId -> Set of res objects

function broadcastToTenant(tenantId, data) {
  const clients = sseClientsByTenant.get(tenantId);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch (e) {
      clients.delete(client);
    }
  }
}

// Helpers para servir archivos estáticos y vistas
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function sendFile(res, filePath, contentType = 'text/html; charset=UTF-8', statusCode = 200) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (!res.headersSent) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
      }
      res.end('404 Not Found');
    } else {
      if (!res.headersSent) {
        res.writeHead(statusCode, { 'Content-Type': contentType });
      }
      res.end(content);
    }
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Servidor Principal
const server = http.createServer(async (req, res) => {
  const urlParts = req.url.split('?');
  const pathname = urlParts[0];

  // 1. Archivos estáticos comunes (CSS, JS, Imágenes)
  if (pathname.startsWith('/css/')) {
    const filePath = path.join(__dirname, pathname);
    return sendFile(res, filePath, 'text/css; charset=UTF-8');
  }
  if (pathname.startsWith('/js/')) {
    const publicPath = path.join(__dirname, 'public', pathname);
    const directPath = path.join(__dirname, pathname);
    const target = fs.existsSync(publicPath) ? publicPath : directPath;
    return sendFile(res, target, 'application/javascript; charset=UTF-8');
  }
  if (pathname.startsWith('/img/') || pathname.startsWith('/images/')) {
    const ext = path.extname(pathname).toLowerCase();
    const mime = MIME_TYPES[ext] || 'image/png';
    const filePath = path.join(__dirname, 'public', pathname);
    if (fs.existsSync(filePath)) {
      return sendFile(res, filePath, mime);
    }
  }

  // 2. Resolución estricta de inquilino desde el encabezado Host de la petición
  const tenantResolution = db.resolveTenantFromHost(req.headers.host);

  // ----------------------------------------------------
  // CASO A: RAÍZ COMERCIAL (fogon.app / localhost:8080)
  // ----------------------------------------------------
  if (tenantResolution.type === 'root') {
    if (pathname === '/' || pathname === '/index.html') {
      return sendFile(res, path.join(__dirname, 'views', 'landing.html'));
    }
    if (pathname === '/calculadora' || pathname === '/calculadora.html') {
      return sendFile(res, path.join(__dirname, 'views', 'calculadora.html'));
    }
    // Si desde la raíz quieren ir al superadmin o demo, se redirige o se sirve
    return sendFile(res, path.join(__dirname, 'views', '404.html'), 'text/html; charset=UTF-8', 404);
  }

  // ----------------------------------------------------
  // CASO B: SUPERADMIN HQ (admin.localhost:8080 / admin.fogon.app)
  // ----------------------------------------------------
  if (tenantResolution.type === 'superadmin') {
    // API: Lista de inquilinos
    if (pathname === '/api/admin/tenants' && req.method === 'GET') {
      return sendJson(res, 200, db.getAllRestaurants());
    }

    // API: Alta manual de restaurante
    if (pathname === '/api/admin/tenants' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const result = db.createRestaurantTenant(body);
        return sendJson(res, 201, result);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // API: Exportación de la base de datos SQL completa (para llevársela online a Supabase/PostgreSQL)
    if (pathname === '/api/admin/export-sql') {
      const sqlDump = db.exportSqlDump();
      res.writeHead(200, {
        'Content-Type': 'application/sql; charset=UTF-8',
        'Content-Disposition': 'attachment; filename="fogon_export.sql"'
      });
      return res.end(sqlDump);
    }

    // Vista Superadmin
    return sendFile(res, path.join(__dirname, 'views', 'superadmin.html'));
  }

  // ----------------------------------------------------
  // CASO C: SUBDOMINIO NO ENCONTRADO O RESERVADO
  // ----------------------------------------------------
  if (tenantResolution.type === 'not_found' || tenantResolution.type === 'reserved' || !tenantResolution.restaurant?.is_active) {
    return sendFile(res, path.join(__dirname, 'views', '404.html'), 'text/html; charset=UTF-8', 404);
  }

  // ----------------------------------------------------
  // CASO D: RESTAURANTE INQUILINO (demo, trattoria, etc.)
  // ----------------------------------------------------
  const currentRest = tenantResolution.restaurant;
  const restId = currentRest.id;

  // SSE: Canal de eventos en vivo para este restaurante
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(':\n\n'); // Ping inicial

    if (!sseClientsByTenant.has(restId)) {
      sseClientsByTenant.set(restId, new Set());
    }
    const clients = sseClientsByTenant.get(restId);
    clients.add(res);

    req.on('close', () => {
      clients.delete(res);
    });
    return;
  }

  // API RESTAURANTE: Crear Pedido Seguro (Precios calculados en backend)
  if (pathname === '/api/orders' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || '127.0.0.1';
      const newOrder = await db.createOrder(restId, body, clientIp);

      // Notifica al panel de cocina y al panel de control en tiempo real
      broadcastToTenant(restId, {
        type: 'new_order',
        order: newOrder,
        token: newOrder.tracking_token,
        numero: newOrder.numero_comanda
      });

      return sendJson(res, 201, newOrder);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // API RESTAURANTE: Consultar comanda activa por Token de seguimiento
  if (pathname.startsWith('/api/orders/track/') && req.method === 'GET') {
    const token = pathname.replace('/api/orders/track/', '');
    const order = db.getOrderByTrackingToken(token);
    if (!order || order.restaurante_id !== restId) {
      return sendJson(res, 404, { error: 'Comanda no encontrada' });
    }
    return sendJson(res, 200, order);
  }

  // API RESTAURANTE: Consultar comanda activa por ID interno
  if (pathname.startsWith('/api/orders/') && !pathname.includes('/chat') && !pathname.includes('/track/') && req.method === 'GET') {
    const orderId = pathname.replace('/api/orders/', '');
    const orders = db.getOrdersByRestaurant(restId);
    const order = orders.find(o => o.id === orderId);
    if (!order) return sendJson(res, 404, { error: 'Comanda no encontrada' });
    return sendJson(res, 200, order);
  }

  // API RESTAURANTE: Chat
  if (pathname.startsWith('/api/orders/') && pathname.endsWith('/chat')) {
    const orderId = pathname.split('/')[3];

    if (req.method === 'GET') {
      const stmt = db.db.prepare('SELECT * FROM mensajes_chat WHERE pedido_id = ? AND restaurante_id = ? ORDER BY created_at ASC');
      return sendJson(res, 200, stmt.all(orderId, restId));
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const msgId = 'msg_' + Date.now();
      const remitente = body.remitente || 'cliente';
      const stmt = db.db.prepare('INSERT INTO mensajes_chat (id, pedido_id, restaurante_id, remitente, texto) VALUES (?, ?, ?, ?, ?)');
      stmt.run(msgId, orderId, restId, remitente, body.texto);

      // Notifica vía SSE
      broadcastToTenant(restId, { type: 'chat_message', pedidoId: orderId, remitente, texto: body.texto });
      return sendJson(res, 201, { success: true });
    }
  }

  // API KDS / CONTROL: Obtener pedidos de la cocina
  if (pathname === '/api/admin/orders' && req.method === 'GET') {
    const orders = db.getOrdersByRestaurant(restId);
    return sendJson(res, 200, orders);
  }

  // API KDS / CONTROL: Actualizar estado de comanda
  if (pathname.startsWith('/api/admin/orders/') && pathname.endsWith('/status') && req.method === 'POST') {
    try {
      const orderId = pathname.split('/')[4];
      const body = await parseJsonBody(req);
      const updated = db.updateOrderStatus(restId, orderId, body.nuevoEstado);

      broadcastToTenant(restId, {
        type: 'order_status',
        pedidoId: orderId,
        estado: body.nuevoEstado,
        token: updated.tracking_token,
        numero: updated.numero_comanda
      });
      return sendJson(res, 200, { success: true, order: updated });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // API KDS / CONTROL: Limpiar pedidos en bloque (completados o todos)
  if (pathname === '/api/admin/orders/clear' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req).catch(() => ({}));
      const filter = body.filter || 'all';
      const result = db.clearOrders(restId, filter);

      broadcastToTenant(restId, {
        type: 'orders_cleared',
        filter: filter,
        count: result.count
      });

      return sendJson(res, 200, { success: true, count: result.count });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // API KDS / CONTROL: Borrar comanda individual (soporta DELETE y POST /delete)
  if (pathname.startsWith('/api/admin/orders/') && !pathname.endsWith('/status') && !pathname.endsWith('/clear')) {
    const isDelete = req.method === 'DELETE' || (req.method === 'POST' && pathname.endsWith('/delete'));
    if (isDelete) {
      try {
        const parts = pathname.replace('/delete', '').split('/');
        const orderId = parts[parts.length - 1];
        const deleted = db.deleteOrder(restId, orderId);

        broadcastToTenant(restId, {
          type: 'order_deleted',
          pedidoId: orderId,
          numero: deleted.numero_comanda,
          token: deleted.tracking_token
        });

        return sendJson(res, 200, { success: true, deletedId: orderId, numero: deleted.numero_comanda });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
  }

  // API KDS: Obtener productos para pausar stock
  if (pathname === '/api/admin/products' && req.method === 'GET') {
    const stmt = db.db.prepare('SELECT * FROM productos WHERE restaurante_id = ? ORDER BY nombre ASC');
    const prods = stmt.all(restId).map(p => ({ ...p, disponible: Boolean(p.disponible) }));
    return sendJson(res, 200, prods);
  }

  // API KDS: Pausar o reanudar plato en stock
  if (pathname.startsWith('/api/admin/products/') && pathname.endsWith('/stock') && req.method === 'POST') {
    const prodId = pathname.split('/')[4];
    const body = await parseJsonBody(req);
    db.toggleProductStock(restId, prodId, body.disponible);

    broadcastToTenant(restId, { type: 'product_stock', productoId: prodId, disponible: body.disponible });
    return sendJson(res, 200, { success: true });
  }

  // ----------------------------------------------------
  // VISTAS DEL INQUILINO
  // ----------------------------------------------------

  // 1. Panel de Control Rápido de Comandas (/control o /pedidos-admin)
  if (pathname === '/control' || pathname === '/pedidos-admin') {
    const controlTemplate = fs.readFileSync(path.join(__dirname, 'views', 'control.html'), 'utf8');
    const html = controlTemplate
      .replace(/{{RESTAURANTE_ID}}/g, currentRest.id)
      .replace(/{{RESTAURANTE_NOMBRE}}/g, currentRest.nombre)
      .replace(/{{RESTAURANTE_SLUG}}/g, currentRest.slug)
      .replace(/{{COLOR_PRIMARIO}}/g, currentRest.color_primario || '#ff5500')
      .replace(/{{COLOR_SECUNDARIO}}/g, currentRest.color_secundario || '#ff8c42');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    return res.end(html);
  }

  // 2. Pantalla de Seguimiento en Vivo para el Cliente (/pedido/:token o /seguimiento/:token)
  if (pathname.startsWith('/pedido/') || pathname.startsWith('/seguimiento/')) {
    const token = pathname.replace('/pedido/', '').replace('/seguimiento/', '');
    const order = db.getOrderByTrackingToken(token);
    if (!order || order.restaurante_id !== restId) {
      return sendFile(res, path.join(__dirname, 'views', '404.html'), 'text/html; charset=UTF-8', 404);
    }

    const trackingTemplate = fs.readFileSync(path.join(__dirname, 'views', 'seguimiento.html'), 'utf8');
    const html = trackingTemplate
      .replace(/{{RESTAURANTE_NOMBRE}}/g, currentRest.nombre)
      .replace(/{{COLOR_PRIMARIO}}/g, currentRest.color_primario || '#ff5500')
      .replace(/{{COLOR_SECUNDARIO}}/g, currentRest.color_secundario || '#ff8c42')
      .replace(/{{NUMERO_COMANDA}}/g, String(order.numero_comanda))
      .replace(/{{TIPO_SERVICIO}}/g, order.tipo_servicio === 'delivery' ? 'Entrega a domicilio' : 'Recogida en local')
      .replace(/{{DIRECCION_ENTREGA}}/g, order.direccion_entrega || 'Recogida en el local')
      .replace(/{{CLIENTE_NOMBRE}}/g, order.cliente_nombre)
      .replace(/{{CLIENTE_TELEFONO}}/g, order.cliente_telefono)
      .replace(/{{NOTAS_CLIENTE}}/g, order.notas_cliente || 'Sin notas especiales')
      .replace(/{{SUBTOTAL}}/g, order.subtotal_formatted)
      .replace(/{{GASTOS_ENVIO}}/g, order.gastos_envio_formatted)
      .replace(/{{TOTAL}}/g, order.total_formatted)
      .replace(/{{TRACKING_TOKEN}}/g, order.tracking_token)
      .replace(/{{ORDER_JSON}}/g, JSON.stringify(order));

    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    return res.end(html);
  }

  // 3. Panel de Cocina / KDS del restaurante (/gestion)
  if (pathname === '/gestion') {
    const kdsTemplate = fs.readFileSync(path.join(__dirname, 'views', 'kds.html'), 'utf8');
    const html = kdsTemplate
      .replace(/{{RESTAURANTE_ID}}/g, currentRest.id)
      .replace(/{{RESTAURANTE_NOMBRE}}/g, currentRest.nombre)
      .replace(/{{RESTAURANTE_SLUG}}/g, currentRest.slug)
      .replace(/{{COLOR_PRIMARIO}}/g, currentRest.color_primario || '#ff5500')
      .replace(/{{COLOR_SECUNDARIO}}/g, currentRest.color_secundario || '#ff8c42');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    return res.end(html);
  }

  // 4. Plantilla Única de Cliente (Carga dinámica de datos de este restaurante)
  if (pathname === '/' || pathname === '/index.html') {
    const template = fs.readFileSync(path.join(__dirname, 'views', 'restaurante.html'), 'utf8');
    const menuData = db.getMenuByRestaurant(restId);
    const minCents = currentRest.pedido_minimo_cents || 0;
    const shipCents = currentRest.coste_envio_cents || 0;

    const html = template
      .replace(/{{RESTAURANTE_ID}}/g, currentRest.id)
      .replace(/{{RESTAURANTE_NOMBRE}}/g, currentRest.nombre)
      .replace(/{{RESTAURANTE_SLUG}}/g, currentRest.slug)
      .replace(/{{RESTAURANTE_TAGLINE}}/g, currentRest.tagline || '')
      .replace(/{{BANNER_URL}}/g, currentRest.banner_url || '/img/banner-demo.jpg')
      .replace(/{{COLOR_PRIMARIO}}/g, currentRest.color_primario || '#ff5500')
      .replace(/{{COLOR_SECUNDARIO}}/g, currentRest.color_secundario || '#ff8c42')
      .replace(/{{MONEDA}}/g, currentRest.moneda || '€')
      .replace(/{{PEDIDO_MINIMO_CENTS}}/g, String(minCents))
      .replace(/{{COSTE_ENVIO_CENTS}}/g, String(shipCents))
      .replace(/{{PEDIDO_MINIMO_FORMATTED}}/g, (minCents / 100).toFixed(2).replace('.', ',') + ' €')
      .replace(/{{COSTE_ENVIO_FORMATTED}}/g, (shipCents / 100).toFixed(2).replace('.', ',') + ' €')
      .replace(/{{MENU_JSON}}/g, JSON.stringify(menuData));

    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    return res.end(html);
  }

  return sendFile(res, path.join(__dirname, 'views', '404.html'), 'text/html; charset=UTF-8', 404);
});

server.listen(PORT, () => {
  console.log(`[FOGON] Servidor Fogón OS activo en puerto ${PORT}`);
  console.log(`[FOGON] Raiz Comercial:  http://localhost:${PORT}/`);
  console.log(`[FOGON] Superadmin HQ:   http://admin.localhost:${PORT}/`);
  console.log(`[FOGON] Rest. Demo:      http://demo.localhost:${PORT}/`);
});
