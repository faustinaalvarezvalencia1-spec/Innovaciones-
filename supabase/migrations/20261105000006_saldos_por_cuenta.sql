-- Saldos por cuenta (desde noviembre 2026)
-- Cada cierre reparte la venta del día entre las cuentas donde quedó la plata.
-- Saldo de una cuenta = apertura + reparto de cierres − gastos pagados desde ella ± traslados − retiros (solo caja).
-- El saldo corre sin cortes: lo que queda al final de un mes es el inicial del siguiente.
-- Sin apertura registrada, la cuenta arranca en $0 el 1 de noviembre y puede quedar negativa.
-- Nada se borra ni se edita: las correcciones son filas de ajuste, traslados inversos o una apertura nueva.

-- ───────────────────────── Cuentas ─────────────────────────

create table public.cuentas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  tipo       text not null check (tipo in ('Efectivo','Banco','Billetera','Datáfono')),
  orden      smallint not null default 0,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);
-- Una sola cuenta de efectivo: es la caja de la tienda.
create unique index cuentas_una_caja on public.cuentas (tipo) where tipo = 'Efectivo';

insert into public.cuentas (nombre, tipo, orden) values
  ('Caja efectivo', 'Efectivo', 1),
  ('Daviplata', 'Billetera', 2),
  ('Bancolombia', 'Banco', 3),
  ('Nequi', 'Billetera', 4),
  ('Bold', 'Datáfono', 5);

create or replace function public.inicio_saldos() returns date
language sql immutable as $$ select date '2026-11-01' $$;

create or replace function public.cuenta_caja() returns uuid
language sql stable as $$ select id from public.cuentas where tipo = 'Efectivo' $$;

-- ───────────────────────── Saldo de apertura ─────────────────────────
-- Saldo real de la cuenta al terminar el día "fecha". Vale el más reciente por cuenta;
-- los movimientos de esa fecha o anteriores ya están dentro de ese saldo.

create table public.saldos_apertura (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references public.cuentas(id),
  fecha       date not null check (fecha >= date '2026-10-31'),
  valor       bigint not null,
  motivo      text not null check (length(trim(motivo)) >= 5),
  creado_por  uuid references auth.users(id) default auth.uid(),
  creado_en   timestamptz not null default now()
);

-- ───────────────────────── Reparto del cierre ─────────────────────────

create table public.reparto_cierre (
  id          uuid primary key default gen_random_uuid(),
  cierre_id   uuid not null references public.cierres(id),
  cuenta_id   uuid not null references public.cuentas(id),
  valor       bigint not null,
  es_ajuste   boolean not null default false,
  motivo      text,
  creado_por  uuid references auth.users(id) default auth.uid(),
  creado_en   timestamptz not null default now(),
  check (es_ajuste or valor > 0),
  check (not es_ajuste or (valor <> 0 and length(trim(coalesce(motivo, ''))) >= 5))
);
create unique index reparto_original_unico on public.reparto_cierre (cierre_id, cuenta_id) where not es_ajuste;
create index reparto_cierre_cierre on public.reparto_cierre (cierre_id);

-- ───────────────────────── Gastos: de qué cuenta salió ─────────────────────────
-- Vacío en "Cuenta personal", "Tarjeta" y "Sin definir": no afecta saldos.
-- "Efectivo de caja" sin cuenta se toma como Caja efectivo.

alter table public.gastos add column cuenta_id uuid references public.cuentas(id);

alter table public.gastos drop constraint gastos_categoria_check;
alter table public.gastos add constraint gastos_categoria_check check (categoria in ('Nómina','Arriendo','Servicios',
  'Plataformas','Compra de mercancía','Mantenimiento','Papelería','Exhibición y mobiliario','Publicidad','Transporte',
  'Impuestos','Comisiones bancarias','Otros'));

-- ───────────────────────── Traslados entre cuentas ─────────────────────────
-- Ej. Bold → Daviplata, consignar efectivo de la caja. Se corrigen con un traslado inverso.

create table public.traslados (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null default public.hoy_bogota(),
  origen_id   uuid not null references public.cuentas(id),
  destino_id  uuid not null references public.cuentas(id),
  valor       bigint not null check (valor > 0),
  concepto    text not null check (length(trim(concepto)) >= 3),
  creado_por  uuid references auth.users(id) default auth.uid(),
  creado_en   timestamptz not null default now(),
  check (origen_id <> destino_id)
);
create index traslados_fecha on public.traslados (fecha);

-- ───────────────────────── Bloqueos y RLS ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['cuentas','saldos_apertura','reparto_cierre','traslados'] loop
    execute format('create trigger no_borrar before delete on public.%I for each row execute function public.bloquear_borrado()', t);
    execute format('create trigger no_vaciar before truncate on public.%I for each statement execute function public.bloquear_borrado()', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate on public.%I from authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['saldos_apertura','reparto_cierre','traslados'] loop
    execute format('create trigger no_editar before update on public.%I for each row execute function public.bloquear_edicion()', t);
    execute format('revoke update on public.%I from authenticated', t);
  end loop;
end $$;

-- cuentas: el equipo las ve (para el reparto); solo admin crea o cambia
create policy cuentas_ver on public.cuentas for select to authenticated using (public.es_equipo());
create policy cuentas_crear on public.cuentas for insert to authenticated with check (public.es_admin());
create policy cuentas_editar on public.cuentas for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- apertura y traslados: solo admin
create policy saldos_apertura_ver on public.saldos_apertura for select to authenticated using (public.es_admin());
create policy saldos_apertura_crear on public.saldos_apertura for insert to authenticated
  with check (public.es_admin() and creado_por = auth.uid());
create policy traslados_ver on public.traslados for select to authenticated using (public.es_admin());
create policy traslados_crear on public.traslados for insert to authenticated
  with check (public.es_admin() and creado_por = auth.uid());

-- reparto: el equipo ve y registra el del cierre; los ajustes son solo de admin
create policy reparto_ver on public.reparto_cierre for select to authenticated using (public.es_equipo());
create policy reparto_crear on public.reparto_cierre for insert to authenticated
  with check (public.es_equipo() and creado_por = auth.uid() and (not es_ajuste or public.es_admin()));

-- ───────────────────────── Registrar cierre con reparto (una sola transacción) ─────────────────────────
-- security invoker: aplican las mismas reglas RLS que al insertar directo.

create or replace function public.registrar_cierre(
  p_fecha date, p_factura_desde integer, p_factura_hasta integer,
  p_efectivo bigint, p_transferencias bigint, p_datafono bigint,
  p_base bigint, p_retiro bigint, p_observaciones text, p_reparto jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_venta bigint := coalesce(p_efectivo, 0) + coalesce(p_transferencias, 0) + coalesce(p_datafono, 0);
  v_reparto bigint;
begin
  select coalesce(sum((r->>'valor')::bigint), 0) into v_reparto
  from jsonb_array_elements(coalesce(p_reparto, '[]'::jsonb)) r;

  if p_fecha >= public.inicio_saldos() and v_reparto <> v_venta then
    raise exception 'El reparto por cuentas (%) no suma la venta del día (%).', v_reparto, v_venta;
  end if;

  insert into public.cierres (fecha, factura_desde, factura_hasta, efectivo, transferencias, datafono,
                              base_inicial, retiro, observaciones, creado_por)
  values (p_fecha, p_factura_desde, p_factura_hasta, coalesce(p_efectivo, 0), coalesce(p_transferencias, 0),
          coalesce(p_datafono, 0), coalesce(p_base, 0), coalesce(p_retiro, 0), nullif(trim(p_observaciones), ''), auth.uid())
  returning id into v_id;

  insert into public.reparto_cierre (cierre_id, cuenta_id, valor, creado_por)
  select v_id, (r->>'cuenta_id')::uuid, (r->>'valor')::bigint, auth.uid()
  from jsonb_array_elements(coalesce(p_reparto, '[]'::jsonb)) r
  where (r->>'valor')::bigint > 0;

  return v_id;
end $$;

-- ───────────────────────── Registrar traslado (con comisión opcional) ─────────────────────────
-- Si sale más de lo que llega (ej. Bold cobra comisión), la diferencia queda como gasto
-- "Comisiones bancarias" pagado desde la cuenta de origen.

create or replace function public.registrar_traslado(
  p_fecha date, p_origen uuid, p_destino uuid, p_sale bigint, p_llega bigint, p_concepto text
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_origen text;
begin
  if p_llega is null or p_llega <= 0 then raise exception 'Escribe cuánto llegó a la cuenta de destino.'; end if;
  if p_sale is null or p_sale < p_llega then raise exception 'Lo que sale no puede ser menor que lo que llega.'; end if;

  insert into public.traslados (fecha, origen_id, destino_id, valor, concepto, creado_por)
  values (p_fecha, p_origen, p_destino, p_llega, trim(p_concepto), auth.uid())
  returning id into v_id;

  if p_sale > p_llega then
    select nombre into v_origen from public.cuentas where id = p_origen;
    insert into public.gastos (fecha, categoria, tipo, beneficiario, concepto, valor, medio_pago, cuenta_id, creado_por)
    values (p_fecha, 'Comisiones bancarias', 'Variable', v_origen, 'Comisión ' || v_origen || ' · ' || trim(p_concepto),
            p_sale - p_llega, 'Débito bancario', p_origen, auth.uid());
  end if;

  return v_id;
end $$;

revoke execute on function public.registrar_cierre(date, integer, integer, bigint, bigint, bigint, bigint, bigint, text, jsonb),
                           public.registrar_traslado(date, uuid, uuid, bigint, bigint, text),
                           public.inicio_saldos(), public.cuenta_caja() from public, anon;
grant execute on function public.registrar_cierre(date, integer, integer, bigint, bigint, bigint, bigint, bigint, text, jsonb),
                          public.registrar_traslado(date, uuid, uuid, bigint, bigint, text),
                          public.inicio_saldos(), public.cuenta_caja() to authenticated;

-- ───────────────────────── v_cierres: reparto y nuevo motivo de "Revisar" ─────────────────────────
-- Mismas columnas que antes, más reparto_total al final.

create or replace view public.v_cierres with (security_invoker = true) as
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
rep as (
  select cierre_id, sum(valor) as total, count(*) filter (where es_ajuste) as num_ajustes
  from public.reparto_cierre group by cierre_id
),
base as (
  select c.id, c.fecha, c.factura_desde, c.factura_hasta,
         c.efectivo       + coalesce(aj.efectivo, 0)       as efectivo,
         c.transferencias + coalesce(aj.transferencias, 0) as transferencias,
         c.datafono       + coalesce(aj.datafono, 0)       as datafono,
         c.base_inicial   + coalesce(aj.base_inicial, 0)   as base_inicial,
         c.retiro         + coalesce(aj.retiro, 0)         as retiro,
         c.venta_total_registrada, c.observaciones, c.creado_por, c.creado_en,
         coalesce(aj.num_ajustes, 0) + coalesce(rep.num_ajustes, 0) as num_ajustes,
         public.gastos_efectivo_dia(c.fecha) as gastos_efectivo_dia,
         rep.total as reparto_total
  from public.cierres c left join aj on aj.cierre_id = c.id left join rep on rep.cierre_id = c.id
),
calc as (
  select b.*,
         b.efectivo + b.transferencias + b.datafono as venta_total,
         case when b.factura_desde is not null and b.factura_hasta is not null
              then b.factura_hasta - b.factura_desde + 1 end as num_facturas,
         b.base_inicial + b.efectivo - b.gastos_efectivo_dia - b.retiro as efectivo_en_caja,
         b.fecha >= public.inicio_saldos()
           and coalesce(b.reparto_total, 0) <> b.efectivo + b.transferencias + b.datafono as reparto_descuadrado
  from base b
)
select calc.id, calc.fecha, calc.factura_desde, calc.factura_hasta, calc.efectivo, calc.transferencias, calc.datafono,
       calc.base_inicial, calc.retiro, calc.venta_total_registrada, calc.observaciones, calc.creado_por, calc.creado_en,
       calc.num_ajustes, calc.gastos_efectivo_dia, calc.venta_total, calc.num_facturas, calc.efectivo_en_caja,
       case when efectivo_en_caja < 0 or venta_total = 0 or reparto_descuadrado
              or (venta_total_registrada is not null and venta_total <> venta_total_registrada)
            then 'Revisar' else 'OK' end as estado,
       array_remove(array[
         case when efectivo_en_caja < 0 then 'Caja negativa' end,
         case when venta_total = 0 then 'Venta en cero' end,
         case when venta_total_registrada is not null and venta_total <> venta_total_registrada
              then 'Medios de pago no suman la venta registrada' end,
         case when reparto_descuadrado then 'Reparto por cuentas no suma la venta' end
       ], null) as motivos_revisar,
       coalesce(calc.reparto_total, 0) as reparto_total
from calc;

-- ───────────────────────── Movimientos y saldos por cuenta ─────────────────────────
-- Una fila por entrada o salida de cada cuenta, con signo. Solo cuenta lo posterior a la apertura.
-- Ve todo solo admin (los gastos y traslados son de admin).

create view public.v_movimientos_cuenta with (security_invoker = true) as
with ap as (
  select distinct on (cuenta_id) cuenta_id, fecha, valor
  from public.saldos_apertura order by cuenta_id, creado_en desc
),
corte as (
  select c.id as cuenta_id, coalesce(ap.fecha, public.inicio_saldos() - 1) as corte,
         coalesce(ap.valor, 0) as apertura, ap.cuenta_id is not null as tiene_apertura
  from public.cuentas c left join ap on ap.cuenta_id = c.id
),
ret as (
  select c.id, c.fecha, c.retiro + coalesce(sum(a.diferencia), 0) as retiro
  from public.cierres c left join public.ajustes_cierre a on a.cierre_id = c.id and a.campo = 'retiro'
  group by c.id
),
mov as (
  select r.cuenta_id, c.fecha, 'Venta'::text as tipo,
         case when r.es_ajuste then 'Ajuste del cierre: ' || r.motivo else 'Cierre del día' end as concepto,
         r.valor, r.creado_en
  from public.reparto_cierre r join public.cierres c on c.id = r.cierre_id
  union all
  select coalesce(g.cuenta_id, public.cuenta_caja()), g.fecha, 'Gasto',
         g.concepto || case when g.es_ajuste then ' (ajuste: ' || g.motivo_ajuste || ')' else '' end,
         -g.valor, g.creado_en
  from public.gastos g
  where g.cuenta_id is not null or g.medio_pago = 'Efectivo de caja'
  union all
  select public.cuenta_caja(), ret.fecha, 'Retiro', 'Retiro de caja (efectivo guardado aparte)', -ret.retiro, null
  from ret where ret.retiro <> 0
  union all
  select t.origen_id, t.fecha, 'Traslado', t.concepto || ' → ' || d.nombre, -t.valor, t.creado_en
  from public.traslados t join public.cuentas d on d.id = t.destino_id
  union all
  select t.destino_id, t.fecha, 'Traslado', t.concepto || ' ← ' || o.nombre, t.valor, t.creado_en
  from public.traslados t join public.cuentas o on o.id = t.origen_id
)
select k.cuenta_id, k.corte as fecha, 'Apertura'::text as tipo,
       case when k.tiene_apertura then 'Saldo de apertura' else 'Sin saldo de apertura: arranca en $0' end as concepto,
       k.apertura as valor, null::timestamptz as creado_en
from corte k
union all
select m.cuenta_id, m.fecha, m.tipo, m.concepto, m.valor, m.creado_en
from mov m join corte k on k.cuenta_id = m.cuenta_id
where m.fecha > k.corte;

-- Saldo de cada cuenta al terminar un día.
create view public.v_saldos_cuentas with (security_invoker = true) as
select c.id as cuenta_id, c.nombre, c.tipo, c.orden,
       exists (select 1 from public.saldos_apertura s where s.cuenta_id = c.id) as tiene_apertura,
       coalesce((select sum(m.valor) from public.v_movimientos_cuenta m
                 where m.cuenta_id = c.id and m.fecha <= public.hoy_bogota()), 0) as saldo
from public.cuentas c where c.activo
order by c.orden;

revoke all on public.v_movimientos_cuenta, public.v_saldos_cuentas from anon;
