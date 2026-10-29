-- ====================================================================
-- FOGONAZO OS - Supabase RLS & Datos Semilla
-- Pega esto en el SQL Editor de Supabase y dale a "Run"
-- ====================================================================

-- 1. Desactivar RLS para permitir lectura y pedidos desde la API pública
ALTER TABLE IF EXISTS restaurantes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS categorias DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS productos DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS grupos_opciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS opciones_producto DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pedidos DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lineas_de_pedido DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS mensajes_chat DISABLE ROW LEVEL SECURITY;

-- 2. Insertar Restaurante Demo
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

-- 3. Categorías
INSERT INTO categorias (id, restaurante_id, nombre, orden, activa) VALUES
('cat_demo_1', 'rest_demo', 'Smash Burgers a la Brasa', 1, TRUE),
('cat_demo_2', 'rest_demo', 'Entrantes & Fries', 2, TRUE),
('cat_demo_3', 'rest_demo', 'Postres Caseros', 3, TRUE),
('cat_demo_4', 'rest_demo', 'Bebidas & Cervezas', 4, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 4. Platos y Productos
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

-- 5. Grupos de opciones y extras
INSERT INTO grupos_opciones (id, producto_id, restaurante_id, nombre, obligatorio, max_seleccion, orden) VALUES
('grp_b1_punto', 'prod_b1', 'rest_demo', 'Punto de la Carne', TRUE, 1, 1),
('grp_b1_extras', 'prod_b1', 'rest_demo', 'Añade Extras a tu Burger', FALSE, 3, 2),
('grp_b1_salsa', 'prod_b1', 'rest_demo', 'Salsa para Acompañar', FALSE, 2, 3),
('grp_b2_punto', 'prod_b2', 'rest_demo', 'Punto de la Carne', TRUE, 1, 1),
('grp_b2_extras', 'prod_b2', 'rest_demo', 'Extras Opcionales', FALSE, 3, 2)
ON CONFLICT (id) DO NOTHING;

-- 6. Opciones específicas
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
