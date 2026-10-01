-- =============================================================
--  Almacén del Taller · base de datos
--  Pega todo este archivo en Supabase > SQL Editor > New query
--  y pulsa "Run". Solo hay que hacerlo una vez.
-- =============================================================

-- Materiales, trabajos y compras se guardan aquí.
-- "coleccion" dice qué es cada fila y "data" guarda sus campos.
create table if not exists public.registros (
  id          text primary key,
  coleccion   text not null check (coleccion in ('materiales','proyectos','compras')),
  data        jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now(),
  usuario     text
);
create index if not exists registros_coleccion_idx on public.registros (coleccion);

-- Historial de movimientos (quién hizo qué y cuándo)
create table if not exists public.movimientos (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  usuario text,
  texto   text not null
);
create index if not exists movimientos_at_idx on public.movimientos (at desc);

-- Seguridad: solo los usuarios que tú crees pueden leer y escribir
alter table public.registros   enable row level security;
alter table public.movimientos enable row level security;

drop policy if exists "taller_registros" on public.registros;
create policy "taller_registros" on public.registros
  for all to authenticated using (true) with check (true);

drop policy if exists "taller_movimientos_leer" on public.movimientos;
create policy "taller_movimientos_leer" on public.movimientos
  for select to authenticated using (true);

drop policy if exists "taller_movimientos_anotar" on public.movimientos;
create policy "taller_movimientos_anotar" on public.movimientos
  for insert to authenticated with check (true);

-- Cambios en directo: lo que uno toca aparece al momento en el móvil del otro
alter table public.registros replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.registros;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.movimientos;
exception when duplicate_object then null; end $$;
