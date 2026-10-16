-- La misma referencia Miyuki existe en tamaños distintos (ej. #1 en Rocalla 11/0 y 15/0):
-- la referencia es única dentro de cada subcategoría.
drop index if exists public.productos_referencia_unica;
create unique index productos_referencia_unica
  on public.productos (coalesce(subcategoria, ''), referencia) where referencia is not null;
