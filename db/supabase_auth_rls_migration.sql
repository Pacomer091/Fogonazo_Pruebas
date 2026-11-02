-- ====================================================================
-- FOGONAZO OS - MIGRACIÓN DE SEGURIDAD, RLS Y REGLAS DE NEGOCIO
-- Archivo: db/supabase_auth_rls_migration.sql
-- Ejecutar en Supabase SQL Editor tras confirmación expresa del usuario.
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- 0. EXTENSIONES
-- --------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- --------------------------------------------------------------------
-- 1. TABLA PERFILES Y ROLES (restaurante_id ON DELETE CASCADE)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.perfiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  rol TEXT NOT NULL CHECK (rol IN ('superadmin', 'dueno')),
  restaurante_id TEXT REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  nombre TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_rol_restaurante CHECK (
    (rol = 'superadmin' AND restaurante_id IS NULL) OR
    (rol = 'dueno' AND restaurante_id IS NOT NULL)
  )
);

ALTER TABLE public.perfiles DROP CONSTRAINT IF EXISTS perfiles_restaurante_id_fkey;
ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_restaurante_id_fkey 
  FOREIGN KEY (restaurante_id) REFERENCES public.restaurantes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_perfiles_user ON public.perfiles(user_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_restaurante ON public.perfiles(restaurante_id);

-- --------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES SECURITY DEFINER (search_path = public, pg_temp)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.es_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE user_id = auth.uid() AND rol = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION public.restaurante_del_usuario()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT restaurante_id FROM public.perfiles
  WHERE user_id = auth.uid() LIMIT 1;
$$;

-- --------------------------------------------------------------------
-- 3. DIAGNÓSTICO PREVIO Y RESTRICCIONES CHECK
-- --------------------------------------------------------------------
ALTER TABLE public.restaurantes ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE public.restaurantes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS tracking_token_expira_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours') NOT NULL;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- CHECK de estados sincronizado con todo el frontend (control, seguimiento, kds, customer-engine)
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS chk_pedidos_estado_valido;
ALTER TABLE public.pedidos ADD CONSTRAINT chk_pedidos_estado_valido 
  CHECK (estado IN ('recibido', 'pendiente', 'cocina', 'en_preparacion', 'listo', 'entregado', 'cancelado'));

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS chk_pedidos_estado_pago_valido;
ALTER TABLE public.pedidos ADD CONSTRAINT chk_pedidos_estado_pago_valido
  CHECK (estado_pago IN ('pendiente', 'completado', 'fallido', 'reembolsado'));

-- Restricciones de importes >= 0 y total > 0
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS chk_productos_precio_cents;
ALTER TABLE public.productos ADD CONSTRAINT chk_productos_precio_cents 
  CHECK (precio_cents >= 0);

ALTER TABLE public.opciones_producto DROP CONSTRAINT IF EXISTS chk_opciones_precio_extra_cents;
ALTER TABLE public.opciones_producto ADD CONSTRAINT chk_opciones_precio_extra_cents 
  CHECK (precio_extra_cents >= 0);

ALTER TABLE public.lineas_de_pedido DROP CONSTRAINT IF EXISTS chk_lineas_precio_unitario;
ALTER TABLE public.lineas_de_pedido ADD CONSTRAINT chk_lineas_precio_unitario 
  CHECK (precio_unitario_cents >= 0);

ALTER TABLE public.lineas_de_pedido DROP CONSTRAINT IF EXISTS chk_lineas_total_linea;
ALTER TABLE public.lineas_de_pedido ADD CONSTRAINT chk_lineas_total_linea 
  CHECK (total_linea_cents >= 0);

ALTER TABLE public.lineas_de_pedido DROP CONSTRAINT IF EXISTS chk_lineas_cantidad;
ALTER TABLE public.lineas_de_pedido ADD CONSTRAINT chk_lineas_cantidad 
  CHECK (cantidad > 0);

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS chk_pedidos_total_cents;
ALTER TABLE public.pedidos ADD CONSTRAINT chk_pedidos_total_cents 
  CHECK (total_cents > 0);

-- Garantizar columna restaurante_id en opciones_producto
ALTER TABLE public.opciones_producto ADD COLUMN IF NOT EXISTS restaurante_id TEXT;
UPDATE public.opciones_producto op
SET restaurante_id = go.restaurante_id
FROM public.grupos_opciones go
WHERE op.grupo_id = go.id AND op.restaurante_id IS NULL;

ALTER TABLE public.opciones_producto ALTER COLUMN restaurante_id SET NOT NULL;

-- --------------------------------------------------------------------
-- 4. ÍNDICES Y CLAVES FORÁNEAS COMPUESTAS (id, restaurante_id)
-- --------------------------------------------------------------------
ALTER TABLE public.categorias DROP CONSTRAINT IF EXISTS uq_categorias_id_restaurante CASCADE;
ALTER TABLE public.categorias ADD CONSTRAINT uq_categorias_id_restaurante UNIQUE (id, restaurante_id);

ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS uq_productos_id_restaurante CASCADE;
ALTER TABLE public.productos ADD CONSTRAINT uq_productos_id_restaurante UNIQUE (id, restaurante_id);

ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS fk_productos_categoria_restaurante;
ALTER TABLE public.productos ADD CONSTRAINT fk_productos_categoria_restaurante
  FOREIGN KEY (categoria_id, restaurante_id)
  REFERENCES public.categorias(id, restaurante_id)
  ON DELETE CASCADE;

ALTER TABLE public.grupos_opciones DROP CONSTRAINT IF EXISTS uq_grupos_opciones_id_restaurante CASCADE;
ALTER TABLE public.grupos_opciones ADD CONSTRAINT uq_grupos_opciones_id_restaurante UNIQUE (id, restaurante_id);

ALTER TABLE public.grupos_opciones DROP CONSTRAINT IF EXISTS fk_grupos_opciones_producto_restaurante;
ALTER TABLE public.grupos_opciones ADD CONSTRAINT fk_grupos_opciones_producto_restaurante
  FOREIGN KEY (producto_id, restaurante_id)
  REFERENCES public.productos(id, restaurante_id)
  ON DELETE CASCADE;

ALTER TABLE public.opciones_producto DROP CONSTRAINT IF EXISTS fk_opciones_producto_restaurante;
ALTER TABLE public.opciones_producto ADD CONSTRAINT fk_opciones_producto_restaurante
  FOREIGN KEY (restaurante_id) REFERENCES public.restaurantes(id) ON DELETE CASCADE;

ALTER TABLE public.opciones_producto DROP CONSTRAINT IF EXISTS fk_opciones_producto_grupo_restaurante;
ALTER TABLE public.opciones_producto ADD CONSTRAINT fk_opciones_producto_grupo_restaurante
  FOREIGN KEY (grupo_id, restaurante_id)
  REFERENCES public.grupos_opciones(id, restaurante_id)
  ON DELETE CASCADE;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS uq_restaurante_comanda;
DROP INDEX IF EXISTS public.uq_pedidos_restaurante_comanda;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_restaurante_comanda 
  ON public.pedidos(restaurante_id, numero_comanda);

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_idempotency_key_key;
DROP INDEX IF EXISTS public.idx_pedidos_idempotency;
DROP INDEX IF EXISTS public.uq_pedidos_restaurante_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_restaurante_idempotency 
  ON public.pedidos(restaurante_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS uq_pedidos_id_restaurante CASCADE;
ALTER TABLE public.pedidos ADD CONSTRAINT uq_pedidos_id_restaurante UNIQUE (id, restaurante_id);

ALTER TABLE public.lineas_de_pedido DROP CONSTRAINT IF EXISTS fk_lineas_pedido_restaurante;
ALTER TABLE public.lineas_de_pedido ADD CONSTRAINT fk_lineas_pedido_restaurante
  FOREIGN KEY (pedido_id, restaurante_id)
  REFERENCES public.pedidos(id, restaurante_id)
  ON DELETE CASCADE;

-- Eliminación de fk_lineas_producto_restaurante para permitir borrar platos sin bloquear comandas históricas
ALTER TABLE public.lineas_de_pedido DROP CONSTRAINT IF EXISTS fk_lineas_producto_restaurante;

ALTER TABLE public.mensajes_chat DROP CONSTRAINT IF EXISTS fk_mensajes_chat_pedido_restaurante;
ALTER TABLE public.mensajes_chat ADD CONSTRAINT fk_mensajes_chat_pedido_restaurante
  FOREIGN KEY (pedido_id, restaurante_id)
  REFERENCES public.pedidos(id, restaurante_id)
  ON DELETE CASCADE;

-- --------------------------------------------------------------------
-- 5. VISTA PÚBLICA DE RESTAURANTES (SIN email_contacto)
-- --------------------------------------------------------------------
CREATE OR REPLACE VIEW public.restaurantes_publicos
WITH (security_invoker = false)
AS
SELECT
  id,
  slug,
  dominio_personalizado,
  nombre,
  tagline,
  logo_url,
  banner_url,
  color_primario,
  color_secundario,
  telefono,
  direccion,
  moneda,
  pedido_minimo_cents,
  coste_envio_cents,
  servicio_abierto,
  funciones_json
FROM public.restaurantes
WHERE activo = TRUE;

-- --------------------------------------------------------------------
-- 6. LIMPIEZA TOTAL DE POLÍTICAS, REVOCACIÓN DE PERMISOS Y PRIVILEGIOS POR DEFECTO
-- --------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END;
$$;

-- Revocar todos los permisos a anon sobre objetos existentes
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

-- Configurar ALTER DEFAULT PRIVILEGES para que anon y authenticated no reciban permisos automáticos en futuras tablas
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;

-- Conceder EXECUTE a anon y authenticated para las funciones auxiliares de RLS
GRANT EXECUTE ON FUNCTION public.es_superadmin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurante_del_usuario() TO anon, authenticated;

-- Conceder a anon SELECT exclusivamente en la vista pública y en las tablas de la carta
GRANT SELECT ON public.restaurantes_publicos TO anon;
GRANT SELECT ON public.categorias TO anon;
GRANT SELECT ON public.productos TO anon;
GRANT SELECT ON public.grupos_opciones TO anon;
GRANT SELECT ON public.opciones_producto TO anon;
GRANT SELECT ON public.horarios TO anon;
GRANT SELECT ON public.zonas_de_reparto TO anon;

-- --------------------------------------------------------------------
-- 7. TRIGGERS CON LISTA BLANCA JSONB (search_path = public, pg_temp)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_pedidos_update_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Superadmin o llamada autorizada desde el RPC de confirmación de pago simulado
  IF es_superadmin() OR current_setting('fogonazo.rpc_pago', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Lista blanca para dueños: SOLO se permite modificar el estado
  IF (to_jsonb(NEW) - ARRAY['estado', 'updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'updated_at']) THEN
    RAISE EXCEPTION 'Operación no permitida: en pedidos solo se permite actualizar el estado.';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_update_columns ON public.pedidos;
CREATE TRIGGER trg_pedidos_update_columns
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.check_pedidos_update_columns();

CREATE OR REPLACE FUNCTION public.check_restaurantes_update_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF es_superadmin() THEN
    RETURN NEW;
  END IF;

  -- Lista blanca para dueños: únicamente configuración de marca y operativa (sin slug, dominio, activo ni funciones)
  IF (to_jsonb(NEW) - ARRAY[
    'nombre',
    'tagline',
    'logo_url',
    'banner_url',
    'color_primario',
    'color_secundario',
    'telefono',
    'email_contacto',
    'direccion',
    'moneda',
    'pedido_minimo_cents',
    'coste_envio_cents',
    'servicio_abierto',
    'updated_at'
  ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
    'nombre',
    'tagline',
    'logo_url',
    'banner_url',
    'color_primario',
    'color_secundario',
    'telefono',
    'email_contacto',
    'direccion',
    'moneda',
    'pedido_minimo_cents',
    'coste_envio_cents',
    'servicio_abierto',
    'updated_at'
  ]) THEN
    RAISE EXCEPTION 'Operación no permitida: las columnas slug, dominio_personalizado, activo y funciones_json solo pueden modificarse mediante el RPC de superadmin.';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restaurantes_update_columns ON public.restaurantes;
CREATE TRIGGER trg_restaurantes_update_columns
  BEFORE UPDATE ON public.restaurantes
  FOR EACH ROW
  EXECUTE FUNCTION public.check_restaurantes_update_columns();

-- --------------------------------------------------------------------
-- 8. POLÍTICAS RLS
-- --------------------------------------------------------------------
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_opciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opciones_producto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineas_de_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zonas_de_reparto ENABLE ROW LEVEL SECURITY;

-- 8.1 PERFILES (solo perfiles_select y perfiles_admin; sin perfiles_update)
CREATE POLICY perfiles_select ON public.perfiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR es_superadmin());

CREATE POLICY perfiles_admin ON public.perfiles
  FOR ALL TO authenticated
  USING (es_superadmin())
  WITH CHECK (es_superadmin());

-- 8.2 RESTAURANTES (anon no tiene SELECT directo; usa restaurantes_publicos)
CREATE POLICY restaurantes_select ON public.restaurantes
  FOR SELECT TO authenticated
  USING (es_superadmin() OR id = restaurante_del_usuario());

CREATE POLICY restaurantes_update ON public.restaurantes
  FOR UPDATE TO authenticated
  USING (es_superadmin() OR id = restaurante_del_usuario())
  WITH CHECK (es_superadmin() OR id = restaurante_del_usuario());

CREATE POLICY restaurantes_admin ON public.restaurantes
  FOR ALL TO authenticated
  USING (es_superadmin())
  WITH CHECK (es_superadmin());

-- 8.3 CATEGORÍAS
CREATE POLICY categorias_select ON public.categorias
  FOR SELECT TO anon, authenticated
  USING (activa = TRUE OR es_superadmin() OR restaurante_id = restaurante_del_usuario());

CREATE POLICY categorias_all ON public.categorias
  FOR ALL TO authenticated
  USING (es_superadmin() OR restaurante_id = restaurante_del_usuario())
  WITH CHECK (es_superadmin() OR restaurante_id = restaurante_del_usuario());

-- 8.4 PRODUCTOS
CREATE POLICY productos_select ON public.productos
  FOR SELECT TO anon, authenticated
  USING (disponible = TRUE OR es_superadmin() OR restaurante_id = restaurante_del_usuario());

CREATE POLICY productos_all ON public.productos
  FOR ALL TO authenticated
  USING (es_superadmin() OR restaurante_id = restaurante_del_usuario())
  WITH CHECK (
    es_superadmin() OR (
      restaurante_id = restaurante_del_usuario() AND
      EXISTS (
        SELECT 1 FROM public.categorias c
        WHERE c.id = categoria_id AND c.restaurante_id = restaurante_del_usuario()
      )
    )
  );

-- 8.5 GRUPOS DE OPCIONES (Disponibilidad ligada al plato padre)
CREATE POLICY grupos_opciones_select ON public.grupos_opciones
  FOR SELECT TO anon, authenticated
  USING (
    es_superadmin() OR
    restaurante_id = restaurante_del_usuario() OR
    EXISTS (
      SELECT 1 FROM public.productos p
      WHERE p.id = grupos_opciones.producto_id
        AND p.disponible = TRUE
        AND p.restaurante_id = grupos_opciones.restaurante_id
    )
  );

CREATE POLICY grupos_opciones_all ON public.grupos_opciones
  FOR ALL TO authenticated
  USING (es_superadmin() OR restaurante_id = restaurante_del_usuario())
  WITH CHECK (
    es_superadmin() OR (
      restaurante_id = restaurante_del_usuario() AND
      EXISTS (
        SELECT 1 FROM public.productos p
        WHERE p.id = producto_id AND p.restaurante_id = restaurante_del_usuario()
      )
    )
  );

-- 8.6 OPCIONES DE PRODUCTO (Disponibilidad ligada a la opción y al plato padre)
CREATE POLICY opciones_producto_select ON public.opciones_producto
  FOR SELECT TO anon, authenticated
  USING (
    es_superadmin() OR
    restaurante_id = restaurante_del_usuario() OR
    (
      disponible = TRUE AND
      EXISTS (
        SELECT 1 FROM public.grupos_opciones go
        JOIN public.productos p ON p.id = go.producto_id
        WHERE go.id = opciones_producto.grupo_id
          AND p.disponible = TRUE
          AND go.restaurante_id = opciones_producto.restaurante_id
      )
    )
  );

CREATE POLICY opciones_producto_all ON public.opciones_producto
  FOR ALL TO authenticated
  USING (es_superadmin() OR restaurante_id = restaurante_del_usuario())
  WITH CHECK (
    es_superadmin() OR (
      restaurante_id = restaurante_del_usuario() AND
      EXISTS (
        SELECT 1 FROM public.grupos_opciones go
        WHERE go.id = grupo_id AND go.restaurante_id = restaurante_del_usuario()
      )
    )
  );

-- 8.7 PEDIDOS (Sin SELECT/INSERT directo para anon; DELETE solo superadmin)
CREATE POLICY pedidos_select ON public.pedidos
  FOR SELECT TO authenticated
  USING (es_superadmin() OR restaurante_id = restaurante_del_usuario());

CREATE POLICY pedidos_update ON public.pedidos
  FOR UPDATE TO authenticated
  USING (es_superadmin() OR restaurante_id = restaurante_del_usuario())
  WITH CHECK (es_superadmin() OR restaurante_id = restaurante_del_usuario());

CREATE POLICY pedidos_delete ON public.pedidos
  FOR DELETE TO authenticated
  USING (es_superadmin());

-- 8.8 LÍNEAS DE PEDIDO
CREATE POLICY lineas_select ON public.lineas_de_pedido
  FOR SELECT TO authenticated
  USING (es_superadmin() OR restaurante_id = restaurante_del_usuario());

CREATE POLICY lineas_delete ON public.lineas_de_pedido
  FOR DELETE TO authenticated
  USING (es_superadmin());

-- 8.9 MENSAJES DE CHAT
CREATE POLICY mensajes_chat_select ON public.mensajes_chat
  FOR SELECT TO authenticated
  USING (es_superadmin() OR restaurante_id = restaurante_del_usuario());

CREATE POLICY mensajes_chat_insert ON public.mensajes_chat
  FOR INSERT TO authenticated
  WITH CHECK (
    es_superadmin() OR (
      restaurante_id = restaurante_del_usuario() AND
      remitente = 'restaurante' AND
      EXISTS (
        SELECT 1 FROM public.pedidos p
        WHERE p.id = pedido_id AND p.restaurante_id = restaurante_del_usuario()
      )
    )
  );

-- 8.10 HORARIOS Y ZONAS
CREATE POLICY horarios_select ON public.horarios
  FOR SELECT TO anon, authenticated
  USING (activo = TRUE OR es_superadmin() OR restaurante_id = restaurante_del_usuario());

CREATE POLICY horarios_all ON public.horarios
  FOR ALL TO authenticated
  USING (es_superadmin() OR restaurante_id = restaurante_del_usuario())
  WITH CHECK (es_superadmin() OR restaurante_id = restaurante_del_usuario());

CREATE POLICY zonas_select ON public.zonas_de_reparto
  FOR SELECT TO anon, authenticated
  USING (activa = TRUE OR es_superadmin() OR restaurante_id = restaurante_del_usuario());

CREATE POLICY zonas_all ON public.zonas_de_reparto
  FOR ALL TO authenticated
  USING (es_superadmin() OR restaurante_id = restaurante_del_usuario())
  WITH CHECK (es_superadmin() OR restaurante_id = restaurante_del_usuario());

-- --------------------------------------------------------------------
-- 9. PROCEDIMIENTOS ALMACENADOS (RPCs)
-- --------------------------------------------------------------------

-- Limpieza de sobrecargas anteriores de crear_pedido
DROP FUNCTION IF EXISTS public.crear_pedido(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.crear_pedido(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

-- 9.1 CREAR PEDIDO
-- - Comprobación explícita de valores nulos o vacíos en nombre, teléfono, tipo_servicio y metodo_pago
-- - Acepta tipo_servicio real del frontend ('delivery', 'recogida') y mapea a 'delivery'/'takeaway'
-- - Castea funciones_json a jsonb y trata clave ausente como habilitada
-- - Idempotencia comprobada ANTES de los límites de teléfono para no bloquear reintentos legítimos
-- - Lock transaccional exclusivo por restaurante para numeración atómica
-- - Inserta estado_pago = 'pendiente'
CREATE OR REPLACE FUNCTION public.crear_pedido(
  p_restaurante_id TEXT,
  p_tipo_servicio TEXT,
  p_cliente_nombre TEXT,
  p_cliente_telefono TEXT,
  p_cliente_email TEXT DEFAULT NULL,
  p_direccion_entrega TEXT DEFAULT NULL,
  p_notas_cliente TEXT DEFAULT NULL,
  p_metodo_pago TEXT DEFAULT 'tarjeta',
  p_idempotency_key TEXT DEFAULT NULL,
  p_lineas JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rest RECORD;
  v_num_comanda INTEGER;
  v_token TEXT;
  v_pedido_id TEXT;
  v_linea JSONB;
  v_prod RECORD;
  v_grp RECORD;
  v_opt_id TEXT;
  v_opt_record RECORD;
  v_opt_ids_array TEXT[];
  v_selected_count INTEGER;
  v_extras_json JSONB;
  v_extras_total_cents INTEGER;
  v_linea_total_cents INTEGER;
  v_subtotal_cents INTEGER := 0;
  v_gastos_envio_cents INTEGER := 0;
  v_total_cents INTEGER := 0;
  v_existing_id TEXT;
  v_existing_token TEXT;
  v_line_index INTEGER := 0;
  v_cantidad INTEGER;
  v_clave_funcion TEXT;
  v_tipo_guardado TEXT;
  v_funciones_json JSONB;
BEGIN
  -- 1. Bloqueo transaccional exclusivo por restaurante
  PERFORM pg_advisory_xact_lock(hashtext(p_restaurante_id));

  -- 2. Idempotencia: Comprobada ANTES de los límites de teléfono para permitir reintentos legítimos
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    SELECT id, tracking_token INTO v_existing_id, v_existing_token
    FROM public.pedidos
    WHERE restaurante_id = p_restaurante_id
      AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'pedido_id', v_existing_id,
        'tracking_token', v_existing_token,
        'idempotente', true
      );
    END IF;
  END IF;

  -- 3. Comprobaciones explícitas de valores nulos o vacíos
  IF p_cliente_nombre IS NULL OR trim(p_cliente_nombre) = '' THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio.';
  END IF;

  IF p_cliente_telefono IS NULL OR trim(p_cliente_telefono) = '' THEN
    RAISE EXCEPTION 'El teléfono del cliente es obligatorio.';
  END IF;

  IF p_tipo_servicio IS NULL OR trim(p_tipo_servicio) = '' THEN
    RAISE EXCEPTION 'El tipo de servicio es obligatorio.';
  END IF;

  IF p_metodo_pago IS NULL OR trim(p_metodo_pago) = '' THEN
    RAISE EXCEPTION 'El método de pago es obligatorio.';
  END IF;

  -- 4. Límites anti-abuso temporales (mientras la Edge Function asuma IP real y captcha)
  -- 4.1 Límite por teléfono (máx 2 pedidos en 60s)
  IF (
    SELECT COUNT(*) 
    FROM public.pedidos 
    WHERE cliente_telefono = trim(p_cliente_telefono) 
      AND created_at > NOW() - INTERVAL '60 seconds'
  ) >= 2 THEN
    RAISE EXCEPTION 'Demasiados pedidos recientes desde este número de teléfono. Espera un momento antes de volver a intentarlo.';
  END IF;

  -- 4.2 Límite global por restaurante (máx 15 pedidos en 10s)
  IF (
    SELECT COUNT(*) 
    FROM public.pedidos 
    WHERE restaurante_id = p_restaurante_id 
      AND created_at > NOW() - INTERVAL '10 seconds'
  ) >= 15 THEN
    RAISE EXCEPTION 'El restaurante está recibiendo un alto volumen de pedidos. Por favor, reinténtalo en unos segundos.';
  END IF;

  -- 5. Validación de líneas: no nulo, tipo array y límites de tamaño
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Las líneas del pedido son obligatorias y deben ser un array JSON no vacío.';
  END IF;

  IF jsonb_array_length(p_lineas) > 30 THEN
    RAISE EXCEPTION 'El pedido no puede contener más de 30 líneas de productos.';
  END IF;

  -- 6. Validar restaurante activo y servicio abierto
  SELECT * INTO v_rest FROM public.restaurantes WHERE id = p_restaurante_id AND activo = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El restaurante no existe o no se encuentra activo.';
  END IF;

  IF NOT v_rest.servicio_abierto THEN
    RAISE EXCEPTION 'El restaurante se encuentra cerrado actualmente.';
  END IF;

  -- 7. Validar tipo de servicio y mapear a claves de funciones_json ('delivery', 'takeaway')
  IF p_tipo_servicio NOT IN ('delivery', 'recogida', 'takeaway') THEN
    RAISE EXCEPTION 'Tipo de servicio no válido. Permitidos: delivery, recogida.';
  END IF;

  IF p_tipo_servicio = 'delivery' THEN
    v_clave_funcion := 'delivery';
    v_tipo_guardado := 'delivery';
  ELSE
    v_clave_funcion := 'takeaway';
    v_tipo_guardado := 'recogida';
  END IF;

  -- Castear funciones_json a jsonb y tratar clave ausente como habilitada
  v_funciones_json := COALESCE(v_rest.funciones_json::jsonb, '{}'::jsonb);
  IF (v_funciones_json ? v_clave_funcion) AND NOT COALESCE((v_funciones_json->>v_clave_funcion)::BOOLEAN, TRUE) THEN
    RAISE EXCEPTION 'El servicio "%" no está habilitado actualmente en este restaurante.', p_tipo_servicio;
  END IF;

  -- 8. Dirección obligatoria en delivery
  IF v_tipo_guardado = 'delivery' AND (p_direccion_entrega IS NULL OR trim(p_direccion_entrega) = '') THEN
    RAISE EXCEPTION 'La dirección de entrega es obligatoria para pedidos a domicilio.';
  END IF;

  -- 9. Validaciones de longitud y valores permitidos
  IF length(trim(p_cliente_nombre)) < 2 OR length(trim(p_cliente_nombre)) > 100 THEN
    RAISE EXCEPTION 'El nombre del cliente debe tener entre 2 y 100 caracteres.';
  END IF;

  IF length(trim(p_cliente_telefono)) < 6 OR length(trim(p_cliente_telefono)) > 20 THEN
    RAISE EXCEPTION 'El teléfono del cliente debe tener entre 6 y 20 caracteres.';
  END IF;

  IF p_direccion_entrega IS NOT NULL AND length(p_direccion_entrega) > 250 THEN
    RAISE EXCEPTION 'La dirección de entrega no puede superar los 250 caracteres.';
  END IF;

  IF p_notas_cliente IS NOT NULL AND length(p_notas_cliente) > 500 THEN
    RAISE EXCEPTION 'Las notas del pedido no pueden superar los 500 caracteres.';
  END IF;

  IF p_metodo_pago NOT IN ('tarjeta', 'bizum', 'efectivo') THEN
    RAISE EXCEPTION 'Método de pago no válido. Permitidos: tarjeta, bizum, efectivo.';
  END IF;

  -- 10. Validación línea por línea
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_cantidad := COALESCE((v_linea->>'cantidad')::INTEGER, 1);
    IF v_cantidad <= 0 OR v_cantidad > 50 THEN
      RAISE EXCEPTION 'La cantidad de cada producto debe ser un entero entre 1 y 50.';
    END IF;

    -- Validar existencia y disponibilidad del producto
    SELECT id, nombre, precio_cents, disponible
    INTO v_prod
    FROM public.productos
    WHERE id = (v_linea->>'producto_id')
      AND restaurante_id = p_restaurante_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto % no encontrado o no pertenece a este restaurante.', (v_linea->>'producto_id');
    END IF;

    IF NOT v_prod.disponible THEN
      RAISE EXCEPTION 'El producto % no se encuentra disponible actualmente.', v_prod.nombre;
    END IF;

    -- Extraer opciones y verificar que no existan duplicadas dentro del mismo plato
    v_opt_ids_array := ARRAY[]::TEXT[];
    IF v_linea ? 'opciones_ids' AND jsonb_typeof(v_linea->'opciones_ids') = 'array' THEN
      SELECT COALESCE(array_agg(opt_elem), ARRAY[]::TEXT[])
      INTO v_opt_ids_array
      FROM jsonb_array_elements_text(v_linea->'opciones_ids') AS opt_elem;

      IF cardinality(v_opt_ids_array) > 0 THEN
        IF (
          SELECT COUNT(DISTINCT opt) 
          FROM unnest(v_opt_ids_array) AS opt
        ) <> cardinality(v_opt_ids_array) THEN
          RAISE EXCEPTION 'No se permiten opciones duplicadas dentro del mismo plato.';
        END IF;
      END IF;
    END IF;

    -- Validar grupos obligatorios y max_seleccion del plato
    FOR v_grp IN
      SELECT id, nombre, obligatorio, max_seleccion
      FROM public.grupos_opciones
      WHERE producto_id = v_prod.id AND restaurante_id = p_restaurante_id
    LOOP
      SELECT COUNT(*)
      INTO v_selected_count
      FROM public.opciones_producto op
      WHERE op.grupo_id = v_grp.id
        AND op.id = ANY(v_opt_ids_array);

      IF v_grp.obligatorio AND v_selected_count = 0 THEN
        RAISE EXCEPTION 'El grupo de opciones "%" es obligatorio para el plato "%".', v_grp.nombre, v_prod.nombre;
      END IF;

      IF v_grp.max_seleccion IS NOT NULL AND v_grp.max_seleccion > 0 AND v_selected_count > v_grp.max_seleccion THEN
        RAISE EXCEPTION 'El grupo "%" permite como máximo % selecciones en el plato "%".', v_grp.nombre, v_grp.max_seleccion, v_prod.nombre;
      END IF;
    END LOOP;

    -- Validar pertenencia de cada opción al plato y calcular importes
    v_extras_json := '[]'::jsonb;
    v_extras_total_cents := 0;

    IF cardinality(v_opt_ids_array) > 0 THEN
      FOR v_opt_id IN SELECT unnest(v_opt_ids_array)
      LOOP
        SELECT op.id, op.nombre, op.precio_extra_cents, go.nombre AS grupo_nombre, go.producto_id, go.restaurante_id
        INTO v_opt_record
        FROM public.opciones_producto op
        JOIN public.grupos_opciones go ON go.id = op.grupo_id
        WHERE op.id = v_opt_id
          AND op.disponible = TRUE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Opción % no disponible o inválida.', v_opt_id;
        END IF;

        IF v_opt_record.producto_id != v_prod.id OR v_opt_record.restaurante_id != p_restaurante_id THEN
          RAISE EXCEPTION 'Fraude detectado: la opción % no pertenece al plato % o al restaurante %.', v_opt_id, v_prod.id, p_restaurante_id;
        END IF;

        v_extras_total_cents := v_extras_total_cents + v_opt_record.precio_extra_cents;
        v_extras_json := v_extras_json || jsonb_build_object(
          'id', v_opt_record.id,
          'nombre', v_opt_record.nombre,
          'grupo_nombre', v_opt_record.grupo_nombre,
          'precio_extra_cents', v_opt_record.precio_extra_cents
        );
      END LOOP;
    END IF;

    v_linea_total_cents := (v_prod.precio_cents + v_extras_total_cents) * v_cantidad;
    v_subtotal_cents := v_subtotal_cents + v_linea_total_cents;
  END LOOP;

  -- 11. Gastos de envío y total
  IF v_tipo_guardado = 'delivery' THEN
    v_gastos_envio_cents := COALESCE(v_rest.coste_envio_cents, 0);
  ELSE
    v_gastos_envio_cents := 0;
  END IF;

  v_total_cents := v_subtotal_cents + v_gastos_envio_cents;

  IF v_total_cents <= 0 THEN
    RAISE EXCEPTION 'El importe total del pedido debe ser superior a 0 céntimos.';
  END IF;

  IF v_tipo_guardado = 'delivery' AND v_rest.pedido_minimo_cents > 0 AND v_subtotal_cents < v_rest.pedido_minimo_cents THEN
    RAISE EXCEPTION 'El pedido no alcanza el pedido mínimo requerido (% céntimos).', v_rest.pedido_minimo_cents;
  END IF;

  -- 12. Número de comanda secuencial diario/global
  SELECT COALESCE(MAX(numero_comanda), 100) + 1
  INTO v_num_comanda
  FROM public.pedidos
  WHERE restaurante_id = p_restaurante_id;

  -- 13. Token seguro
  BEGIN
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
  EXCEPTION WHEN OTHERS THEN
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  END;

  v_pedido_id := 'ped_' || replace(gen_random_uuid()::text, '-', '');

  -- 14. Inserción con estado_pago = 'pendiente'
  INSERT INTO public.pedidos (
    id, restaurante_id, numero_comanda, tracking_token, tracking_token_expira_at,
    tipo_servicio, direccion_entrega, cliente_nombre, cliente_telefono, cliente_email,
    notas_cliente, subtotal_cents, gastos_envio_cents, total_cents,
    metodo_pago, estado_pago, estado, idempotency_key
  ) VALUES (
    v_pedido_id, p_restaurante_id, v_num_comanda, v_token, NOW() + INTERVAL '48 hours',
    v_tipo_guardado, p_direccion_entrega, trim(p_cliente_nombre), trim(p_cliente_telefono), trim(p_cliente_email),
    trim(p_notas_cliente), v_subtotal_cents, v_gastos_envio_cents, v_total_cents,
    p_metodo_pago, 'pendiente', 'recibido', p_idempotency_key
  );

  -- 15. Inserción de líneas
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_line_index := v_line_index + 1;
    v_cantidad := COALESCE((v_linea->>'cantidad')::INTEGER, 1);

    SELECT id, nombre, precio_cents INTO v_prod
    FROM public.productos
    WHERE id = (v_linea->>'producto_id') AND restaurante_id = p_restaurante_id;

    v_extras_json := '[]'::jsonb;
    v_extras_total_cents := 0;

    IF v_linea ? 'opciones_ids' AND jsonb_typeof(v_linea->'opciones_ids') = 'array' THEN
      FOR v_opt_id IN SELECT jsonb_array_elements_text(v_linea->'opciones_ids')
      LOOP
        SELECT op.id, op.nombre, op.precio_extra_cents, go.nombre AS grupo_nombre
        INTO v_opt_record
        FROM public.opciones_producto op
        JOIN public.grupos_opciones go ON go.id = op.grupo_id
        WHERE op.id = v_opt_id;

        v_extras_total_cents := v_extras_total_cents + v_opt_record.precio_extra_cents;
        v_extras_json := v_extras_json || jsonb_build_object(
          'id', v_opt_record.id,
          'nombre', v_opt_record.nombre,
          'grupo_nombre', v_opt_record.grupo_nombre,
          'precio_extra_cents', v_opt_record.precio_extra_cents
        );
      END LOOP;
    END IF;

    v_linea_total_cents := (v_prod.precio_cents + v_extras_total_cents) * v_cantidad;

    INSERT INTO public.lineas_de_pedido (
      id, pedido_id, restaurante_id, producto_id, nombre_producto,
      precio_unitario_cents, cantidad, extras_json, total_linea_cents
    ) VALUES (
      'lin_' || v_pedido_id || '_' || v_line_index,
      v_pedido_id,
      p_restaurante_id,
      v_prod.id,
      v_prod.nombre,
      v_prod.precio_cents,
      v_cantidad,
      v_extras_json,
      v_linea_total_cents
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'pedido_id', v_pedido_id,
    'numero_comanda', v_num_comanda,
    'tracking_token', v_token,
    'total_cents', v_total_cents,
    'estado_pago', 'pendiente'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_pedido(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;

-- 9.2 PAGO SIMULADO (EXCLUSIVAMENTE PARA rest_demo CON fogonazo.rpc_pago)
CREATE OR REPLACE FUNCTION public.confirmar_pago_simulado_demo(p_tracking_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ped RECORD;
BEGIN
  IF p_tracking_token IS NULL OR trim(p_tracking_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token no proporcionado.');
  END IF;

  SELECT id, restaurante_id, estado_pago, tracking_token_expira_at
  INTO v_ped
  FROM public.pedidos
  WHERE tracking_token = p_tracking_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comanda no encontrada.');
  END IF;

  -- REGLA ESTRICTA: El pago simulado SOLO está permitido en el restaurante de demostración
  IF v_ped.restaurante_id <> 'rest_demo' THEN
    RAISE EXCEPTION 'El pago simulado no está permitido en este restaurante. Solo disponible en rest_demo.';
  END IF;

  IF v_ped.tracking_token_expira_at <= NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El enlace de seguimiento ha caducado.');
  END IF;

  -- Activar flag local en la transacción para que el trigger permita modificar estado_pago
  PERFORM set_config('fogonazo.rpc_pago', 'on', true);

  UPDATE public.pedidos
  SET
    estado_pago = 'completado',
    updated_at = NOW()
  WHERE id = v_ped.id;

  RETURN jsonb_build_object(
    'ok', true,
    'mensaje', 'Pago simulado completado con éxito para la comanda de demostración.',
    'pedido_id', v_ped.id,
    'estado_pago', 'completado'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_pago_simulado_demo(TEXT) TO anon, authenticated;

-- 9.3 OBTENER PEDIDO POR TOKEN (Validación de caducidad 48h)
CREATE OR REPLACE FUNCTION public.obtener_pedido_por_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res JSONB;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token no proporcionado');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'id', p.id,
    'restaurante_id', p.restaurante_id,
    'numero_comanda', p.numero_comanda,
    'tracking_token', p.tracking_token,
    'tracking_token_expira_at', p.tracking_token_expira_at,
    'tipo_servicio', p.tipo_servicio,
    'cliente_nombre', p.cliente_nombre,
    'direccion_entrega', p.direccion_entrega,
    'subtotal_cents', p.subtotal_cents,
    'gastos_envio_cents', p.gastos_envio_cents,
    'total_cents', p.total_cents,
    'metodo_pago', p.metodo_pago,
    'estado_pago', p.estado_pago,
    'estado', p.estado,
    'created_at', p.created_at,
    'lineas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id,
        'nombre_producto', l.nombre_producto,
        'precio_unitario_cents', l.precio_unitario_cents,
        'cantidad', l.cantidad,
        'extras_json', l.extras_json,
        'total_linea_cents', l.total_linea_cents
      ))
      FROM public.lineas_de_pedido l
      WHERE l.pedido_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_res
  FROM public.pedidos p
  WHERE p.tracking_token = p_token
    AND p.tracking_token_expira_at > NOW();

  IF v_res IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado o el enlace de seguimiento ha caducado (máximo 48 horas).');
  END IF;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_pedido_por_token(TEXT) TO anon, authenticated;

-- 9.4 CHAT DEL CLIENTE: ENVIAR MENSAJE (Con límite de 5 msg/min y máx 50 por comanda)
CREATE OR REPLACE FUNCTION public.enviar_mensaje_cliente(
  p_token TEXT,
  p_texto TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ped RECORD;
  v_msg_id TEXT;
  v_limpio TEXT;
BEGIN
  v_limpio := trim(COALESCE(p_texto, ''));
  IF length(v_limpio) = 0 OR length(v_limpio) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El mensaje debe tener entre 1 y 500 caracteres.');
  END IF;

  SELECT id, restaurante_id INTO v_ped
  FROM public.pedidos
  WHERE tracking_token = p_token
    AND tracking_token_expira_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comanda no encontrada o enlace de seguimiento caducado.');
  END IF;

  -- Límite de frecuencia: máx 5 mensajes en el último minuto
  IF (
    SELECT COUNT(*) 
    FROM public.mensajes_chat 
    WHERE pedido_id = v_ped.id 
      AND remitente = 'cliente' 
      AND created_at > NOW() - INTERVAL '60 seconds'
  ) >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Demasiados mensajes enviados en poco tiempo. Espera un momento.');
  END IF;

  -- Límite total por pedido: máx 50 mensajes de cliente
  IF (
    SELECT COUNT(*) 
    FROM public.mensajes_chat 
    WHERE pedido_id = v_ped.id 
      AND remitente = 'cliente'
  ) >= 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Se ha alcanzado el límite máximo de mensajes para esta comanda.');
  END IF;

  v_msg_id := 'msg_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.mensajes_chat (
    id, pedido_id, restaurante_id, remitente, texto, created_at
  ) VALUES (
    v_msg_id, v_ped.id, v_ped.restaurante_id, 'cliente', v_limpio, NOW()
  );

  RETURN jsonb_build_object('ok', true, 'mensaje_id', v_msg_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.enviar_mensaje_cliente(TEXT, TEXT) TO anon, authenticated;

-- 9.5 CHAT DEL CLIENTE: OBTENER MENSAJES
CREATE OR REPLACE FUNCTION public.obtener_mensajes_chat_cliente(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ped RECORD;
  v_mensajes JSONB;
BEGIN
  SELECT id, restaurante_id INTO v_ped
  FROM public.pedidos
  WHERE tracking_token = p_token
    AND tracking_token_expira_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comanda no encontrada o enlace caducado.');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'remitente', remitente,
    'texto', texto,
    'created_at', created_at
  ) ORDER BY created_at ASC), '[]'::jsonb)
  INTO v_mensajes
  FROM public.mensajes_chat
  WHERE pedido_id = v_ped.id;

  RETURN jsonb_build_object('ok', true, 'mensajes', v_mensajes);
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_mensajes_chat_cliente(TEXT) TO anon, authenticated;

-- 9.6 CONFIGURACIÓN EXCLUSIVA DE SUPERADMIN
CREATE OR REPLACE FUNCTION public.superadmin_configurar_restaurante(
  p_restaurante_id TEXT,
  p_slug TEXT DEFAULT NULL,
  p_dominio_personalizado TEXT DEFAULT NULL,
  p_activo BOOLEAN DEFAULT NULL,
  p_funciones_json JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT es_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo el superadmin puede modificar estos parámetros.';
  END IF;

  UPDATE public.restaurantes
  SET
    slug = COALESCE(p_slug, slug),
    dominio_personalizado = COALESCE(p_dominio_personalizado, dominio_personalizado),
    activo = COALESCE(p_activo, activo),
    funciones_json = COALESCE(p_funciones_json, funciones_json),
    updated_at = NOW()
  WHERE id = p_restaurante_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurante con id % no encontrado.', p_restaurante_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'restaurante_id', p_restaurante_id);
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_configurar_restaurante(TEXT, TEXT, TEXT, BOOLEAN, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_configurar_restaurante(TEXT, TEXT, TEXT, BOOLEAN, JSONB) TO authenticated;

-- Limpieza de sobrecargas previas de restablecer_datos_demo
DROP FUNCTION IF EXISTS public.restablecer_datos_demo(TEXT);
DROP FUNCTION IF EXISTS public.restablecer_datos_demo();

-- 9.7 RESTABLECER DATOS DEMO (Sin parámetro, solo rest_demo, valida perfil existente e IS NOT DISTINCT FROM)
CREATE OR REPLACE FUNCTION public.restablecer_datos_demo()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_rol TEXT;
  v_user_rest TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: no autenticado.';
  END IF;

  -- Comprobar que ningún usuario sin perfil pueda ejecutarla
  SELECT rol, restaurante_id INTO v_user_rol, v_user_rest
  FROM public.perfiles
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acceso denegado: ningún usuario sin perfil puede ejecutar esta acción.';
  END IF;

  -- Comprobación con IS NOT DISTINCT FROM: solo superadmin o el dueño con restaurante_id IS NOT DISTINCT FROM 'rest_demo'
  IF NOT (v_user_rol = 'superadmin' OR (v_user_rest IS NOT DISTINCT FROM 'rest_demo')) THEN
    RAISE EXCEPTION 'Acceso denegado: solo el superadmin o el dueño de la demo pueden restablecer estos datos.';
  END IF;

  -- 1. Eliminar pedidos, líneas y chat de la demo
  DELETE FROM public.mensajes_chat WHERE restaurante_id = 'rest_demo';
  DELETE FROM public.lineas_de_pedido WHERE restaurante_id = 'rest_demo';
  DELETE FROM public.pedidos WHERE restaurante_id = 'rest_demo';

  -- 2. Restaurar la carta completa
  DELETE FROM public.opciones_producto WHERE restaurante_id = 'rest_demo';
  DELETE FROM public.grupos_opciones WHERE restaurante_id = 'rest_demo';
  DELETE FROM public.productos WHERE restaurante_id = 'rest_demo';
  DELETE FROM public.categorias WHERE restaurante_id = 'rest_demo';

  -- Categorías
  INSERT INTO public.categorias (id, restaurante_id, nombre, orden, activa) VALUES
    ('cat_demo_1', 'rest_demo', 'Smash Burgers a la Brasa', 1, TRUE),
    ('cat_demo_2', 'rest_demo', 'Entrantes & Fries', 2, TRUE),
    ('cat_demo_3', 'rest_demo', 'Postres Caseros', 3, TRUE),
    ('cat_demo_4', 'rest_demo', 'Bebidas & Cervezas', 4, TRUE);

  -- Productos
  INSERT INTO public.productos (id, restaurante_id, categoria_id, nombre, descripcion, precio_cents, imagen_url, disponible, destacado, alergenos_json) VALUES
    ('prod_b1', 'rest_demo', 'cat_demo_1', 'Smash Trufada Doble', 'Dos patties crujientes de 90g de vaca rubia madurada, doble cheddar inglés, mayonesa trufada casera y cebolla pochada en pan brioche artesano tostado con mantequilla.', 1190, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80', TRUE, TRUE, '["gluten", "lacteos", "huevo"]'::jsonb),
    ('prod_b2', 'rest_demo', 'cat_demo_1', 'Smash Bacon Cheese Clásica', 'Doble disco de carne smash con costra caramelizada, cuatro tiras de bacon ahumado crujiente, queso cheddar fundido y nuestra salsa burger secreta Fogonazo.', 1050, 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80', TRUE, TRUE, '["gluten", "lacteos", "huevo", "mostaza"]'::jsonb),
    ('prod_b3', 'rest_demo', 'cat_demo_1', 'Smash Pollo Sureño Crujiente', 'Contramuslo de pollo de corral marinado 24 horas en suero de leche, frito extracrujiente, salsa mayo-chipotle suave, ensalada de col fresca y pepinillos agridulces.', 990, 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600&auto=format&fit=crop&q=80', TRUE, FALSE, '["gluten", "lacteos", "huevo"]'::jsonb),
    ('prod_e1', 'rest_demo', 'cat_demo_2', 'Patatas Rústicas Trufadas con Parmesano', 'Patatas naturales de corte grueso doble fritura con aceite de trufa blanca de temporada, lluvia abundante de queso Parmigiano Reggiano 24 meses y orégano silvestre.', 550, 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80', TRUE, TRUE, '["lacteos"]'::jsonb),
    ('prod_e2', 'rest_demo', 'cat_demo_2', 'Alitas Glaseadas al Bourbon & Miel (6u)', 'Alitas de pollo carnosas a la brasa de encina con glaseado casero de salsa barbacoa al bourbon y miel de romero, con toque de sésamo blanco tostado.', 720, 'https://images.unsplash.com/photo-1527477378696-7a8be0d80d21?w=600&auto=format&fit=crop&q=80', TRUE, FALSE, '["sesamo", "sulfitos"]'::jsonb),
    ('prod_pos1', 'rest_demo', 'cat_demo_3', 'Tarta de Queso Fluida al Horno', 'Receta vasca tradicional con corazón cremoso fluido, elaborada con quesos artesanos de vaca y oveja, base de galleta y toque de flor de sal.', 590, 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80', TRUE, TRUE, '["gluten", "lacteos", "huevo"]'::jsonb),
    ('prod_beb1', 'rest_demo', 'cat_demo_4', 'Cerveza Artesana Fogonazo IPA (33cl)', 'India Pale Ale de elaboración propia, aromas cítricos y resinosos, cuerpo medio y amargor equilibrado. 6.2% Vol.', 350, 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&auto=format&fit=crop&q=80', TRUE, FALSE, '["gluten"]'::jsonb),
    ('prod_beb2', 'rest_demo', 'cat_demo_4', 'Limonada Casera de Jengibre y Menta', 'Zumo natural de limones recién exprimidos con infusión de jengibre fresco, hojas de hierbabuena y azúcar de caña.', 280, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80', TRUE, FALSE, '[]'::jsonb);

  -- Grupos de opciones
  INSERT INTO public.grupos_opciones (id, producto_id, restaurante_id, nombre, obligatorio, max_seleccion, orden) VALUES
    ('grp_b1_punto', 'prod_b1', 'rest_demo', 'Punto de la Carne', TRUE, 1, 1),
    ('grp_b1_extras', 'prod_b1', 'rest_demo', 'Añade Extras a tu Burger', FALSE, 3, 2),
    ('grp_b1_salsa', 'prod_b1', 'rest_demo', 'Salsa para Acompañar', FALSE, 2, 3),
    ('grp_b2_punto', 'prod_b2', 'rest_demo', 'Punto de la Carne', TRUE, 1, 1),
    ('grp_b2_extras', 'prod_b2', 'rest_demo', 'Extras Opcionales', FALSE, 3, 2);

  -- Opciones de producto
  INSERT INTO public.opciones_producto (id, grupo_id, restaurante_id, nombre, precio_extra_cents, disponible, orden) VALUES
    ('opt_b1_p1', 'grp_b1_punto', 'rest_demo', 'Al punto con costra crujiente', 0, TRUE, 1),
    ('opt_b1_p2', 'grp_b1_punto', 'rest_demo', 'Bien hecha y tostada', 0, TRUE, 2),
    ('opt_b1_e1', 'grp_b1_extras', 'rest_demo', 'Bacon crujiente caramelizado (+1,20 €)', 120, TRUE, 1),
    ('opt_b1_e2', 'grp_b1_extras', 'rest_demo', 'Queso cheddar ahumado extra (+1,00 €)', 100, TRUE, 2),
    ('opt_b1_e3', 'grp_b1_extras', 'rest_demo', 'Huevo campero frito a la plancha (+1,20 €)', 120, TRUE, 3),
    ('opt_b1_e4', 'grp_b1_extras', 'rest_demo', 'Pepinillos encurtidos artesanos (+0,50 €)', 50, TRUE, 4),
    ('opt_b1_s1', 'grp_b1_salsa', 'rest_demo', 'Salsa Mayo Trufada Extra (+1,00 €)', 100, TRUE, 1),
    ('opt_b1_s2', 'grp_b1_salsa', 'rest_demo', 'Salsa Fogonazo Secreta (+0,80 €)', 80, TRUE, 2),
    ('opt_b1_s3', 'grp_b1_salsa', 'rest_demo', 'Barbacoa al Bourbon (+0,80 €)', 80, TRUE, 3),
    ('opt_b2_p1', 'grp_b2_punto', 'rest_demo', 'Al punto con costra crujiente', 0, TRUE, 1),
    ('opt_b2_p2', 'grp_b2_punto', 'rest_demo', 'Bien pasada', 0, TRUE, 2),
    ('opt_b2_e1', 'grp_b2_extras', 'rest_demo', 'Doble ración de bacon (+1,20 €)', 120, TRUE, 1),
    ('opt_b2_e2', 'grp_b2_extras', 'rest_demo', 'Cebolla crujiente frita (+0,80 €)', 80, TRUE, 2),
    ('opt_b2_e3', 'grp_b2_extras', 'rest_demo', 'Huevo frito a la plancha (+1,20 €)', 120, TRUE, 3);

  -- Comanda inicial de prueba
  INSERT INTO public.pedidos (
    id, restaurante_id, numero_comanda, tracking_token, tracking_token_expira_at, tipo_servicio,
    direccion_entrega, cliente_nombre, cliente_telefono, cliente_email,
    notas_cliente, subtotal_cents, gastos_envio_cents, total_cents,
    metodo_pago, estado_pago, estado
  ) VALUES (
    'ped_demo_initial',
    'rest_demo',
    108,
    'token_demo_fogoneta_initial_123456789',
    NOW() + INTERVAL '48 hours',
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
  );

  INSERT INTO public.lineas_de_pedido (
    id, pedido_id, restaurante_id, producto_id, nombre_producto, precio_unitario_cents, cantidad, extras_json, total_linea_cents
  ) VALUES
    ('lin_demo_1', 'ped_demo_initial', 'rest_demo', 'prod_b1', 'Smash Trufada Doble', 1190, 1, '[{"grupo_nombre":"Punto de la Carne","opcion_nombre":"Al punto con costra crujiente","precio_extra_cents":0},{"grupo_nombre":"Extras","opcion_nombre":"Bacon crujiente caramelizado","precio_extra_cents":120}]'::jsonb, 1310),
    ('lin_demo_2', 'ped_demo_initial', 'rest_demo', 'prod_beb1', 'Cerveza Artesana Fogonazo IPA (33cl)', 350, 1, '[]'::jsonb, 350);

  RETURN jsonb_build_object(
    'ok', true,
    'mensaje', 'Carta y comanda demo restauradas con éxito para rest_demo.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restablecer_datos_demo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restablecer_datos_demo() TO authenticated;

COMMIT;
