-- Resumen mensual automático en Notion.
-- pg_cron llama el día 1 a las 6:00 a.m. (Bogotá = 11:00 UTC) a la Edge Function "resumen-mensual",
-- que pide estas cifras a resumen_mes() y crea la página en Notion con el secreto NOTION_TOKEN.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Esquema privado: no se expone por la API.
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table privado.config (
  clave text primary key,
  valor text not null
);
-- Llave que comparte el cron con la Edge Function. Se genera aquí y nunca sale del servidor.
insert into privado.config (clave, valor)
values ('cron_key', encode(extensions.gen_random_bytes(24), 'hex'));

create table privado.resumenes (
  mes             date primary key check (extract(day from mes) = 1),
  notion_page_id  text not null,
  notion_url      text,
  creado_en       timestamptz not null default now()
);
create trigger no_borrar before delete on privado.resumenes for each row execute function public.bloquear_borrado();

-- La llave de servicio (Edge Function) también necesita el total de gastos en efectivo
-- para que el estado de cada cierre (caja negativa) se calcule igual que en la app.
create or replace function public.gastos_efectivo_dia(p_fecha date) returns bigint
language sql stable security definer set search_path = public as $$
  select case when public.es_equipo() or coalesce(auth.role(), '') = 'service_role' then
    coalesce((select sum(valor) from public.gastos where fecha = p_fecha and medio_pago = 'Efectivo de caja'), 0)
  end
$$;

-- ── Cifras del mes ──
create or replace function public.resumen_mes(p_mes date) returns jsonb
language sql stable security definer set search_path = public as $$
with p as (select date_trunc('month', p_mes)::date mes,
                  (date_trunc('month', p_mes) + interval '1 month')::date sig,
                  (date_trunc('month', p_mes) - interval '1 month')::date ant),
c  as (select v.* from v_cierres v, p where v.fecha >= p.mes and v.fecha < p.sig),
ca as (select v.* from v_cierres v, p where v.fecha >= p.ant and v.fecha < p.mes),
g  as (select x.* from gastos x, p where x.fecha >= p.mes and x.fecha < p.sig),
hab as (select d::date dia from p, generate_series(p.mes, p.sig - 1, interval '1 day') d
        where extract(isodow from d) between 1 and 6 and not exists (select 1 from festivos f where f.fecha = d::date)),
corr as (select distinct ajusta_gasto_id id from g where es_ajuste and ajusta_gasto_id is not null),
mov as (select m.*, pr.nombre, pr.referencia, pr.unidad, coalesce(m.costo_unitario, pr.costo_unitario) costo
        from movimientos_inventario m join productos pr on pr.id = m.producto_id, p
        where m.fecha >= p.mes and m.fecha < p.sig)
select jsonb_build_object(
  'mes', (select mes from p),
  'ventas', (select jsonb_build_object(
      'total', coalesce(sum(venta_total), 0), 'efectivo', coalesce(sum(efectivo), 0),
      'transferencias', coalesce(sum(transferencias), 0), 'datafono', coalesce(sum(datafono), 0),
      'facturas', sum(num_facturas), 'dias_con_facturas', count(num_facturas), 'dias', count(*)) from c),
  'ventas_ant', (select jsonb_build_object('total', coalesce(sum(venta_total), 0), 'dias', count(*),
      'facturas', sum(num_facturas)) from ca),
  'gastos_total', (select coalesce(sum(valor), 0) from g),
  'gastos_ant', (select coalesce(sum(valor), 0) from gastos x, p where x.fecha >= p.ant and x.fecha < p.mes),
  'gastos_cat', (select coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'valor', v) order by v desc), '[]')
      from (select categoria, sum(valor) v from g group by 1 having sum(valor) <> 0) t),
  'fijos', (select coalesce(jsonb_agg(jsonb_build_object(
      'nombre', f.nombre, 'frecuencia', f.frecuencia, 'variable', f.valor_variable,
      'esperado', case when f.frecuencia = 'Mensual' then f.valor_estimado else f.valor_estimado * (select count(*) from c) end,
      'pagado', coalesce((select sum(valor) from g where gasto_fijo_id = f.id), 0),
      'estimado', exists (select 1 from g where gasto_fijo_id = f.id and estimado)) order by f.valor_estimado desc), '[]')
      from gastos_fijos f where f.activo),
  'margen', coalesce((select margen_bruto_estimado from meses, p where meses.mes = p.mes), 0.43),
  'fijos_mensuales', (select coalesce(sum(valor_estimado), 0) from gastos_fijos where activo and frecuencia = 'Mensual'),
  'nomina_dia', (select coalesce(sum(valor_estimado), 0) from gastos_fijos where activo and frecuencia = 'Por día trabajado'),
  'dias_habiles', (select count(*) from hab),
  'sin_cierre', (select coalesce(jsonb_agg(dia order by dia), '[]') from hab where dia not in (select fecha from c)),
  'revisar', (select coalesce(jsonb_agg(jsonb_build_object('fecha', fecha, 'motivos', motivos_revisar) order by fecha), '[]') from c where estado = 'Revisar'),
  'ajustes_cierre', (select count(*) from ajustes_cierre a join c on c.id = a.cierre_id),
  'sin_medio', (select jsonb_build_object('n', count(*), 'valor', coalesce(sum(valor), 0)) from g
      where medio_pago = 'Sin definir' and not es_ajuste and id not in (select id from corr where id is not null)),
  'estimados', (select jsonb_build_object('n', count(*), 'valor', coalesce(sum(valor), 0)) from g where estimado and not es_ajuste),
  'stock_critico', (select coalesce(jsonb_agg(jsonb_build_object('nombre', coalesce(referencia, nombre), 'stock', stock_exhibicion,
      'minimo', minimo, 'unidad', unidad)), '[]') from (select * from v_stock_critico limit 25) s),
  'stock_critico_total', (select count(*) from v_stock_critico),
  'sin_minimo', (select count(*) from productos where activo and minimo = 0),
  'mermas', (select jsonb_build_object('n', count(*), 'valor', coalesce(sum(cantidad * costo), 0), 'sin_costo', count(*) filter (where costo is null))
      from mov where tipo = 'Daño/merma'),
  'consumo_clases', (select jsonb_build_object('n', count(*), 'valor', coalesce(sum(cantidad * costo), 0), 'sin_costo', count(*) filter (where costo is null))
      from mov where tipo = 'Consumo en clase'),
  'consumo_detalle', (select coalesce(jsonb_agg(jsonb_build_object('nombre', coalesce(referencia, nombre), 'cantidad', q, 'unidad', unidad, 'valor', v) order by v desc nulls last), '[]')
      from (select referencia, nombre, unidad, sum(cantidad) q, sum(cantidad * costo) v from mov where tipo = 'Consumo en clase' group by 1, 2, 3 limit 15) t)
)
$$;

-- ── Funciones que usa la Edge Function (solo con la llave de servicio) ──
create or replace function public.resumen_verificar_llave(p_llave text) returns boolean
language sql stable security definer set search_path = privado, public as $$
  select exists (select 1 from privado.config where clave = 'cron_key' and valor = p_llave)
$$;

create or replace function public.resumen_registrado(p_mes date) returns jsonb
language sql stable security definer set search_path = privado, public as $$
  select to_jsonb(r) from privado.resumenes r where r.mes = p_mes
$$;

create or replace function public.resumen_registrar(p_mes date, p_page_id text, p_url text) returns void
language sql security definer set search_path = privado, public as $$
  insert into privado.resumenes (mes, notion_page_id, notion_url) values (p_mes, p_page_id, p_url)
$$;

revoke execute on function public.resumen_mes(date), public.resumen_verificar_llave(text),
  public.resumen_registrado(date), public.resumen_registrar(date, text, text) from public, anon, authenticated;
grant execute on function public.resumen_mes(date), public.resumen_verificar_llave(text),
  public.resumen_registrado(date), public.resumen_registrar(date, text, text) to service_role;

-- ── Programación: día 1 de cada mes, 11:00 UTC = 6:00 a.m. en Bogotá ──
select cron.schedule(
  'resumen-mensual-notion',
  '0 11 1 * *',
  $cron$
  select net.http_post(
    url := 'https://lumwfrwcxcrhpmkgrxbi.supabase.co/functions/v1/resumen-mensual',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-key', (select valor from privado.config where clave = 'cron_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
