/**
 * FOGONAZO OS - Script Semilla de Datos y Comando de Restauración
 * Inicializa el restaurante demo ("La Fogoneta Smash Burgers") y un segundo restaurante de prueba ("Trattoria Bella Napoli")
 * Uso: node db/seed.js
 *      node db/seed.js --reset
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'fogon.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

function runSeed(reset = false) {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');

  console.log(`[SEED] ${reset ? 'Restableciendo y sembrando' : 'Sembrando'} base de datos de Fogonazo...`);

  if (reset) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS mensajes_chat;
      DROP TABLE IF EXISTS lineas_de_pedido;
      DROP TABLE IF EXISTS pedidos;
      DROP TABLE IF EXISTS opciones_producto;
      DROP TABLE IF EXISTS grupos_opciones;
      DROP TABLE IF EXISTS productos;
      DROP TABLE IF EXISTS categorias;
      DROP TABLE IF EXISTS zonas_de_reparto;
      DROP TABLE IF EXISTS horarios;
      DROP TABLE IF EXISTS usuarios;
      DROP TABLE IF EXISTS restaurantes;
      PRAGMA foreign_keys = ON;
    `);
  }

  // Asegura esquema
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schemaSql);

  // ====================================================================
  // 1. RESTAURANTE 1: DEMO ("La Fogoneta Smash Burgers")
  // ====================================================================
  const insertRest = db.prepare(`
    INSERT OR REPLACE INTO restaurantes (
      id, slug, nombre, tagline, logo_url, color_primario, color_secundario,
      telefono, email_contacto, direccion, activo, moneda,
      pedido_minimo_cents, coste_envio_cents, servicio_abierto, funciones_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertRest.run(
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
    1,
    '€',
    1400, // 14,00 € pedido mínimo
    250,  // 2,50 € gastos de entrega
    1,
    JSON.stringify({ delivery: true, takeaway: true, tarjeta: true, bizum: true, kds: true })
  );

  // Horarios Demo
  const insertHorario = db.prepare(`
    INSERT OR REPLACE INTO horarios (id, restaurante_id, dia_semana, hora_apertura, hora_cierre, activo)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  for (let dia = 0; dia <= 6; dia++) {
    insertHorario.run(`hor_demo_${dia}`, 'rest_demo', dia, '12:30', '23:30');
  }

  // Usuario Admin del restaurante demo
  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO usuarios (id, restaurante_id, nombre, email, password_hash, rol, activo)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  insertUser.run('user_demo', 'rest_demo', 'Gerente Fogoneta', 'cocina@lafogoneta.es', 'demo1234', 'admin');

  // Categorías Demo
  const insertCat = db.prepare(`
    INSERT OR REPLACE INTO categorias (id, restaurante_id, nombre, orden, activa)
    VALUES (?, ?, ?, ?, 1)
  `);
  insertCat.run('cat_demo_1', 'rest_demo', 'Smash Burgers a la Brasa', 1);
  insertCat.run('cat_demo_2', 'rest_demo', 'Entrantes & Fries', 2);
  insertCat.run('cat_demo_3', 'rest_demo', 'Postres Caseros', 3);
  insertCat.run('cat_demo_4', 'rest_demo', 'Bebidas & Cervezas', 4);

  // Zonas de reparto Demo
  const insertZona = db.prepare(`
    INSERT OR REPLACE INTO zonas_de_reparto (id, restaurante_id, nombre_zona, codigo_postal, coste_envio_cents, pedido_minimo_cents, activa)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  insertZona.run('zona_demo_1', 'rest_demo', 'Centro / Malasaña / Chueca', '28004', 250, 1400);
  insertZona.run('zona_demo_2', 'rest_demo', 'Chamberí / Salamanca', '28010', 350, 1800);

  // Platos Demo
  const insertProd = db.prepare(`
    INSERT OR REPLACE INTO productos (
      id, restaurante_id, categoria_id, nombre, descripcion, precio_cents,
      imagen_url, disponible, destacado, alergenos_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertProd.run(
    'prod_b1',
    'rest_demo',
    'cat_demo_1',
    'Smash Trufada Doble',
    'Dos patties crujientes de 90g de vaca rubia madurada, doble cheddar inglés, mayonesa trufada casera y cebolla pochada en pan brioche artesano tostado con mantequilla.',
    1190, // 11,90 €
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
    1,
    1,
    JSON.stringify(['gluten', 'lacteos', 'huevo'])
  );

  insertProd.run(
    'prod_b2',
    'rest_demo',
    'cat_demo_1',
    'Smash Bacon Cheese Clásica',
    'Doble disco de carne smash con costra caramelizada, cuatro tiras de bacon ahumado crujiente, queso cheddar fundido y nuestra salsa burger secreta Fogonazo.',
    1050, // 10,50 €
    'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
    1,
    1,
    JSON.stringify(['gluten', 'lacteos', 'huevo', 'mostaza'])
  );

  insertProd.run(
    'prod_b3',
    'rest_demo',
    'cat_demo_1',
    'Smash Pollo Sureño Crujiente',
    'Contramuslo de pollo de corral marinado 24 horas en suero de leche, frito extracrujiente, salsa mayo-chipotle suave, ensalada de col fresca y pepinillos agridulces.',
    990, // 9,90 €
    'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600&auto=format&fit=crop&q=80',
    1,
    0,
    JSON.stringify(['gluten', 'lacteos', 'huevo'])
  );

  insertProd.run(
    'prod_e1',
    'rest_demo',
    'cat_demo_2',
    'Patatas Rústicas Trufadas con Parmesano',
    'Patatas naturales de corte grueso doble fritura con aceite de trufa blanca de temporada, lluvia abundante de queso Parmigiano Reggiano 24 meses y orégano silvestre.',
    550, // 5,50 €
    'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80',
    1,
    1,
    JSON.stringify(['lacteos'])
  );

  insertProd.run(
    'prod_e2',
    'rest_demo',
    'cat_demo_2',
    'Alitas Glaseadas al Bourbon & Miel (6u)',
    'Alitas de pollo carnosas a la brasa de encina con glaseado casero de salsa barbacoa al bourbon y miel de romero, con toque de sésamo blanco tostado.',
    720, // 7,20 €
    'https://images.unsplash.com/photo-1527477378696-7a8be0d80d21?w=600&auto=format&fit=crop&q=80',
    1,
    0,
    JSON.stringify(['sesamo', 'sulfitos'])
  );

  insertProd.run(
    'prod_p1',
    'rest_demo',
    'cat_demo_3',
    'Tarta de Queso Fluida al Horno',
    'Elaborada artesanalmente cada mañana con queso crema e Idiazábal ahumado. Textura fundente en el corazón con base crujiente de galleta y coulis de frambuesa.',
    590, // 5,90 €
    'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80',
    1,
    1,
    JSON.stringify(['gluten', 'lacteos', 'huevo'])
  );

  insertProd.run(
    'prod_beb1',
    'rest_demo',
    'cat_demo_4',
    'Cerveza Artesana Fogonazo IPA (33cl)',
    'Cerveza rubia aromática con lúpulos cítricos y amargor equilibrado, maridaje perfecto para nuestras carnes a la brasa.',
    350, // 3,50 €
    'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&auto=format&fit=crop&q=80',
    1,
    0,
    JSON.stringify(['gluten'])
  );

  insertProd.run(
    'prod_beb2',
    'rest_demo',
    'cat_demo_4',
    'Limonada Casera de Jengibre y Menta',
    'Zumo natural de limones recién exprimidos con infusión de jengibre fresco, hojas de hierbabuena y azúcar de caña.',
    280, // 2,80 €
    'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
    1,
    0,
    JSON.stringify([])
  );

  // ====================================================================
  // GRUPOS DE OPCIONES & EXTRAS PARA LAS SMASH BURGERS
  // ====================================================================
  const insertGrupo = db.prepare(`
    INSERT OR REPLACE INTO grupos_opciones (id, producto_id, restaurante_id, nombre, obligatorio, max_seleccion, orden)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertOpcion = db.prepare(`
    INSERT OR REPLACE INTO opciones_producto (id, grupo_id, nombre, precio_extra_cents, disponible, orden)
    VALUES (?, ?, ?, ?, 1, ?)
  `);

  // Para prod_b1 (Smash Trufada)
  insertGrupo.run('grp_b1_punto', 'prod_b1', 'rest_demo', 'Punto de la Carne', 1, 1, 1);
  insertOpcion.run('opt_b1_p1', 'grp_b1_punto', 'Al punto con costra crujiente', 0, 1);
  insertOpcion.run('opt_b1_p2', 'grp_b1_punto', 'Bien hecha y tostada', 0, 2);

  insertGrupo.run('grp_b1_extras', 'prod_b1', 'rest_demo', 'Añade Extras a tu Burger', 0, 3, 2);
  insertOpcion.run('opt_b1_e1', 'grp_b1_extras', 'Bacon crujiente caramelizado (+1,20 €)', 120, 1);
  insertOpcion.run('opt_b1_e2', 'grp_b1_extras', 'Queso cheddar ahumado extra (+1,00 €)', 100, 2);
  insertOpcion.run('opt_b1_e3', 'grp_b1_extras', 'Huevo campero frito a la plancha (+1,20 €)', 120, 3);
  insertOpcion.run('opt_b1_e4', 'grp_b1_extras', 'Pepinillos encurtidos artesanos (+0,50 €)', 50, 4);

  insertGrupo.run('grp_b1_salsa', 'prod_b1', 'rest_demo', 'Salsa para Acompañar', 0, 2, 3);
  insertOpcion.run('opt_b1_s1', 'grp_b1_salsa', 'Salsa Mayo Trufada Extra (+1,00 €)', 100, 1);
  insertOpcion.run('opt_b1_s2', 'grp_b1_salsa', 'Salsa Fogonazo Secreta (+0,80 €)', 80, 2);
  insertOpcion.run('opt_b1_s3', 'grp_b1_salsa', 'Barbacoa al Bourbon (+0,80 €)', 80, 3);

  // Para prod_b2 (Smash Bacon Cheese)
  insertGrupo.run('grp_b2_punto', 'prod_b2', 'rest_demo', 'Punto de la Carne', 1, 1, 1);
  insertOpcion.run('opt_b2_p1', 'grp_b2_punto', 'Al punto con costra crujiente', 0, 1);
  insertOpcion.run('opt_b2_p2', 'grp_b2_punto', 'Bien pasada', 0, 2);

  insertGrupo.run('grp_b2_extras', 'prod_b2', 'rest_demo', 'Extras Opcionales', 0, 3, 2);
  insertOpcion.run('opt_b2_e1', 'grp_b2_extras', 'Doble ración de bacon (+1,20 €)', 120, 1);
  insertOpcion.run('opt_b2_e2', 'grp_b2_extras', 'Cebolla crujiente frita (+0,80 €)', 80, 2);
  insertOpcion.run('opt_b2_e3', 'grp_b2_extras', 'Huevo frito a la plancha (+1,20 €)', 120, 3);


  // ====================================================================
  // COMANDA INICIAL DE PRUEBA
  // ====================================================================
  const insertComanda = db.prepare(`
    INSERT OR REPLACE INTO pedidos (
      id, restaurante_id, numero_comanda, tracking_token, tipo_servicio,
      direccion_entrega, cliente_nombre, cliente_telefono, cliente_email,
      notas_cliente, subtotal_cents, gastos_envio_cents, total_cents,
      metodo_pago, estado_pago, estado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertComanda.run(
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
    1740, // 17,40 €
    250,  // 2,50 €
    1990, // 19,90 €
    'tarjeta',
    'completado',
    'cocina'
  );

  const insertLinea = db.prepare(`
    INSERT OR REPLACE INTO lineas_de_pedido (
      id, pedido_id, restaurante_id, producto_id, nombre_producto,
      precio_unitario_cents, cantidad, extras_json, total_linea_cents
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertLinea.run(
    'lin_demo_1',
    'ped_demo_initial',
    'rest_demo',
    'prod_b1',
    'Smash Trufada Doble',
    1190,
    1,
    JSON.stringify([
      { grupo_nombre: 'Punto de la Carne', opcion_nombre: 'Al punto con costra crujiente', precio_extra_cents: 0 },
      { grupo_nombre: 'Añade Extras a tu Burger', opcion_nombre: 'Bacon crujiente caramelizado (+1,20 €)', precio_extra_cents: 120 }
    ]),
    1310
  );

  insertLinea.run(
    'lin_demo_2',
    'ped_demo_initial',
    'rest_demo',
    'prod_beb1',
    'Cerveza Artesana Fogonazo IPA (33cl)',
    350,
    1,
    JSON.stringify([]),
    350
  );

  console.log('[SEED] Base de datos poblada con éxito:');
  console.log('       Restaurante Demo: "La Fogoneta Smash Burgers" (slug: demo)');
  console.log('       Comando de restablecimiento disponible: node db/seed.js --reset');
}

// Ejecución si se llama directamente
if (require.main === module) {
  const isReset = process.argv.includes('--reset');
  runSeed(isReset);
}

module.exports = { runSeed };
