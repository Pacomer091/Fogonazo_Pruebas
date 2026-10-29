/**
 * FOGONAZO OS - Native SQLite Database Layer
 * Capa de abstracción de datos multi-inquilino.
 * Importes monetarios estrictamente en céntimos (enteros).
 * Aislado para permitir portabilidad transparente a PostgreSQL / Supabase.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PaymentGatewayFactory } = require('./payment_gateway');

const DB_PATH = path.join(__dirname, 'fogon.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const SEED_PATH = path.join(__dirname, 'seed.sql');

// Subdominios reservados del sistema que no pueden registrarse como restaurantes
const RESERVED_SUBDOMAINS = new Set([
  'admin', 'www', 'api', 'app', 'mail', 'soporte', 'login', 'panel',
  'billing', 'static', 'cdn', 'test', 'dev', 'staging'
]);

// Limitador de tasa en memoria (máximo 10 pedidos por minuto por IP)
const rateLimitMap = new Map(); // ip -> [timestamps]

class FogonDatabase {
  constructor() {
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.initSchema();
  }

  initSchema() {
    const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    this.db.exec(sql);
  }

  initSeed() {
    if (fs.existsSync(SEED_PATH)) {
      const sql = fs.readFileSync(SEED_PATH, 'utf8');
      this.db.exec(sql);
    }
  }

  // --- 1. RESOLUCIÓN DE SUBDOMINIO & HOST SEGURO ---
  resolveTenantFromHost(hostHeader) {
    if (!hostHeader) return { type: 'root' };

    // Limpia puerto (ej. 'demo.localhost:8080' -> 'demo.localhost')
    const hostname = hostHeader.split(':')[0].toLowerCase();

    // Caso A: Raíz comercial (localhost, fogonazo.es, www.fogonazo.es, fogon.app)
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === 'fogonazo.es' ||
      hostname === 'www.fogonazo.es' ||
      hostname === 'fogon.app' ||
      hostname === 'www.fogon.app'
    ) {
      return { type: 'root' };
    }

    // Extrae subdominio
    let subdomain = null;
    if (hostname.endsWith('.localhost')) {
      subdomain = hostname.slice(0, -'.localhost'.length);
    } else if (hostname.endsWith('.fogonazo.es')) {
      subdomain = hostname.slice(0, -'.fogonazo.es'.length);
    } else if (hostname.endsWith('.fogon.app')) {
      subdomain = hostname.slice(0, -'.fogon.app'.length);
    } else {
      const parts = hostname.split('.');
      if (parts.length > 2) {
        subdomain = parts[0];
      }
    }

    // Caso B: Subdominio Superadmin ('admin.localhost', 'admin.fogonazo.es')
    if (subdomain === 'admin') {
      return { type: 'superadmin' };
    }

    // Caso C: Subdominio reservado
    if (subdomain && RESERVED_SUBDOMAINS.has(subdomain)) {
      return { type: 'reserved', subdomain };
    }

    // Caso D: Búsqueda de Restaurante por Subdominio
    let stmt;
    if (subdomain) {
      stmt = this.db.prepare('SELECT * FROM restaurantes WHERE slug = ?');
      const restaurant = stmt.get(subdomain);
      if (restaurant) {
        return {
          type: 'restaurant',
          subdomain,
          restaurant: {
            ...restaurant,
            is_active: Boolean(restaurant.activo),
            funciones: restaurant.funciones_json ? JSON.parse(restaurant.funciones_json) : {}
          }
        };
      }
    }

    // Búsqueda por dominio personalizado
    stmt = this.db.prepare('SELECT * FROM restaurantes WHERE dominio_personalizado = ?');
    const customRest = stmt.get(hostname);
    if (customRest) {
      return {
        type: 'restaurant',
        subdomain: customRest.slug,
        restaurant: {
          ...customRest,
          is_active: Boolean(customRest.activo),
          funciones: customRest.funciones_json ? JSON.parse(customRest.funciones_json) : {}
        }
      };
    }

    return { type: 'not_found', hostname, subdomain };
  }

  // --- 2. CARTA COMPLETA CON GRUPOS DE EXTRAS Y OPCIONES ---
  getMenuByRestaurant(restauranteId) {
    const catStmt = this.db.prepare(
      'SELECT * FROM categorias WHERE restaurante_id = ? AND activa = 1 ORDER BY orden ASC'
    );
    const categories = catStmt.all(restauranteId);

    const prodStmt = this.db.prepare(
      'SELECT * FROM productos WHERE restaurante_id = ? ORDER BY destacado DESC, nombre ASC'
    );
    const allProducts = prodStmt.all(restauranteId);

    const groupStmt = this.db.prepare(
      'SELECT * FROM grupos_opciones WHERE restaurante_id = ? ORDER BY orden ASC'
    );
    const allGroups = groupStmt.all(restauranteId);

    const optStmt = this.db.prepare(
      `SELECT op.* FROM opciones_producto op
       JOIN grupos_opciones go ON op.grupo_id = go.id
       WHERE go.restaurante_id = ?
       ORDER BY op.orden ASC`
    );
    const allOptions = optStmt.all(restauranteId);

    // Mapea grupos con sus opciones
    const groupsWithOpts = allGroups.map(grp => ({
      id: grp.id,
      producto_id: grp.producto_id,
      nombre: grp.nombre,
      obligatorio: Boolean(grp.obligatorio),
      max_seleccion: grp.max_seleccion,
      orden: grp.orden,
      opciones: allOptions
        .filter(opt => opt.grupo_id === grp.id)
        .map(opt => ({
          id: opt.id,
          nombre: opt.nombre,
          precio_extra_cents: opt.precio_extra_cents,
          disponible: Boolean(opt.disponible)
        }))
    }));

    // Mapea categorías con productos y sus grupos
    return categories.map(cat => ({
      id: cat.id,
      nombre: cat.nombre,
      orden: cat.orden,
      productos: allProducts
        .filter(p => p.categoria_id === cat.id)
        .map(p => ({
          id: p.id,
          nombre: p.nombre,
          descripcion: p.descripcion,
          precio_cents: p.precio_cents,
          imagen_url: p.imagen_url,
          disponible: Boolean(p.disponible),
          destacado: Boolean(p.destacado),
          alergenos: p.alergenos_json ? JSON.parse(p.alergenos_json) : [],
          grupos_opciones: groupsWithOpts.filter(g => g.producto_id === p.id)
        }))
    }));
  }

  // --- 3. VALIDACIÓN Y CÁLCULO SEGURO EN EL SERVIDOR (Céntimos y reglas de negocio) ---
  validateAndCalculateOrder(restauranteId, orderData, clientIp = '127.0.0.1') {
    // 3.1 Rate Limiting (Máx 10 pedidos por minuto por IP)
    const now = Date.now();
    const oneMinAgo = now - 60000;
    const timestamps = rateLimitMap.get(clientIp) || [];
    const validTimestamps = timestamps.filter(t => t > oneMinAgo);
    if (validTimestamps.length >= 10) {
      return {
        valid: false,
        error: 'Has superado el límite de pedidos por minuto. Por favor, espera un momento.'
      };
    }

    // 3.2 Protección contra doble envío (Idempotency key)
    if (orderData.idempotency_key) {
      const existing = this.db.prepare(
        'SELECT id, tracking_token FROM pedidos WHERE restaurante_id = ? AND idempotency_key = ?'
      ).get(restauranteId, orderData.idempotency_key);
      if (existing) {
        return {
          valid: false,
          isDuplicate: true,
          existingToken: existing.tracking_token,
          error: 'Esta comanda ya ha sido registrada previamente.'
        };
      }
    }

    // 3.3 Validación básica de items
    if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
      return { valid: false, error: 'La comanda debe contener al menos un plato.' };
    }

    // Carga restaurante para obtener pedido mínimo y gastos de envío
    const rest = this.db.prepare(
      'SELECT id, nombre, activo, servicio_abierto, pedido_minimo_cents, coste_envio_cents FROM restaurantes WHERE id = ?'
    ).get(restauranteId);

    if (!rest || !rest.activo) {
      return { valid: false, error: 'El restaurante no está disponible.' };
    }
    if (!rest.servicio_abierto) {
      return { valid: false, error: 'El restaurante tiene el servicio de pedidos pausado temporalmente.' };
    }

    let subtotalCents = 0;
    const verifiedLines = [];

    // 3.4 Validación plato por plato y sus extras
    for (const item of orderData.items) {
      const prodId = item.producto_id || item.id;
      if (!prodId) {
        return { valid: false, error: 'Falta el identificador del producto en una de las líneas.' };
      }

      // Cantidad entera positiva
      const qty = parseInt(item.cantidad, 10);
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
        return { valid: false, error: `Cantidad no válida para el producto ID ${prodId}. Debe ser un número entero entre 1 y 50.` };
      }

      // Validar que el producto pertenece al restaurante y está disponible
      const prod = this.db.prepare(
        'SELECT id, nombre, precio_cents, disponible FROM productos WHERE id = ? AND restaurante_id = ?'
      ).get(prodId, restauranteId);

      if (!prod) {
        return { valid: false, error: `El producto con ID '${prodId}' no pertenece a este restaurante.` };
      }
      if (!prod.disponible) {
        return { valid: false, error: `El plato '${prod.nombre}' está agotado en estos momentos.` };
      }

      // Validar grupos de opciones del producto
      const groups = this.db.prepare(
        'SELECT id, nombre, obligatorio, max_seleccion FROM grupos_opciones WHERE producto_id = ? AND restaurante_id = ?'
      ).all(prod.id, restauranteId);

      const selectedOptionIds = Array.isArray(item.opciones_seleccionadas)
        ? item.opciones_seleccionadas
        : (Array.isArray(item.opciones_ids) ? item.opciones_ids : []);
      let itemExtrasCents = 0;
      const verifiedExtrasDetail = [];

      for (const group of groups) {
        // Buscar qué opciones seleccionó el cliente para este grupo
        const groupOptions = this.db.prepare(
          'SELECT id, nombre, precio_extra_cents, disponible FROM opciones_producto WHERE grupo_id = ?'
        ).all(group.id);

        const groupOptionMap = new Map(groupOptions.map(o => [o.id, o]));
        const selectedInGroup = selectedOptionIds.filter(optId => groupOptionMap.has(optId));

        // Regla: Obligatorio
        if (group.obligatorio && selectedInGroup.length === 0) {
          return {
            valid: false,
            error: `Debes seleccionar una opción obligatoria para '${group.nombre}' en '${prod.nombre}'.`
          };
        }

        // Regla: Máximo de selección
        if (selectedInGroup.length > group.max_seleccion) {
          return {
            valid: false,
            error: `Has seleccionado ${selectedInGroup.length} opciones en '${group.nombre}', el máximo permitido es ${group.max_seleccion}.`
          };
        }

        // Validar cada opción seleccionada
        for (const optId of selectedInGroup) {
          const opt = groupOptionMap.get(optId);
          if (!opt.disponible) {
            return { valid: false, error: `La opción '${opt.nombre}' está agotada actualmente.` };
          }
          itemExtrasCents += opt.precio_extra_cents;
          verifiedExtrasDetail.push({
            grupo_id: group.id,
            grupo_nombre: group.nombre,
            opcion_id: opt.id,
            opcion_nombre: opt.nombre,
            precio_extra_cents: opt.precio_extra_cents
          });
        }
      }

      // Cálculo estricto de la línea en céntimos
      const unitTotalCents = prod.precio_cents + itemExtrasCents;
      const lineTotalCents = unitTotalCents * qty;
      subtotalCents += lineTotalCents;

      verifiedLines.push({
        producto_id: prod.id,
        nombre_producto: prod.nombre,
        precio_unitario_cents: prod.precio_cents,
        cantidad: qty,
        extras: verifiedExtrasDetail,
        total_linea_cents: lineTotalCents
      });
    }

    // 3.5 Validación de tipo de servicio y pedido mínimo
    const tipoServicio = orderData.tipo_servicio === 'delivery' ? 'delivery' : 'recogida';
    let gastosEnvioCents = 0;

    if (tipoServicio === 'delivery') {
      if (subtotalCents < rest.pedido_minimo_cents) {
        const minEur = (rest.pedido_minimo_cents / 100).toFixed(2);
        return {
          valid: false,
          error: `El pedido mínimo para entrega a domicilio es de ${minEur} €. Añade más platos para continuar.`
        };
      }
      gastosEnvioCents = rest.coste_envio_cents;
    }

    const totalCents = subtotalCents + gastosEnvioCents;

    return {
      valid: true,
      subtotalCents,
      gastosEnvioCents,
      totalCents,
      tipoServicio,
      verifiedLines
    };
  }

  // --- 4. NUMERACIÓN SECUENCIAL ATÓMICA POR RESTAURANTE ---
  getNextOrderNumber(restauranteId) {
    const row = this.db.prepare(
      'SELECT COALESCE(MAX(numero_comanda), 100) + 1 AS next_num FROM pedidos WHERE restaurante_id = ?'
    ).get(restauranteId);
    return row.next_num;
  }

  // --- 5. CREACIÓN ATÓMICA DE COMANDA ---
  async createOrder(restauranteId, orderData, clientIp = '127.0.0.1') {
    // 5.1 Valida y calcula en servidor
    const calc = this.validateAndCalculateOrder(restauranteId, orderData, clientIp);
    if (!calc.valid) {
      if (calc.isDuplicate && calc.existingToken) {
        return this.getOrderByTrackingToken(calc.existingToken);
      }
      throw new Error(calc.error);
    }

    // 5.2 Procesar pago a través de la pasarela intercambiable
    const paymentGateway = PaymentGatewayFactory.getGateway('demo');
    const paymentResult = await paymentGateway.processPayment({
      amountCents: calc.totalCents,
      currency: '€',
      orderId: 'pre_' + Date.now(),
      method: orderData.metodo_pago || 'tarjeta',
      details: orderData.detalles_pago || {}
    });

    if (!paymentResult.success) {
      throw new Error(`Error en pasarela de pago: ${paymentResult.error}`);
    }

    // 5.3 Generar identificadores seguros
    const pedidoId = 'ped_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    // Token aleatorio largo de 48 caracteres hexadecimales para seguimiento en URL
    const trackingToken = crypto.randomBytes(24).toString('hex');

    // 5.4 Inserción atómica en base de datos
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const numeroComanda = this.getNextOrderNumber(restauranteId);

      const stmtOrder = this.db.prepare(`
        INSERT INTO pedidos (
          id, restaurante_id, numero_comanda, tracking_token, tipo_servicio,
          direccion_entrega, cliente_nombre, cliente_telefono, cliente_email,
          notas_cliente, subtotal_cents, gastos_envio_cents, total_cents,
          metodo_pago, estado_pago, estado, idempotency_key, ip_cliente
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recibido', ?, ?)
      `);

      stmtOrder.run(
        pedidoId,
        restauranteId,
        numeroComanda,
        trackingToken,
        calc.tipoServicio,
        orderData.direccion_entrega || null,
        (orderData.cliente_nombre || 'Cliente').trim(),
        (orderData.cliente_telefono || '').trim(),
        (orderData.cliente_email || null),
        orderData.notas_cliente || null,
        calc.subtotalCents,
        calc.gastosEnvioCents,
        calc.totalCents,
        orderData.metodo_pago || 'tarjeta',
        'completado',
        orderData.idempotency_key || null,
        clientIp
      );

      const stmtLine = this.db.prepare(`
        INSERT INTO lineas_de_pedido (
          id, pedido_id, restaurante_id, producto_id, nombre_producto,
          precio_unitario_cents, cantidad, extras_json, total_linea_cents
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < calc.verifiedLines.length; i++) {
        const line = calc.verifiedLines[i];
        const lineId = `lin_${pedidoId}_${i + 1}`;
        stmtLine.run(
          lineId,
          pedidoId,
          restauranteId,
          line.producto_id,
          line.nombre_producto,
          line.precio_unitario_cents,
          line.cantidad,
          JSON.stringify(line.extras),
          line.total_linea_cents
        );
      }

      this.db.exec('COMMIT;');

      // Actualizar rate limiting map
      const timestamps = rateLimitMap.get(clientIp) || [];
      timestamps.push(Date.now());
      rateLimitMap.set(clientIp, timestamps);

      return {
        id: pedidoId,
        restaurante_id: restauranteId,
        numero_comanda: numeroComanda,
        tracking_token: trackingToken,
        tipo_servicio: calc.tipoServicio,
        cliente_nombre: (orderData.cliente_nombre || 'Cliente').trim(),
        cliente_telefono: (orderData.cliente_telefono || '').trim(),
        direccion_entrega: orderData.direccion_entrega || null,
        notas_cliente: orderData.notas_cliente || null,
        subtotal_cents: calc.subtotalCents,
        gastos_envio_cents: calc.gastosEnvioCents,
        total_cents: calc.totalCents,
        subtotal_formatted: (calc.subtotalCents / 100).toFixed(2).replace('.', ',') + ' €',
        gastos_envio_formatted: (calc.gastosEnvioCents / 100).toFixed(2).replace('.', ',') + ' €',
        total_formatted: (calc.totalCents / 100).toFixed(2).replace('.', ',') + ' €',
        estado: 'recibido',
        idempotency_key: orderData.idempotency_key || null,
        created_at: new Date().toISOString(),
        payment: paymentResult,
        lineas: calc.verifiedLines
      };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  // --- 6. SEGUIMIENTO POR TOKEN ALEATORIO LARGO ---
  getOrderByTrackingToken(token) {
    if (!token || typeof token !== 'string') return null;

    const stmt = this.db.prepare(`
      SELECT p.*, r.nombre AS restaurante_nombre, r.slug AS restaurante_slug,
             r.color_primario, r.color_secundario, r.telefono AS restaurante_telefono,
             r.moneda
      FROM pedidos p
      JOIN restaurantes r ON p.restaurante_id = r.id
      WHERE p.tracking_token = ?
    `);
    const order = stmt.get(token);
    if (!order) return null;

    const lineStmt = this.db.prepare(
      'SELECT * FROM lineas_de_pedido WHERE pedido_id = ? ORDER BY id ASC'
    );
    const lines = lineStmt.all(order.id).map(l => ({
      ...l,
      extras: l.extras_json ? JSON.parse(l.extras_json) : []
    }));

    return {
      ...order,
      subtotal_formatted: (order.subtotal_cents / 100).toFixed(2) + ' €',
      gastos_envio_formatted: (order.gastos_envio_cents / 100).toFixed(2) + ' €',
      total_formatted: (order.total_cents / 100).toFixed(2) + ' €',
      lineas: lines
    };
  }

  // --- 7. PANEL DE CONTROL RÁPIDO DE COMANDAS ---
  getOrdersByRestaurant(restauranteId) {
    const stmt = this.db.prepare(
      'SELECT * FROM pedidos WHERE restaurante_id = ? ORDER BY created_at DESC LIMIT 50'
    );
    const orders = stmt.all(restauranteId);

    const lineStmt = this.db.prepare(
      'SELECT * FROM lineas_de_pedido WHERE restaurante_id = ?'
    );
    const allLines = lineStmt.all(restauranteId);

    return orders.map(o => ({
      ...o,
      subtotal_formatted: (o.subtotal_cents / 100).toFixed(2) + ' €',
      gastos_envio_formatted: (o.gastos_envio_cents / 100).toFixed(2) + ' €',
      total_formatted: (o.total_cents / 100).toFixed(2) + ' €',
      lineas: allLines
        .filter(l => l.pedido_id === o.id)
        .map(l => ({ ...l, extras: l.extras_json ? JSON.parse(l.extras_json) : [] }))
    }));
  }

  updateOrderStatus(restauranteId, orderId, nuevoEstado) {
    const validStates = ['recibido', 'cocina', 'listo', 'entregado', 'cancelado'];
    if (!validStates.includes(nuevoEstado)) {
      throw new Error(`Estado no válido: ${nuevoEstado}`);
    }

    const stmt = this.db.prepare(
      'UPDATE pedidos SET estado = ? WHERE id = ? AND restaurante_id = ?'
    );
    const result = stmt.run(nuevoEstado, orderId, restauranteId);
    if (result.changes === 0) {
      throw new Error('Comanda no encontrada en este restaurante.');
    }

    // Devuelve el tracking token para notificar vía SSE
    const order = this.db.prepare('SELECT tracking_token, numero_comanda FROM pedidos WHERE id = ?').get(orderId);
    return order;
  }

  deleteOrder(restauranteId, orderId) {
    const order = this.db.prepare(
      'SELECT id, numero_comanda, tracking_token FROM pedidos WHERE id = ? AND restaurante_id = ?'
    ).get(orderId, restauranteId);

    if (!order) {
      throw new Error('Comanda no encontrada en este restaurante.');
    }

    this.db.exec('BEGIN TRANSACTION;');
    try {
      this.db.prepare('DELETE FROM mensajes_chat WHERE pedido_id = ?').run(orderId);
      this.db.prepare('DELETE FROM lineas_de_pedido WHERE pedido_id = ?').run(orderId);
      this.db.prepare('DELETE FROM pedidos WHERE id = ? AND restaurante_id = ?').run(orderId, restauranteId);
      this.db.exec('COMMIT;');
      return order;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  clearOrders(restauranteId, filter = 'all') {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      let ordersToDelete;
      if (filter === 'completed') {
        ordersToDelete = this.db.prepare(
          "SELECT id FROM pedidos WHERE restaurante_id = ? AND estado IN ('entregado', 'cancelado')"
        ).all(restauranteId);
      } else {
        ordersToDelete = this.db.prepare(
          "SELECT id FROM pedidos WHERE restaurante_id = ?"
        ).all(restauranteId);
      }

      for (const ord of ordersToDelete) {
        this.db.prepare('DELETE FROM mensajes_chat WHERE pedido_id = ?').run(ord.id);
        this.db.prepare('DELETE FROM lineas_de_pedido WHERE pedido_id = ?').run(ord.id);
        this.db.prepare('DELETE FROM pedidos WHERE id = ?').run(ord.id);
      }
      this.db.exec('COMMIT;');
      return { count: ordersToDelete.length };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }
}

// Singleton de base de datos
const db = new FogonDatabase();

module.exports = db;
