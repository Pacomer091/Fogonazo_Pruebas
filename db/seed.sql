-- ====================================================================
-- FOGÓN OS - Datos Semilla Iniciales
-- ====================================================================

-- 1. Superadmin (Tú, el creador de Fogón)
INSERT OR REPLACE INTO usuarios (id, restaurante_id, nombre, email, password_hash, rol, invitacion_aceptada)
VALUES ('user_superadmin', NULL, 'Administrador Fogón', 'admin@fogon.app', 'fogon_admin_secret', 'superadmin', 1);

-- 2. Restaurante 1: DEMO (Para enseñar a futuros clientes en demo.tuweb.com)
INSERT OR REPLACE INTO restaurantes (
  id, slug, nombre, tagline, logo_url, color_primario, color_secundario,
  telefono, email_contacto, direccion, activo, moneda, pedido_minimo, coste_envio, plan_suscripcion, cuota_mensual
) VALUES (
  'rest_demo', 'demo', 'Fogón Asador & Brasa', 'Cocina al carbón de encina y tapas de autor',
  '/assets/logo-demo.svg', '#ff5e36', '#ff8c42',
  '+34 912 000 111', 'hola@fogonbrasa.es', 'Plaza Mayor 14, Madrid', 1, '€', 12.00, 2.50, 'Enterprise', 149.00
);

-- Admin del Restaurante Demo
INSERT OR REPLACE INTO usuarios (id, restaurante_id, nombre, email, password_hash, rol, invitacion_aceptada)
VALUES ('user_demo_owner', 'rest_demo', 'Carlos Asador', 'gerente@fogonbrasa.es', 'demo1234', 'restaurant_admin', 1);

-- Categorías Demo
INSERT OR REPLACE INTO categorias (id, restaurante_id, nombre, orden) VALUES
('cat_demo_1', 'rest_demo', 'Entrantes a la Brasa', 1),
('cat_demo_2', 'rest_demo', 'Carnes & Especialidades', 2),
('cat_demo_3', 'rest_demo', 'Postres Artesanos', 3),
('cat_demo_4', 'rest_demo', 'Vinos & Bebidas', 4);

-- Platos Demo
INSERT OR REPLACE INTO productos (id, restaurante_id, categoria_id, nombre, descripcion, precio, imagen_url, disponible, destacado, alergenos) VALUES
('prod_1', 'rest_demo', 'cat_demo_1', 'Chorizo Criollo a la Brasa con Chimichurri', 'Elaboración propia con chimichurri casero de hierbas frescas y pan rústico.', 8.50, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80', 1, 1, '["gluten"]'),
('prod_2', 'rest_demo', 'cat_demo_1', 'Provolone Fundido al Horno de Leña', 'Con orégano fresco, tomate seco confitado y tostas de focaccia.', 10.90, 'https://images.unsplash.com/photo-1592417817098-8f3d6910985b?w=600&auto=format&fit=crop&q=80', 1, 0, '["lacteos","gluten"]'),
('prod_3', 'rest_demo', 'cat_demo_2', 'Entrecot Madurado 45 Días (350g)', 'Corte premium de vaca rubia a la brasa con patatas panaderas y pimientos de Padrón.', 24.50, 'https://images.unsplash.com/photo-1558030006-450675393462?w=600&auto=format&fit=crop&q=80', 1, 1, '[]'),
('prod_4', 'rest_demo', 'cat_demo_2', 'Costillar Ibérico Glaseado al Bourbon', 'Cocinado a baja temperatura 12 horas y terminado a la parrilla con salsa barbacoa ahumada.', 17.80, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80', 1, 1, '["sulfitos"]'),
('prod_5', 'rest_demo', 'cat_demo_3', 'Tarta de Queso Fluida al Horno', 'Cremosa por dentro con base de galleta y frutos rojos.', 6.80, 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80', 1, 1, '["lacteos","huevo","gluten"]'),
('prod_6', 'rest_demo', 'cat_demo_4', 'Vino Ribera del Duero Crianza', 'Botella 75cl. 100% Tempranillo con 14 meses en roble francés.', 19.50, 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&auto=format&fit=crop&q=80', 1, 0, '["sulfitos"]');

-- Zonas de reparto Demo
INSERT OR REPLACE INTO zonas_de_reparto (id, restaurante_id, nombre_zona, codigo_postal, coste_envio, pedido_minimo) VALUES
('zona_1', 'rest_demo', 'Centro Histórico', '28001', 2.00, 15.00),
('zona_2', 'rest_demo', 'Barrio Salamanca / Retiro', '28006', 3.50, 20.00);

-- Pedidos Demo de ejemplo
INSERT OR REPLACE INTO pedidos (
  id, restaurante_id, numero_comanda, tipo_servicio, mesa, cliente_nombre, cliente_telefono, notas_cliente,
  subtotal, gastos_envio, total, metodo_pago, estado_pago, estado
) VALUES (
  'ped_101', 'rest_demo', 'FOG-101', 'mesa', 'Mesa 4', 'Carlos Mendoza', '+34 654 987 321', 'La carne al punto más bien poco hecha',
  33.00, 0.00, 33.00, 'bizum', 'completado', 'cocina'
);

INSERT OR REPLACE INTO lineas_de_pedido (id, pedido_id, restaurante_id, producto_id, nombre_producto, precio_unitario, cantidad, total_linea) VALUES
('lin_1', 'ped_101', 'rest_demo', 'prod_1', 'Chorizo Criollo a la Brasa con Chimichurri', 8.50, 1, 8.50),
('lin_2', 'ped_101', 'rest_demo', 'prod_3', 'Entrecot Madurado 45 Días (350g)', 24.50, 1, 24.50);

-- Mensaje de chat para el pedido demo
INSERT OR REPLACE INTO mensajes_chat (id, pedido_id, restaurante_id, remitente, texto) VALUES
('msg_1', 'ped_101', 'rest_demo', 'cliente', 'Hola, ¿podríais poner el chimichurri aparte?'),
('msg_2', 'ped_101', 'rest_demo', 'restaurante', '¡Marchando! Te lo servimos en un cuenco al lado.');
