-- La dueña decidió arrancar el reparto por cuentas el 1-dic-2026. Noviembre queda como antes.
create or replace function public.inicio_saldos() returns date
language sql immutable as $$ select date '2026-12-01' $$;
