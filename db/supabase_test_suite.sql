-- ====================================================================
-- FOGONAZO OS - BATERÍA DE PRUEBAS DE SEGURIDAD Y REGLAS DE NEGOCIO
-- Archivo: db/supabase_test_suite.sql
-- Ejecución dentro de BEGIN / ROLLBACK: No modifica ningún dato en la base.
-- ====================================================================

BEGIN;

-- Crear tabla temporal para registrar los resultados de las pruebas
CREATE TEMP TABLE IF NOT EXISTS temp_test_results (
  id INT,
  rol TEXT,
  test_name TEXT,
  resultado TEXT,
  detalle TEXT
) ON COMMIT DROP;

DO $$
DECLARE
  v_res JSONB;
  v_token TEXT;
  v_ped_id TEXT;
  v_dummy_user_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
  v_dueno_a_id UUID := '22222222-2222-2222-2222-222222222222'::UUID;
  v_dueno_b_id UUID := '33333333-3333-3333-3333-333333333333'::UUID;
  v_admin_id UUID := '44444444-4444-4444-4444-444444444444'::UUID;
  v_rows_deleted INT;
  v_pago_status TEXT;
BEGIN
  -- ------------------------------------------------------------------
  -- PREPARACIÓN: Restaurante B y perfiles temporales para la prueba
  -- ------------------------------------------------------------------
  INSERT INTO public.restaurantes (
    id, slug, nombre, direccion, activo, servicio_abierto,
    pedido_minimo_cents, coste_envio_cents, funciones_json
  ) VALUES (
    'rest_b', 'rest-b', 'Pizzería B', 'Calle Roma 10, Madrid', TRUE, TRUE,
    1000, 200, '{"delivery": true, "takeaway": true}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.categorias (id, restaurante_id, nombre, orden, activa)
  VALUES ('cat_b_1', 'rest_b', 'Pizzas Artesanas', 1, TRUE)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.productos (id, restaurante_id, categoria_id, nombre, precio_cents, disponible)
  VALUES ('prod_b_pizza', 'rest_b', 'cat_b_1', 'Pizza Margarita', 950, TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- Crear usuarios de prueba en perfiles
  DELETE FROM public.perfiles WHERE user_id IN (v_dueno_a_id, v_dueno_b_id, v_admin_id);
  INSERT INTO public.perfiles (id, user_id, rol, restaurante_id, nombre) VALUES
    (gen_random_uuid(), v_dueno_a_id, 'dueno', 'rest_demo', 'Dueño Demo A'),
    (gen_random_uuid(), v_dueno_b_id, 'dueno', 'rest_b', 'Dueño B'),
    (gen_random_uuid(), v_admin_id, 'superadmin', NULL, 'Superadmin Master');

  -- ==================================================================
  -- TEST 1: [ANON] crear_pedido válido con tipo_servicio 'recogida'
  -- ==================================================================
  BEGIN
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('role', 'anon', true);

    v_res := public.crear_pedido(
      p_restaurante_id := 'rest_demo',
      p_tipo_servicio := 'recogida',
      p_cliente_nombre := 'Carlos Prueba',
      p_cliente_telefono := '611222333',
      p_metodo_pago := 'tarjeta',
      p_idempotency_key := 'idem_test_001',
      p_lineas := '[{"producto_id": "prod_b1", "cantidad": 1, "opciones_ids": ["opt_b1_p1"]}]'::jsonb
    );

    v_token := v_res->>'tracking_token';
    v_ped_id := v_res->>'pedido_id';

    IF (v_res->>'ok')::BOOLEAN AND (v_res->>'estado_pago') = 'pendiente' THEN
      INSERT INTO temp_test_results VALUES (1, 'anon', 'crear_pedido (recogida, rest_demo)', 'PASSED', 'Comanda creada con estado_pago = pendiente');
    ELSE
      INSERT INTO temp_test_results VALUES (1, 'anon', 'crear_pedido (recogida, rest_demo)', 'FAILED', 'Respuesta inesperada: ' || v_res::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (1, 'anon', 'crear_pedido (recogida, rest_demo)', 'FAILED', SQLERRM);
  END;

  -- ==================================================================
  -- TEST 2: [ANON] confirmar_pago_simulado_demo sobre rest_demo (DEBE FUNCIONAR)
  -- ==================================================================
  BEGIN
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('role', 'anon', true);

    v_res := public.confirmar_pago_simulado_demo(v_token);

    SELECT estado_pago INTO v_pago_status FROM public.pedidos WHERE id = v_ped_id;

    IF (v_res->>'ok')::BOOLEAN AND v_pago_status = 'completado' THEN
      INSERT INTO temp_test_results VALUES (2, 'anon', 'confirmar_pago_simulado_demo en rest_demo', 'PASSED', 'Pago simulado completado con éxito mediante fogonazo.rpc_pago');
    ELSE
      INSERT INTO temp_test_results VALUES (2, 'anon', 'confirmar_pago_simulado_demo en rest_demo', 'FAILED', 'No se actualizó estado_pago: ' || v_res::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (2, 'anon', 'confirmar_pago_simulado_demo en rest_demo', 'FAILED', SQLERRM);
  END;

  -- ==================================================================
  -- TEST 3: [ANON] confirmar_pago_simulado_demo en otro restaurante (DEBE RECHAZARSE)
  -- ==================================================================
  BEGIN
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('role', 'anon', true);

    -- Crear comanda en rest_b
    v_res := public.crear_pedido(
      p_restaurante_id := 'rest_b',
      p_tipo_servicio := 'recogida',
      p_cliente_nombre := 'Cliente B',
      p_cliente_telefono := '622333444',
      p_metodo_pago := 'tarjeta',
      p_lineas := '[{"producto_id": "prod_b_pizza", "cantidad": 1}]'::jsonb
    );

    -- Intentar confirmar pago simulado sobre rest_b (debe fallar)
    PERFORM public.confirmar_pago_simulado_demo(v_res->>'tracking_token');
    INSERT INTO temp_test_results VALUES (3, 'anon', 'confirmar_pago_simulado_demo en rest_b', 'FAILED', 'Permitió pago simulado en un restaurante que no era rest_demo');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (3, 'anon', 'confirmar_pago_simulado_demo en rest_b', 'PASSED', 'Rechazado correctamente: ' || SQLERRM);
  END;

  -- ==================================================================
  -- TEST 4: [VALIDACIÓN] crear_pedido sin grupo obligatorio (Punto de la Carne)
  -- ==================================================================
  BEGIN
    PERFORM public.crear_pedido(
      p_restaurante_id := 'rest_demo',
      p_tipo_servicio := 'recogida',
      p_cliente_nombre := 'Test Obligatorio',
      p_cliente_telefono := '633444555',
      p_metodo_pago := 'tarjeta',
      p_lineas := '[{"producto_id": "prod_b1", "cantidad": 1, "opciones_ids": []}]'::jsonb
    );
    INSERT INTO temp_test_results VALUES (4, 'anon', 'crear_pedido sin grupo obligatorio', 'FAILED', 'No validó el grupo obligatorio');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (4, 'anon', 'crear_pedido sin grupo obligatorio', 'PASSED', 'Rechazado correctamente: ' || SQLERRM);
  END;

  -- ==================================================================
  -- TEST 5: [VALIDACIÓN] crear_pedido con servicio_abierto = false
  -- ==================================================================
  BEGIN
    UPDATE public.restaurantes SET servicio_abierto = FALSE WHERE id = 'rest_b';

    PERFORM public.crear_pedido(
      p_restaurante_id := 'rest_b',
      p_tipo_servicio := 'recogida',
      p_cliente_nombre := 'Test Cerrado',
      p_cliente_telefono := '644555666',
      p_metodo_pago := 'tarjeta',
      p_lineas := '[{"producto_id": "prod_b_pizza", "cantidad": 1}]'::jsonb
    );
    INSERT INTO temp_test_results VALUES (5, 'anon', 'crear_pedido con servicio_abierto = false', 'FAILED', 'Permitió pedir con local cerrado');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (5, 'anon', 'crear_pedido con servicio_abierto = false', 'PASSED', 'Rechazado correctamente: ' || SQLERRM);
  END;

  -- ==================================================================
  -- TEST 6: [VALIDACIÓN] crear_pedido con p_lineas nulo
  -- ==================================================================
  BEGIN
    PERFORM public.crear_pedido(
      p_restaurante_id := 'rest_demo',
      p_tipo_servicio := 'recogida',
      p_cliente_nombre := 'Test Null Lineas',
      p_cliente_telefono := '655666777',
      p_metodo_pago := 'tarjeta',
      p_lineas := NULL
    );
    INSERT INTO temp_test_results VALUES (6, 'anon', 'crear_pedido con p_lineas nulo', 'FAILED', 'No rechazó p_lineas nulo');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (6, 'anon', 'crear_pedido con p_lineas nulo', 'PASSED', 'Rechazado correctamente: ' || SQLERRM);
  END;

  -- ==================================================================
  -- TEST 7: [VALIDACIÓN] crear_pedido con tipo_servicio inventado
  -- ==================================================================
  BEGIN
    PERFORM public.crear_pedido(
      p_restaurante_id := 'rest_demo',
      p_tipo_servicio := 'teletransporte',
      p_cliente_nombre := 'Test Servicio Invalido',
      p_cliente_telefono := '666777888',
      p_metodo_pago := 'tarjeta',
      p_lineas := '[{"producto_id": "prod_b1", "cantidad": 1, "opciones_ids": ["opt_b1_p1"]}]'::jsonb
    );
    INSERT INTO temp_test_results VALUES (7, 'anon', 'crear_pedido con tipo_servicio inventado', 'FAILED', 'Permitió servicio no válido');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (7, 'anon', 'crear_pedido con tipo_servicio inventado', 'PASSED', 'Rechazado correctamente: ' || SQLERRM);
  END;

  -- ==================================================================
  -- TEST 8: [VALIDACIÓN] crear_pedido con campos obligatorios nulos
  -- ==================================================================
  BEGIN
    PERFORM public.crear_pedido(
      p_restaurante_id := 'rest_demo',
      p_tipo_servicio := 'recogida',
      p_cliente_nombre := NULL,
      p_cliente_telefono := '677888999',
      p_metodo_pago := 'tarjeta',
      p_lineas := '[{"producto_id": "prod_b1", "cantidad": 1, "opciones_ids": ["opt_b1_p1"]}]'::jsonb
    );
    INSERT INTO temp_test_results VALUES (8, 'anon', 'crear_pedido con cliente_nombre nulo', 'FAILED', 'No validó nombre nulo');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (8, 'anon', 'crear_pedido con cliente_nombre nulo', 'PASSED', 'Rechazado correctamente: ' || SQLERRM);
  END;

  -- ==================================================================
  -- TEST 9: [AUTENTICADO SIN PERFIL] restablecer_datos_demo (DEBE DENEGAR)
  -- ==================================================================
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dummy_user_id, 'role', 'authenticated')::text, true);

    PERFORM public.restablecer_datos_demo();
    INSERT INTO temp_test_results VALUES (9, 'sin_perfil', 'restablecer_datos_demo sin perfil en BD', 'FAILED', 'Permitió ejecución a usuario sin perfil');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (9, 'sin_perfil', 'restablecer_datos_demo sin perfil en BD', 'PASSED', 'Rechazado correctamente: ' || SQLERRM);
  END;

  -- ==================================================================
  -- TEST 10: [DUEÑO B] Crear grupo con producto_id de otro restaurante (prod_b1)
  -- ==================================================================
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno_b_id, 'role', 'authenticated')::text, true);

    -- Dueño B intenta asociar un grupo de rest_b al plato prod_b1 (que es de rest_demo)
    INSERT INTO public.grupos_opciones (id, producto_id, restaurante_id, nombre, obligatorio)
    VALUES ('grp_trampa_b', 'prod_b1', 'rest_b', 'Extras Cruzados', FALSE);

    INSERT INTO temp_test_results VALUES (10, 'dueno_b', 'Crear grupo con producto_id ajeno', 'FAILED', 'Permitió asociar grupo a producto de otro restaurante');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (10, 'dueno_b', 'Crear grupo con producto_id ajeno', 'PASSED', 'Rechazado correctamente: ' || SQLERRM);
  END;

  -- ==================================================================
  -- TEST 11: [DUEÑO A] Actualizar comanda: Modificar total_cents (DEBE DENEGAR TRIGGER)
  -- ==================================================================
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno_a_id, 'role', 'authenticated')::text, true);

    UPDATE public.pedidos SET total_cents = 0 WHERE id = 'ped_demo_initial';
    INSERT INTO temp_test_results VALUES (11, 'dueno_a', 'Modificar total_cents de comanda', 'FAILED', 'Permitió cambiar importe de la comanda');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (11, 'dueno_a', 'Modificar total_cents de comanda', 'PASSED', 'Rechazado correctamente: ' || SQLERRM);
  END;

  -- ==================================================================
  -- TEST 12: [DUEÑO A] Actualizar comanda: Modificar estado = 'cocina' (DEBE PERMITIR)
  -- ==================================================================
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno_a_id, 'role', 'authenticated')::text, true);

    UPDATE public.pedidos SET estado = 'cocina' WHERE id = 'ped_demo_initial';
    INSERT INTO temp_test_results VALUES (12, 'dueno_a', 'Modificar estado de comanda a cocina', 'PASSED', 'Estado actualizado correctamente por lista blanca');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (12, 'dueno_a', 'Modificar estado de comanda a cocina', 'FAILED', SQLERRM);
  END;

  -- ==================================================================
  -- TEST 13: [DUEÑO A] Modificar slug de restaurante (DEBE DENEGAR TRIGGER)
  -- ==================================================================
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno_a_id, 'role', 'authenticated')::text, true);

    UPDATE public.restaurantes SET slug = 'demo-hack' WHERE id = 'rest_demo';
    INSERT INTO temp_test_results VALUES (13, 'dueno_a', 'Modificar slug de restaurante', 'FAILED', 'Permitió cambiar slug');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (13, 'dueno_a', 'Modificar slug de restaurante', 'PASSED', 'Rechazado correctamente: ' || SQLERRM);
  END;

  -- ==================================================================
  -- TEST 14: [DUEÑO A] Borrar comanda (DEBE DENEGAR RLS)
  -- ==================================================================
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno_a_id, 'role', 'authenticated')::text, true);

    DELETE FROM public.pedidos WHERE id = 'ped_demo_initial';
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

    IF v_rows_deleted = 0 THEN
      INSERT INTO temp_test_results VALUES (14, 'dueno_a', 'Borrar comanda (solo superadmin)', 'PASSED', 'Bloqueado por RLS (0 filas borradas)');
    ELSE
      INSERT INTO temp_test_results VALUES (14, 'dueno_a', 'Borrar comanda (solo superadmin)', 'FAILED', 'Permitió borrar comanda al dueño');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (14, 'dueno_a', 'Borrar comanda (solo superadmin)', 'PASSED', 'Bloqueado por política: ' || SQLERRM);
  END;

  -- ==================================================================
  -- TEST 15: [SUPERADMIN] Borrar comanda (DEBE PERMITIR)
  -- ==================================================================
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);

    DELETE FROM public.pedidos WHERE id = 'ped_demo_initial';
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

    IF v_rows_deleted > 0 THEN
      INSERT INTO temp_test_results VALUES (15, 'superadmin', 'Borrar comanda como superadmin', 'PASSED', 'Comanda borrada exitosamente por superadmin');
    ELSE
      INSERT INTO temp_test_results VALUES (15, 'superadmin', 'Borrar comanda como superadmin', 'FAILED', 'No permitió borrar comanda');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (15, 'superadmin', 'Borrar comanda como superadmin', 'FAILED', SQLERRM);
  END;

  -- ==================================================================
  -- TEST 16: [IDEMPOTENCIA] Reintento inmediato con misma clave no bloquea por teléfono
  -- ==================================================================
  BEGIN
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('role', 'anon', true);

    -- Reintento con idempotency_key 'idem_test_001'
    v_res := public.crear_pedido(
      p_restaurante_id := 'rest_demo',
      p_tipo_servicio := 'recogida',
      p_cliente_nombre := 'Carlos Prueba',
      p_cliente_telefono := '611222333',
      p_metodo_pago := 'tarjeta',
      p_idempotency_key := 'idem_test_001',
      p_lineas := '[{"producto_id": "prod_b1", "cantidad": 1, "opciones_ids": ["opt_b1_p1"]}]'::jsonb
    );

    IF (v_res->>'idempotente')::BOOLEAN THEN
      INSERT INTO temp_test_results VALUES (16, 'anon', 'Idempotencia no consume límite teléfono', 'PASSED', 'Retornó comanda existente antes de evaluar límites anti-spam');
    ELSE
      INSERT INTO temp_test_results VALUES (16, 'anon', 'Idempotencia no consume límite teléfono', 'FAILED', 'No detectó idempotencia');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO temp_test_results VALUES (16, 'anon', 'Idempotencia no consume límite teléfono', 'FAILED', SQLERRM);
  END;

END;
$$;

-- Mostrar informe de resultados de las pruebas
SELECT id, rol, test_name, resultado, detalle 
FROM temp_test_results 
ORDER BY id;

-- Consulta de auditoría 1: Todas las políticas RLS activas en el esquema público
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Consulta de auditoría 2: Tablas sin RLS en el esquema público (debe devolver 0 filas)
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND rowsecurity = false;

-- Deshacer todos los cambios de la prueba para dejar la base intacta
ROLLBACK;
