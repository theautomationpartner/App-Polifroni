-- Numeración de las Órdenes de Producción: el ÚLTIMO número usado de cada tipo.
--
-- Base: la misma Neon de la app (DATABASE_URL / POSTGRES_URL del proyecto en Vercel).
-- Reemplaza al data store de Make ("Enumeracion Orden de Produccion FINAL (Obras)", 92748).
--
-- No hace falta aplicarlo a mano: `api/_numeracion.ts` lo corre solo la primera vez que se usa.
-- Queda acá para revisarlo o aplicarlo desde el SQL Editor de Neon:
--   psql "$DATABASE_URL" -f db/numeracion.sql
--
-- Es idempotente: correrlo de nuevo no rompe ni pisa los números que ya hay.

create table if not exists numeracion_op (
  -- 'PVC' | 'Aluminio'.
  tipo          text        primary key check (tipo in ('PVC', 'Aluminio')),
  -- El último número USADO (sin la "A" de Aluminio). La próxima OP lleva `ultimo + 1`.
  ultimo        integer     not null check (ultimo >= 0),
  actualizado_en timestamptz not null default now()
);

-- Arranque (02/10/2026):
--  - PVC: el último generado es 2290 (definido por el usuario) → la próxima es 2291.
--  - Aluminio: el más alto del tablero de órdenes que empieza con A es A3010 → la próxima es A3011.
insert into numeracion_op (tipo, ultimo) values
  ('PVC', 2290),
  ('Aluminio', 3010)
on conflict (tipo) do nothing;
