-- Creador de tablas para Gestor de Sorteos Diarios (Historial y Horarios)
-- Si la tabla de horarios (sorteos_horarios) ya la tienes, ignora la primera instrucción.

create table if not exists public.sorteos_horarios (
  id uuid default gen_random_uuid() primary key,
  hora text not null,
  orden integer not null,
  created_at timestamp with time zone default now()
);

alter table public.sorteos_horarios enable row level security;
create policy "Allow all_sorteos_horarios" on public.sorteos_horarios for all using (true) with check (true);


create table if not exists public.sorteos_historial (
  id uuid default gen_random_uuid() primary key,
  fecha text not null, -- formato 'YYYY-MM-DD'
  sorteo_id uuid references public.sorteos_horarios(id) on delete cascade not null,
  usuario_id uuid references public.usuarios(id) on delete cascade not null,
  premio text default 'Sin Asignar',
  created_at timestamp with time zone default now()
);

alter table public.sorteos_historial enable row level security;
create policy "Allow all_sorteos_historial" on public.sorteos_historial for all using (true) with check (true);
