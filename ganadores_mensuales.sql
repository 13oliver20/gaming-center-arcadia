-- Ejecuta este script en el editor SQL de Supabase para crear la tabla de los ganadores mensuales

create table public.ganadores_mensuales (
  id uuid default gen_random_uuid() primary key,
  posicion smallint not null,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  puntos integer null,
  created_at timestamp with time zone default now()
);

-- Habilitar RLS (Row Level Security) para seguridad, si lo tienes activo
alter table public.ganadores_mensuales enable row level security;

-- Política sencilla para permitir lectura y escritura a todos (o configúrala según tus necesidades)
create policy "Allow public read access"
  on public.ganadores_mensuales for select
  using (true);

create policy "Allow public insert access"
  on public.ganadores_mensuales for insert
  with check (true);

create policy "Allow public update access"
  on public.ganadores_mensuales for update
  using (true);

create policy "Allow public delete access"
  on public.ganadores_mensuales for delete
  using (true);
