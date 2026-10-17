-- Margen de referencia por defecto: 43 % -> 60 %
alter table public.meses alter column margen_bruto_estimado set default 0.60;

-- resumen_mes: margen por defecto 0.60 cuando el mes no tiene margen
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
  'margen', coalesce((select margen_bruto_estimado from meses, p where meses.mes = p.mes), 0.60),
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
