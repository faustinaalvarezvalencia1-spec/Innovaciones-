-- Endurece funciones según los avisos de seguridad de Supabase.

alter function public.hoy_bogota()         set search_path = public;
alter function public.bloquear_borrado()   set search_path = public;
alter function public.bloquear_edicion()   set search_path = public;
alter function public.proteger_stock()     set search_path = public;
alter function public.dias_habiles(date)   set search_path = public;

-- Funciones de trigger: nadie las llama por la API.
revoke execute on function public.aplicar_movimiento() from public, anon, authenticated;
revoke execute on function public.crear_perfil()       from public, anon, authenticated;
revoke execute on function public.bloquear_borrado()   from public, anon, authenticated;
revoke execute on function public.bloquear_edicion()   from public, anon, authenticated;
revoke execute on function public.proteger_stock()     from public, anon, authenticated;

-- Funciones de rol y de caja: solo usuarios con sesión (las políticas RLS las necesitan).
revoke execute on function public.rol_actual()               from public, anon;
revoke execute on function public.es_admin()                 from public, anon;
revoke execute on function public.es_equipo()                from public, anon;
revoke execute on function public.gastos_efectivo_dia(date)  from public, anon;
revoke execute on function public.dias_habiles(date)         from public, anon;
revoke execute on function public.hoy_bogota()               from public, anon;
grant  execute on function public.rol_actual(), public.es_admin(), public.es_equipo(),
                           public.gastos_efectivo_dia(date), public.dias_habiles(date), public.hoy_bogota()
       to authenticated;

-- Funciones futuras: sin ejecución pública por defecto.
alter default privileges in schema public revoke execute on functions from public, anon;
