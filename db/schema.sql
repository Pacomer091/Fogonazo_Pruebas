-- ====================================================================
-- FOGONAZO OS - Esquema Relacional Multi-Inquilino Profesional
-- Diseñado con tipos compatibles con SQLite y exportable a PostgreSQL
-- Todos los importes financieros se almacenan en CÉNTIMOS (ENTEROS)
-- ====================================================================

-- 1. TABLA: RESTAURANTES (Inquilinos)
CREATE TABLE IF NOT EXISTS restaurantes (
  id TEXT PRIMARY KEY,                           -- UUID / ID único (ej. 'rest_demo')
  slug TEXT UNIQUE NOT NULL,                     -- Subdominio (ej. 'demo', 'trattoria')
  dominio_personalizado TEXT UNIQUE,             -- Dominio propio opcional (ej. 'pedidos.mibar.com')
  nombre TEXT NOT NULL,                          -- Nombre comercial (ej. 'La Fogoneta Smash Burgers')
  tagline TEXT,                                  -- Subtítulo / especialidad
  logo_url TEXT,                                 -- URL del logotipo
  color_primario TEXT DEFAULT '#ff5500',         -- Color corporativo Fogonazo / marca
  color_secundario TEXT DEFAULT '#ff7a00',       -- Color secundario o gradiente
  telefono TEXT,                                 -- Teléfono de contacto
  email_contacto TEXT,                           -- Email de contacto
  direccion TEXT,                                -- Dirección física
  activo INTEGER DEFAULT 1,                      -- 1 = Activo, 0 = Suspendido
  moneda TEXT DEFAULT '€',                       -- Símbolo de moneda
  pedido_minimo_cents INTEGER DEFAULT 1200,      -- Pedido mínimo en céntimos (12.00 €)
  coste_envio_cents INTEGER DEFAULT 250,         -- Coste de envío base en céntimos (2.50 €)
  servicio_abierto INTEGER DEFAULT 1,            -- 1 = Abierto recibiendo comandas, 0 = Pausado
  funciones_json TEXT DEFAULT '{"delivery":true,"takeaway":true,"bizum":true,"tarjeta":true}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA: HORARIOS DEL RESTAURANTE
CREATE TABLE IF NOT EXISTS horarios (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT NOT NULL,
  dia_semana INTEGER NOT NULL,                   -- 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  hora_apertura TEXT NOT NULL,                   -- '12:30'
  hora_cierre TEXT NOT NULL,                     -- '23:30'
  activo INTEGER DEFAULT 1,
  FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- 3. TABLA: USUARIOS CON ROL
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT,                           -- NULL = Superadmin de Fogonazo
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL,                             -- 'superadmin', 'admin', 'cocina', 'reparto'
  activo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- 4. TABLA: ZONAS DE REPARTO
CREATE TABLE IF NOT EXISTS zonas_de_reparto (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT NOT NULL,
  nombre_zona TEXT NOT NULL,
  codigo_postal TEXT,
  coste_envio_cents INTEGER DEFAULT 250,
  pedido_minimo_cents INTEGER DEFAULT 1500,
  activa INTEGER DEFAULT 1,
  FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- 5. TABLA: CATEGORÍAS DE LA CARTA
CREATE TABLE IF NOT EXISTS categorias (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  orden INTEGER DEFAULT 0,
  activa INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- 6. TABLA: PRODUCTOS / PLATOS (Precio base en céntimos)
CREATE TABLE IF NOT EXISTS productos (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT NOT NULL,
  categoria_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_cents INTEGER NOT NULL,                 -- En céntimos enteros (ej. 1150 = 11,50 €)
  imagen_url TEXT,
  disponible INTEGER DEFAULT 1,                  -- 1 = Disponible, 0 = Pausado / Agotado
  destacado INTEGER DEFAULT 0,                   -- 1 = Recomendado / Top ventas
  alergenos_json TEXT DEFAULT '[]',              -- Array JSON: '["gluten","lacteos"]'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
);

-- 7. TABLA: GRUPOS DE OPCIONES / EXTRAS DEL PLATO
CREATE TABLE IF NOT EXISTS grupos_opciones (
  id TEXT PRIMARY KEY,
  producto_id TEXT NOT NULL,
  restaurante_id TEXT NOT NULL,
  nombre TEXT NOT NULL,                          -- Ej. 'Punto de la carne', 'Extras', 'Salsa'
  obligatorio INTEGER DEFAULT 0,                 -- 1 = Obligatorio (min 1), 0 = Opcional
  max_seleccion INTEGER DEFAULT 1,               -- 1 = Radio button único, >1 = Checkboxes
  orden INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- 8. TABLA: OPCIONES ESPECÍFICAS DENTRO DEL GRUPO (Precio extra en céntimos)
CREATE TABLE IF NOT EXISTS opciones_producto (
  id TEXT PRIMARY KEY,
  grupo_id TEXT NOT NULL,
  nombre TEXT NOT NULL,                          -- Ej. 'Al punto', 'Bacon crujiente (+1,20 €)'
  precio_extra_cents INTEGER DEFAULT 0,          -- En céntimos (ej. 120 = +1,20 €, 0 = gratis)
  disponible INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (grupo_id) REFERENCES grupos_opciones(id) ON DELETE CASCADE
);

-- 9. TABLA: PEDIDOS (Comandas)
-- Numeración de comanda por restaurante con unicidad (restaurante_id, numero_comanda)
-- Token aleatorio largo criptoseguro para seguimiento del cliente
CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT NOT NULL,
  numero_comanda INTEGER NOT NULL,               -- Secuencial 1, 2, 3... por restaurante
  tracking_token TEXT UNIQUE NOT NULL,           -- Token aleatorio largo para /pedido/:token
  tipo_servicio TEXT NOT NULL,                   -- 'recogida' o 'delivery'
  direccion_entrega TEXT,                        -- Solo si tipo_servicio == 'delivery'
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT NOT NULL,
  cliente_email TEXT,
  notas_cliente TEXT,
  subtotal_cents INTEGER NOT NULL,               -- Calculado estrictamente en servidor
  gastos_envio_cents INTEGER DEFAULT 0,          -- Calculado estrictamente en servidor
  total_cents INTEGER NOT NULL,                  -- Calculado estrictamente en servidor
  metodo_pago TEXT NOT NULL,                     -- 'tarjeta', 'bizum', 'efectivo'
  estado_pago TEXT DEFAULT 'completado',         -- 'completado', 'pendiente', 'fallido'
  estado TEXT DEFAULT 'recibido',                -- 'recibido', 'cocina', 'listo', 'entregado', 'cancelado'
  idempotency_key TEXT UNIQUE,                   -- Protección contra doble envío
  ip_cliente TEXT,                               -- Para limitación de tasa
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(restaurante_id, numero_comanda),
  FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- 10. TABLA: LÍNEAS DE PEDIDO (Inmutabilidad histórica y trazabilidad de extras)
CREATE TABLE IF NOT EXISTS lineas_de_pedido (
  id TEXT PRIMARY KEY,
  pedido_id TEXT NOT NULL,
  restaurante_id TEXT NOT NULL,
  producto_id TEXT NOT NULL,
  nombre_producto TEXT NOT NULL,
  precio_unitario_cents INTEGER NOT NULL,        -- Precio base congelado
  cantidad INTEGER NOT NULL,                     -- Entero positivo >= 1
  extras_json TEXT DEFAULT '[]',                 -- Detalle congelado de las opciones elegidas
  total_linea_cents INTEGER NOT NULL,            -- (precio_unitario + suma_extras) * cantidad
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE,
  FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- 11. TABLA: MENSAJES DE CHAT (Comunicación directa)
CREATE TABLE IF NOT EXISTS mensajes_chat (
  id TEXT PRIMARY KEY,
  pedido_id TEXT NOT NULL,
  restaurante_id TEXT NOT NULL,
  remitente TEXT NOT NULL,                       -- 'cliente', 'restaurante'
  texto TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- Índices para aislamiento estricto y alto rendimiento
CREATE INDEX IF NOT EXISTS idx_restaurantes_slug ON restaurantes(slug);
CREATE INDEX IF NOT EXISTS idx_restaurantes_dominio ON restaurantes(dominio_personalizado);
CREATE INDEX IF NOT EXISTS idx_productos_restaurante ON productos(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_grupos_producto ON grupos_opciones(producto_id);
CREATE INDEX IF NOT EXISTS idx_opciones_grupo ON opciones_producto(grupo_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_restaurante ON pedidos(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_tracking ON pedidos(tracking_token);
CREATE INDEX IF NOT EXISTS idx_pedidos_num ON pedidos(restaurante_id, numero_comanda);
