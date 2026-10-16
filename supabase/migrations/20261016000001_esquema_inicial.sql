-- Almacén Innovaciones · Esquema inicial
-- Dinero en COP como bigint (sin decimales). Fechas de negocio en America/Bogota.
-- Regla: nunca se borra. Cierres, gastos, movimientos y ajustes no se editan: se corrigen con ajustes.

alter database postgres set timezone to 'America/Bogota';
set timezone = 'America/Bogota';

-- ───────────────────────── Utilidades ─────────────────────────

create or replace function public.hoy_bogota() returns date
language sql stable as $$ select (now() at time zone 'America/Bogota')::date $$;

create or replace function public.bloquear_borrado() returns trigger
language plpgsql as $$
begin
  raise exception 'No se permite borrar en %. Registra un ajuste con el motivo.', tg_table_name;
end $$;

create or replace function public.bloquear_edicion() returns trigger
language plpgsql as $$
begin
  raise exception 'Los registros de % no se editan. Registra un ajuste con el motivo.', tg_table_name;
end $$;

-- ───────────────────────── Usuarios y roles ─────────────────────────

create table public.perfiles (
  id         uuid primary key references auth.users(id),
  nombre     text not null,
  rol        text not null default 'pendiente' check (rol in ('admin','operador','pendiente')),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create or replace function public.rol_actual() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() = 'admin', false)
$$;

create or replace function public.es_equipo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() in ('admin','operador'), false)
$$;

-- Toda cuenta nueva entra como 'pendiente' (sin acceso) hasta que la dueña le asigne rol.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

-- ───────────────────────── Catálogos ─────────────────────────

create table public.meses (
  id                     uuid primary key default gen_random_uuid(),
  mes                    date not null unique check (extract(day from mes) = 1),
  margen_bruto_estimado  numeric(4,3) not null default 0.43 check (margen_bruto_estimado > 0 and margen_bruto_estimado < 1),
  notas                  text,
  creado_en              timestamptz not null default now()
);

create table public.festivos (
  fecha   date primary key,
  nombre  text not null
);

create table public.proveedores (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null unique,
  que_vende              text,
  medio_pago_habitual    text,
  contacto               text,
  activo                 boolean not null default true,
  creado_en              timestamptz not null default now()
);

create table public.gastos_fijos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique,
  categoria       text not null,
  valor_estimado  bigint not null check (valor_estimado >= 0),
  dia_pago        smallint check (dia_pago between 1 and 31),
  frecuencia      text not null default 'Mensual' check (frecuencia in ('Mensual','Por día trabajado')),
  valor_variable  boolean not null default false,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

create table public.productos (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  referencia            text,
  categoria             text not null check (categoria in ('Miyuki','Herramientas')),
  subcategoria          text,
  unidad                text not null default 'Unidad' check (unidad in
                          ('Unidad','Gramo','Paquete','Tubo','Metro','Tira','Docena','Pieza','Paquete x100')),
  costo_unitario        bigint check (costo_unitario >= 0),
  precio                bigint check (precio >= 0),
  stock_exhibicion      numeric(12,2) not null default 0,
  stock_reserva_clases  numeric(12,2) not null default 0,
  minimo                numeric(12,2) not null default 0,
  ultimo_conteo         date,
  remate                boolean not null default false,
  grupo_conteo          text check (grupo_conteo in ('Semana 1','Semana 2','Semana 3','Semana 4')),
  proveedor_id          uuid references public.proveedores(id),
  shopify_handle        text,
  activo                boolean not null default true,
  creado_en             timestamptz not null default now()
);
create unique index productos_referencia_unica on public.productos (referencia) where referencia is not null;
create index productos_busqueda on public.productos using gin (to_tsvector('simple', coalesce(nombre,'') || ' ' || coalesce(referencia,'')));

-- El stock solo cambia mediante movimientos de inventario.
create or replace function public.proteger_stock() returns trigger
language plpgsql as $$
begin
  if (new.stock_exhibicion is distinct from old.stock_exhibicion
      or new.stock_reserva_clases is distinct from old.stock_reserva_clases
      or new.ultimo_conteo is distinct from old.ultimo_conteo)
     and coalesce(current_setting('app.desde_movimiento', true), '') <> 'si' then
    raise exception 'El stock solo cambia registrando un movimiento de inventario.';
  end if;
  return new;
end $$;
create trigger proteger_stock before update on public.productos
  for each row execute function public.proteger_stock();

-- ───────────────────────── Cierres de caja ─────────────────────────

create table public.cierres (
  id                      uuid primary key default gen_random_uuid(),
  fecha                   date not null unique default public.hoy_bogota(),
  factura_desde           integer check (factura_desde > 0),
  factura_hasta           integer check (factura_hasta > 0),
  efectivo                bigint not null default 0 check (efectivo >= 0),
  transferencias          bigint not null default 0 check (transferencias >= 0),
  datafono                bigint not null default 0 check (datafono >= 0),
  base_inicial            bigint not null default 0 check (base_inicial >= 0),
  retiro                  bigint not null default 0 check (retiro >= 0),
  venta_total_registrada  bigint check (venta_total_registrada >= 0),   -- solo históricos
  observaciones           text,
  creado_por              uuid references auth.users(id) default auth.uid(),
  creado_en               timestamptz not null default now(),
  check (factura_hasta is null or factura_desde is null or factura_hasta >= factura_desde)
);

create table public.ajustes_cierre (
  id          uuid primary key default gen_random_uuid(),
  cierre_id   uuid not null references public.cierres(id),
  campo       text not null check (campo in ('efectivo','transferencias','datafono','base_inicial','retiro')),
  diferencia  bigint not null check (diferencia <> 0),
  motivo      text not null check (length(trim(motivo)) >= 5),
  creado_por  uuid references auth.users(id) default auth.uid(),
  creado_en   timestamptz not null default now()
);

-- ───────────────────────── Gastos ─────────────────────────

create table public.gastos (
  id               uuid primary key default gen_random_uuid(),
  fecha            date not null default public.hoy_bogota(),
  categoria        text not null check (categoria in ('Nómina','Arriendo','Servicios','Plataformas','Compra de mercancía',
                     'Mantenimiento','Papelería','Exhibición y mobiliario','Publicidad','Transporte','Impuestos','Otros')),
  tipo             text not null check (tipo in ('Fijo','Variable')),
  proveedor_id     uuid references public.proveedores(id),
  beneficiario     text,                                   -- si no es un proveedor registrado
  gasto_fijo_id    uuid references public.gastos_fijos(id),
  concepto         text not null,
  valor            bigint not null,
  medio_pago       text not null default 'Sin definir' check (medio_pago in
                     ('Efectivo de caja','Débito bancario','Transferencia','Cuenta personal','Tarjeta','Sin definir')),
  soporte_url      text,                                   -- ruta en el bucket privado 'soportes'
  es_ajuste        boolean not null default false,
  ajusta_gasto_id  uuid references public.gastos(id),
  motivo_ajuste    text,
  estimado         boolean not null default false,
  creado_por       uuid references auth.users(id) default auth.uid(),
  creado_en        timestamptz not null default now(),
  check (es_ajuste or valor > 0),
  check (not es_ajuste or (valor <> 0 and length(trim(coalesce(motivo_ajuste,''))) >= 5)),
  check (proveedor_id is not null or beneficiario is not null)
);
create index gastos_fecha on public.gastos (fecha);

-- Total de gastos pagados con efectivo de caja en un día.
-- security definer: el operador lo necesita para cuadrar la caja sin ver el detalle de gastos.
create or replace function public.gastos_efectivo_dia(p_fecha date) returns bigint
language sql stable security definer set search_path = public as $$
  select case when public.es_equipo() then
    coalesce((select sum(valor) from public.gastos where fecha = p_fecha and medio_pago = 'Efectivo de caja'), 0)
  end
$$;

-- ───────────────────────── Inventario ─────────────────────────

create table public.movimientos_inventario (
  id                uuid primary key default gen_random_uuid(),
  fecha             date not null default public.hoy_bogota(),
  producto_id       uuid not null references public.productos(id),
  tipo              text not null check (tipo in ('Entrada compra','Conteo','Traslado a reserva clases',
                      'Consumo en clase','Daño/merma','Ajuste')),
  cantidad          numeric(12,2) not null,
  ubicacion         text not null default 'Exhibición' check (ubicacion in ('Exhibición','Reserva clases')),
  costo_unitario    bigint check (costo_unitario >= 0),
  proveedor_id      uuid references public.proveedores(id),
  clase_tecnica     text,
  motivo            text,
  stock_anterior    numeric(12,2),     -- lo llena el sistema
  stock_resultante  numeric(12,2),     -- lo llena el sistema
  creado_por        uuid references auth.users(id) default auth.uid(),
  creado_en         timestamptz not null default now(),
  check (case tipo when 'Conteo' then cantidad >= 0 when 'Ajuste' then cantidad <> 0 else cantidad > 0 end),
  check (tipo <> 'Ajuste' or length(trim(coalesce(motivo,''))) >= 5),
  check (tipo <> 'Consumo en clase' or ubicacion = 'Reserva clases'),
  check (tipo <> 'Traslado a reserva clases' or ubicacion = 'Reserva clases')
);
create index movimientos_producto on public.movimientos_inventario (producto_id, fecha);

-- Al guardar un movimiento se actualiza el stock del producto.
create or replace function public.aplicar_movimiento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.productos;
  antes numeric; despues numeric;
begin
  select * into p from public.productos where id = new.producto_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;

  antes := case new.ubicacion when 'Exhibición' then p.stock_exhibicion else p.stock_reserva_clases end;

  despues := case new.tipo
    when 'Conteo'                    then new.cantidad
    when 'Entrada compra'            then antes + new.cantidad
    when 'Ajuste'                    then antes + new.cantidad
    else                                  antes - new.cantidad   -- consumo, merma
  end;

  if new.tipo = 'Traslado a reserva clases' then
    if p.stock_exhibicion < new.cantidad then
      raise exception 'No alcanza: en exhibición hay % de %', p.stock_exhibicion, p.nombre;
    end if;
    antes := p.stock_reserva_clases;
    despues := antes + new.cantidad;
  elsif despues < 0 then
    raise exception 'No alcanza: en % hay % de %. Si el stock está mal, registra un conteo.', new.ubicacion, antes, p.nombre;
  end if;

  new.stock_anterior := antes;
  new.stock_resultante := despues;

  perform set_config('app.desde_movimiento', 'si', true);

  if new.tipo = 'Traslado a reserva clases' then
    update public.productos
       set stock_exhibicion = stock_exhibicion - new.cantidad,
           stock_reserva_clases = stock_reserva_clases + new.cantidad
     where id = p.id;
  elsif new.ubicacion = 'Exhibición' then
    update public.productos set stock_exhibicion = despues,
           ultimo_conteo = case when new.tipo = 'Conteo' then new.fecha else ultimo_conteo end
     where id = p.id;
  else
    update public.productos set stock_reserva_clases = despues,
           ultimo_conteo = case when new.tipo = 'Conteo' then new.fecha else ultimo_conteo end
     where id = p.id;
  end if;

  if new.tipo = 'Entrada compra' and new.costo_unitario is not null then
    update public.productos set costo_unitario = new.costo_unitario where id = p.id;
  end if;

  perform set_config('app.desde_movimiento', '', true);
  return new;
end $$;

create trigger aplicar_movimiento before insert on public.movimientos_inventario
  for each row execute function public.aplicar_movimiento();

-- ───────────────────────── Vistas ─────────────────────────

create view public.v_cierres with (security_invoker = true) as
with aj as (
  select cierre_id,
         sum(diferencia) filter (where campo = 'efectivo')       as efectivo,
         sum(diferencia) filter (where campo = 'transferencias') as transferencias,
         sum(diferencia) filter (where campo = 'datafono')       as datafono,
         sum(diferencia) filter (where campo = 'base_inicial')   as base_inicial,
         sum(diferencia) filter (where campo = 'retiro')         as retiro,
         count(*) as num_ajustes
  from public.ajustes_cierre group by cierre_id
),
base as (
  select c.id, c.fecha, c.factura_desde, c.factura_hasta,
         c.efectivo       + coalesce(aj.efectivo, 0)       as efectivo,
         c.transferencias + coalesce(aj.transferencias, 0) as transferencias,
         c.datafono       + coalesce(aj.datafono, 0)       as datafono,
         c.base_inicial   + coalesce(aj.base_inicial, 0)   as base_inicial,
         c.retiro         + coalesce(aj.retiro, 0)         as retiro,
         c.venta_total_registrada, c.observaciones, c.creado_por, c.creado_en,
         coalesce(aj.num_ajustes, 0) as num_ajustes,
         public.gastos_efectivo_dia(c.fecha) as gastos_efectivo_dia
  from public.cierres c left join aj on aj.cierre_id = c.id
),
calc as (
  select b.*,
         b.efectivo + b.transferencias + b.datafono as venta_total,
         case when b.factura_desde is not null and b.factura_hasta is not null
              then b.factura_hasta - b.factura_desde + 1 end as num_facturas,
         b.base_inicial + b.efectivo - b.gastos_efectivo_dia - b.retiro as efectivo_en_caja
  from base b
)
select calc.*,
       case when efectivo_en_caja < 0 or venta_total = 0
              or (venta_total_registrada is not null and venta_total <> venta_total_registrada)
            then 'Revisar' else 'OK' end as estado,
       array_remove(array[
         case when efectivo_en_caja < 0 then 'Caja negativa' end,
         case when venta_total = 0 then 'Venta en cero' end,
         case when venta_total_registrada is not null and venta_total <> venta_total_registrada
              then 'Medios de pago no suman la venta registrada' end
       ], null) as motivos_revisar
from calc;

create view public.v_stock_critico with (security_invoker = true) as
select id, nombre, referencia, categoria, subcategoria, unidad, stock_exhibicion, stock_reserva_clases, minimo,
       ultimo_conteo, grupo_conteo
from public.productos
where activo and minimo > 0 and stock_exhibicion <= minimo
order by (stock_exhibicion / nullif(minimo, 0)), nombre;

-- Días hábiles (lunes a sábado, sin festivos) de un mes.
create or replace function public.dias_habiles(p_mes date) returns integer
language sql stable as $$
  select count(*)::int
  from generate_series(date_trunc('month', p_mes)::date,
                       (date_trunc('month', p_mes) + interval '1 month - 1 day')::date, '1 day') d
  where extract(isodow from d) between 1 and 6
    and not exists (select 1 from public.festivos f where f.fecha = d::date)
$$;

-- ───────────────────────── Bloqueos de borrado y edición ─────────────────────────
-- Aplican a todos, incluida la llave de servicio (los triggers no se saltan con RLS).

do $$
declare t text;
begin
  foreach t in array array['perfiles','meses','festivos','proveedores','gastos_fijos','productos',
                           'cierres','ajustes_cierre','gastos','movimientos_inventario'] loop
    execute format('create trigger no_borrar before delete on public.%I for each row execute function public.bloquear_borrado()', t);
    execute format('create trigger no_vaciar before truncate on public.%I for each statement execute function public.bloquear_borrado()', t);
    execute format('revoke delete, truncate on public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;

  foreach t in array array['cierres','ajustes_cierre','gastos','movimientos_inventario'] loop
    execute format('create trigger no_editar before update on public.%I for each row execute function public.bloquear_edicion()', t);
    execute format('revoke update on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

-- ───────────────────────── RLS ─────────────────────────
-- admin = dueña · operador = Bryan (cierres e inventario) · pendiente = sin acceso

-- perfiles
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_admin());
create policy perfiles_editar on public.perfiles for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- catálogos solo admin
create policy meses_admin on public.meses for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy festivos_admin on public.festivos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy gastos_fijos_admin on public.gastos_fijos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- proveedores: el operador los ve para registrar entradas de compra
create policy proveedores_ver on public.proveedores for select to authenticated using (public.es_equipo());
create policy proveedores_crear on public.proveedores for insert to authenticated with check (public.es_admin());
create policy proveedores_editar on public.proveedores for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- productos: ambos ven; solo admin crea y edita datos del producto
create policy productos_ver on public.productos for select to authenticated using (public.es_equipo());
create policy productos_crear on public.productos for insert to authenticated with check (public.es_admin());
create policy productos_editar on public.productos for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- cierres: ambos ven y registran
create policy cierres_ver on public.cierres for select to authenticated using (public.es_equipo());
create policy cierres_crear on public.cierres for insert to authenticated
  with check (public.es_equipo() and creado_por = auth.uid());

-- ajustes de cierre: ambos ven (para que los totales cuadren); solo admin registra
create policy ajustes_cierre_ver on public.ajustes_cierre for select to authenticated using (public.es_equipo());
create policy ajustes_cierre_crear on public.ajustes_cierre for insert to authenticated
  with check (public.es_admin() and creado_por = auth.uid());

-- gastos: solo admin
create policy gastos_ver on public.gastos for select to authenticated using (public.es_admin());
create policy gastos_crear on public.gastos for insert to authenticated
  with check (public.es_admin() and creado_por = auth.uid());

-- movimientos: ambos ven y registran; el tipo 'Ajuste' es solo de admin
create policy movimientos_ver on public.movimientos_inventario for select to authenticated using (public.es_equipo());
create policy movimientos_crear on public.movimientos_inventario for insert to authenticated
  with check (public.es_equipo() and creado_por = auth.uid() and (tipo <> 'Ajuste' or public.es_admin()));

-- ───────────────────────── Storage: soportes ─────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('soportes', 'soportes', false, 10485760, array['image/jpeg','image/png','image/heic','image/webp','application/pdf']);

create policy soportes_ver on storage.objects for select to authenticated
  using (bucket_id = 'soportes' and public.es_admin());
create policy soportes_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'soportes' and public.es_admin());
-- Sin políticas de update ni delete: los soportes no se reemplazan ni se borran.

-- ───────────────────────── Datos base: festivos de Colombia ─────────────────────────

insert into public.festivos (fecha, nombre) values
  ('2026-01-01','Año Nuevo'), ('2026-01-12','Reyes Magos'), ('2026-03-23','San José'),
  ('2026-04-02','Jueves Santo'), ('2026-04-03','Viernes Santo'), ('2026-05-01','Día del Trabajo'),
  ('2026-05-18','Ascensión'), ('2026-06-08','Corpus Christi'), ('2026-06-15','Sagrado Corazón'),
  ('2026-06-29','San Pedro y San Pablo'), ('2026-07-20','Independencia'), ('2026-08-07','Batalla de Boyacá'),
  ('2026-08-17','Asunción'), ('2026-10-12','Día de la Raza'), ('2026-11-02','Todos los Santos'),
  ('2026-11-16','Independencia de Cartagena'), ('2026-12-08','Inmaculada Concepción'), ('2026-12-25','Navidad'),
  ('2027-01-01','Año Nuevo'), ('2027-01-11','Reyes Magos'), ('2027-03-22','San José'),
  ('2027-03-25','Jueves Santo'), ('2027-03-26','Viernes Santo'), ('2027-05-01','Día del Trabajo'),
  ('2027-05-10','Ascensión'), ('2027-05-31','Corpus Christi'), ('2027-06-07','Sagrado Corazón'),
  ('2027-07-05','San Pedro y San Pablo'), ('2027-07-20','Independencia'), ('2027-08-07','Batalla de Boyacá'),
  ('2027-08-16','Asunción'), ('2027-10-18','Día de la Raza'), ('2027-11-01','Todos los Santos'),
  ('2027-11-15','Independencia de Cartagena'), ('2027-12-08','Inmaculada Concepción'), ('2027-12-25','Navidad');
