-- ====================================================================
-- FOGONAZO OS - PostgreSQL / Supabase Migration & Seed Script
-- Pega este script directamente en el SQL Editor de tu panel de Supabase.
-- ====================================================================

-- 1. TABLA: RESTAURANTES (Inquilinos)
CREATE TABLE IF NOT EXISTS restaurantes (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  dominio_personalizado TEXT UNIQUE,
  nombre TEXT NOT NULL,
  tagline TEXT,
  logo_url TEXT,
  color_primario TEXT DEFAULT '#ff5500',
  color_secundario TEXT DEFAULT '#ff7a00',
  telefono TEXT,
  email_contacto TEXT,
  direccion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  moneda TEXT DEFAULT '€',
  pedido_minimo_cents INTEGER DEFAULT 1400,
  coste_envio_cents INTEGER DEFAULT 250,
  servicio_abierto BOOLEAN DEFAULT TRUE,
  funciones_json JSONB DEFAULT '{"delivery":true,"takeaway":true,"bizum":true,"tarjeta":true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA: HORARIOS DEL RESTAURANTE
CREATE TABLE IF NOT EXISTS horarios (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL,
  hora_apertura TEXT NOT NULL,
  hora_cierre TEXT NOT NULL,
  activo BOOLEAN DEFAULT TRUE
);

-- 3. TABLA: USUARIOS CON ROL
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA: ZONAS DE REPARTO
CREATE TABLE IF NOT EXISTS zonas_de_reparto (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre_zona TEXT NOT NULL,
  codigo_postal TEXT,
  coste_envio_cents INTEGER DEFAULT 250,
  pedido_minimo_cents INTEGER DEFAULT 1400,
  activa BOOLEAN DEFAULT TRUE
);

-- 5. TABLA: CATEGORÍAS DE LA CARTA
CREATE TABLE IF NOT EXISTS categorias (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  orden INTEGER DEFAULT 0,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABLA: PRODUCTOS / PLATOS (Precios en céntimos enteros)
CREATE TABLE IF NOT EXISTS productos (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  categoria_id TEXT NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_cents INTEGER NOT NULL,
  imagen_url TEXT,
  disponible BOOLEAN DEFAULT TRUE,
  destacado BOOLEAN DEFAULT FALSE,
  alergenos_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABLA: GRUPOS DE OPCIONES / EXTRAS DEL PLATO
CREATE TABLE IF NOT EXISTS grupos_opciones (
  id TEXT PRIMARY KEY,
  producto_id TEXT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  restaurante_id TEXT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  obligatorio BOOLEAN DEFAULT FALSE,
  max_seleccion INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TABLA: OPCIONES ESPECÍFICAS DENTRO DEL GRUPO
CREATE TABLE IF NOT EXISTS opciones_producto (
  id TEXT PRIMARY KEY,
  grupo_id TEXT NOT NULL REFERENCES grupos_opciones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  precio_extra_cents INTEGER DEFAULT 0,
  disponible BOOLEAN DEFAULT TRUE,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. TABLA: PEDIDOS (Comandas)
CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY,
  restaurante_id TEXT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  numero_comanda INTEGER NOT NULL,
  tracking_token TEXT UNIQUE NOT NULL,
  tipo_servicio TEXT NOT NULL,
  direccion_entrega TEXT,
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT NOT NULL,
  cliente_email TEXT,
  notas_cliente TEXT,
  subtotal_cents INTEGER NOT NULL,
  gastos_envio_cents INTEGER DEFAULT 0,
  total_cents INTEGER NOT NULL,
  metodo_pago TEXT NOT NULL,
  estado_pago TEXT DEFAULT 'completado',
  estado TEXT DEFAULT 'recibido',
  idempotency_key TEXT UNIQUE,
  ip_cliente TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_restaurante_comanda UNIQUE(restaurante_id, numero_comanda)
);

-- 10. TABLA: LÍNEAS DE PEDIDO
CREATE TABLE IF NOT EXISTS lineas_de_pedido (
  id TEXT PRIMARY KEY,
  pedido_id TEXT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  restaurante_id TEXT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  producto_id TEXT NOT NULL REFERENCES productos(id),
  nombre_producto TEXT NOT NULL,
  precio_unitario_cents INTEGER NOT NULL,
  cantidad INTEGER NOT NULL,
  extras_json JSONB DEFAULT '[]'::jsonb,
  total_linea_cents INTEGER NOT NULL
);

-- 11. TABLA: MENSAJES DE CHAT
CREATE TABLE IF NOT EXISTS mensajes_chat (
  id TEXT PRIMARY KEY,
  pedido_id TEXT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  restaurante_id TEXT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  remitente TEXT NOT NULL,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_pedidos_rest_fecha ON pedidos(restaurante_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_token ON pedidos(tracking_token);
CREATE INDEX IF NOT EXISTS idx_lineas_pedido ON lineas_de_pedido(pedido_id);

-- ====================================================================
-- DATOS SEMILLA (Restaurante Demo: La Fogoneta Smash Burgers)
-- ====================================================================

INSERT INTO restaurantes (
  id, slug, nombre, tagline, logo_url, color_primario, color_secundario,
  telefono, email_contacto, direccion, activo, moneda,
  pedido_minimo_cents, coste_envio_cents, servicio_abierto, funciones_json
) VALUES (
  'rest_demo',
  'demo',
  'La Fogoneta Smash Burgers',
  'Smash burgers artesanas a la brasa, patatas trufadas y batidos',
  '/img/logo.png',
  '#ff5500',
  '#ff7a00',
  '+34 912 345 678',
  'hola@lafogoneta.es',
  'Calle del Fuego 24, 28004 Madrid',
  TRUE,
  '€',
  1400,
  250,
  TRUE,
  '{"delivery":true,"takeaway":true,"tarjeta":true,"bizum":true,"kds":true}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  tagline = EXCLUDED.tagline,
  pedido_minimo_cents = EXCLUDED.pedido_minimo_cents,
  coste_envio_cents = EXCLUDED.coste_envio_cents;

-- Categorías
INSERT INTO categorias (id, restaurante_id, nombre, orden, activa) VALUES
('cat_demo_1', 'rest_demo', 'Smash Burgers a la Brasa', 1, TRUE),
('cat_demo_2', 'rest_demo', 'Entrantes & Fries', 2, TRUE),
('cat_demo_3', 'rest_demo', 'Postres Caseros', 3, TRUE),
('cat_demo_4', 'rest_demo', 'Bebidas & Cervezas', 4, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Productos
INSERT INTO productos (id, restaurante_id, categoria_id, nombre, descripcion, precio_cents, imagen_url, disponible, destacado, alergenos_json) VALUES
('prod_b1', 'rest_demo', 'cat_demo_1', 'Smash Trufada Doble', 'Dos patties crujientes de 90g de vaca rubia madurada, doble cheddar inglés, mayonesa trufada casera y cebolla pochada en pan brioche artesano tostado con mantequilla.', 1190, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80', TRUE, TRUE, '["gluten", "lacteos", "huevo"]'::jsonb),
('prod_b2', 'rest_demo', 'cat_demo_1', 'Smash Bacon Cheese Clásica', 'Doble disco de carne smash con costra caramelizada, cuatro tiras de bacon ahumado crujiente, queso cheddar fundido y nuestra salsa burger secreta Fogonazo.', 1050, 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80', TRUE, TRUE, '["gluten", "lacteos", "huevo", "mostaza"]'::jsonb),
('prod_b3', 'rest_demo', 'cat_demo_1', 'Smash Pollo Sureño Crujiente', 'Contramuslo de pollo de corral marinado 24 horas en suero de leche, frito extracrujiente, salsa mayo-chipotle suave, ensalada de col fresca y pepinillos agridulces.', 990, 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600&auto=format&fit=crop&q=80', TRUE, FALSE, '["gluten", "lacteos", "huevo"]'::jsonb),
('prod_e1', 'rest_demo', 'cat_demo_2', 'Patatas Rústicas Trufadas con Parmesano', 'Patatas naturales de corte grueso doble fritura con aceite de trufa blanca de temporada, lluvia abundante de queso Parmigiano Reggiano 24 meses y orégano silvestre.', 550, 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80', TRUE, TRUE, '["lacteos"]'::jsonb),
('prod_e2', 'rest_demo', 'cat_demo_2', 'Alitas Glaseadas al Bourbon & Miel (6u)', 'Alitas de pollo carnosas a la brasa de encina con glaseado casero de salsa barbacoa al bourbon y miel de romero, con toque de sésamo blanco tostado.', 720, 'https://images.unsplash.com/photo-1527477378696-7a8be0d80d21?w=600&auto=format&fit=crop&q=80', TRUE, FALSE, '["sesamo", "sulfitos"]'::jsonb),
('prod_pos1', 'rest_demo', 'cat_demo_3', 'Tarta de Queso Fluida al Horno', 'Receta vasca tradicional con corazón cremoso fluido, elaborada con quesos artesanos de vaca y oveja, base de galleta y toque de flor de sal.', 590, 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80', TRUE, TRUE, '["gluten", "lacteos", "huevo"]'::jsonb),
('prod_beb1', 'rest_demo', 'cat_demo_4', 'Cerveza Artesana Fogonazo IPA (33cl)', 'India Pale Ale de elaboración propia, aromas cítricos y resinosos, cuerpo medio y amargor equilibrado. 6.2% Vol.', 350, 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&auto=format&fit=crop&q=80', TRUE, FALSE, '["gluten"]'::jsonb),
('prod_beb2', 'rest_demo', 'cat_demo_4', 'Limonada Casera de Jengibre y Menta', 'Zumo natural de limones recién exprimidos con infusión de jengibre fresco, hojas de hierbabuena y azúcar de caña.', 280, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80', TRUE, FALSE, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Grupos de opciones y extras
INSERT INTO grupos_opciones (id, producto_id, restaurante_id, nombre, obligatorio, max_seleccion, orden) VALUES
('grp_b1_punto', 'prod_b1', 'rest_demo', 'Punto de la Carne', TRUE, 1, 1),
('grp_b1_extras', 'prod_b1', 'rest_demo', 'Añade Extras a tu Burger', FALSE, 3, 2),
('grp_b1_salsa', 'prod_b1', 'rest_demo', 'Salsa para Acompañar', FALSE, 2, 3),
('grp_b2_punto', 'prod_b2', 'rest_demo', 'Punto de la Carne', TRUE, 1, 1),
('grp_b2_extras', 'prod_b2', 'rest_demo', 'Extras Opcionales', FALSE, 3, 2)
ON CONFLICT (id) DO NOTHING;

-- Opciones específicas
INSERT INTO opciones_producto (id, grupo_id, nombre, precio_extra_cents, disponible, orden) VALUES
('opt_b1_p1', 'grp_b1_punto', 'Al punto con costra crujiente', 0, TRUE, 1),
('opt_b1_p2', 'grp_b1_punto', 'Bien hecha y tostada', 0, TRUE, 2),
('opt_b1_e1', 'grp_b1_extras', 'Bacon crujiente caramelizado (+1,20 €)', 120, TRUE, 1),
('opt_b1_e2', 'grp_b1_extras', 'Queso cheddar ahumado extra (+1,00 €)', 100, TRUE, 2),
('opt_b1_e3', 'grp_b1_extras', 'Huevo campero frito a la plancha (+1,20 €)', 120, TRUE, 3),
('opt_b1_e4', 'grp_b1_extras', 'Pepinillos encurtidos artesanos (+0,50 €)', 50, TRUE, 4),
('opt_b1_s1', 'grp_b1_salsa', 'Salsa Mayo Trufada Extra (+1,00 €)', 100, TRUE, 1),
('opt_b1_s2', 'grp_b1_salsa', 'Salsa Fogonazo Secreta (+0,80 €)', 80, TRUE, 2),
('opt_b1_s3', 'grp_b1_salsa', 'Barbacoa al Bourbon (+0,80 €)', 80, TRUE, 3),
('opt_b2_p1', 'grp_b2_punto', 'Al punto con costra crujiente', 0, TRUE, 1),
('opt_b2_p2', 'grp_b2_punto', 'Bien pasada', 0, TRUE, 2),
('opt_b2_e1', 'grp_b2_extras', 'Doble ración de bacon (+1,20 €)', 120, TRUE, 1),
('opt_b2_e2', 'grp_b2_extras', 'Cebolla crujiente frita (+0,80 €)', 80, TRUE, 2),
('opt_b2_e3', 'grp_b2_extras', 'Huevo frito a la plancha (+1,20 €)', 120, TRUE, 3)
ON CONFLICT (id) DO NOTHING;

-- Comanda de ejemplo inicial
INSERT INTO pedidos (
  id, restaurante_id, numero_comanda, tracking_token, tipo_servicio,
  direccion_entrega, cliente_nombre, cliente_telefono, cliente_email,
  notas_cliente, subtotal_cents, gastos_envio_cents, total_cents,
  metodo_pago, estado_pago, estado
) VALUES (
  'ped_demo_initial',
  'rest_demo',
  108,
  'token_demo_fogoneta_initial_123456789',
  'delivery',
  'Calle Gran Vía 32, 4º B, Madrid',
  'Carlos Mendoza',
  '+34 654 321 000',
  'carlos@ejemplo.es',
  'Llamar al telefonillo 4B, sin cebolla cruda',
  1740,
  250,
  1990,
  'tarjeta',
  'completado',
  'cocina'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO lineas_de_pedido (id, pedido_id, restaurante_id, producto_id, nombre_producto, precio_unitario_cents, cantidad, extras_json, total_linea_cents) VALUES
('lin_demo_1', 'ped_demo_initial', 'rest_demo', 'prod_b1', 'Smash Trufada Doble', 1190, 1, '[{"grupo_nombre":"Punto de la Carne","opcion_nombre":"Al punto con costra crujiente","precio_extra_cents":0},{"grupo_nombre":"Extras","opcion_nombre":"Bacon crujiente caramelizado","precio_extra_cents":120}]'::jsonb, 1310),
('lin_demo_2', 'ped_demo_initial', 'rest_demo', 'prod_beb1', 'Cerveza Artesana Fogonazo IPA (33cl)', 350, 1, '[]'::jsonb, 350)
ON CONFLICT (id) DO NOTHING;
