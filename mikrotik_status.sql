-- ==============================================================================
-- TABLA DE MONITOREO DE RED MIKROTIK (WAN 1, WAN 2, WAN 3)
-- Gaming Center Arcadia
-- Ejecuta este script en el Editor SQL de tu panel de Supabase:
-- https://supabase.com/dashboard/project/gwxsoraznypiubuzkati/sql
-- ==============================================================================

create table if not exists public.mikrotik_status (
  id text primary key, -- 'wan1', 'wan2', 'wan3'
  nombre text not null,
  interfaz text not null,
  gateway text not null,
  estado text default 'online', -- 'online', 'warning', 'offline'
  latencia_ms numeric default 0,
  rx_mbps numeric default 0,
  tx_mbps numeric default 0,
  resolviendo boolean default true,
  updated_at timestamp with time zone default now()
);

-- Habilitar seguridad por fila (RLS)
alter table public.mikrotik_status enable row level security;

-- Política de lectura y escritura para el MikroTik y el Dashboard
drop policy if exists "Allow all mikrotik_status" on public.mikrotik_status;
create policy "Allow all mikrotik_status"
  on public.mikrotik_status for all
  using (true)
  with check (true);

-- Insertar / actualizar los 3 registros iniciales de las líneas de Arcadia
insert into public.mikrotik_status (id, nombre, interfaz, gateway, estado, latencia_ms, rx_mbps, tx_mbps, resolviendo, updated_at)
values
  ('wan1', 'WAN 1: Movistar 500M', 'ether1', '192.168.10.1', 'online', 12, 24.5, 3.2, true, now()),
  ('wan2', 'WAN 2: Movistar 500M', 'ether2', '192.168.20.1', 'online', 14, 5.1, 0.9, true, now()),
  ('wan3', 'WAN 3: Movistar 500M', 'ether3', '192.168.30.1', 'online', 13, 31.8, 4.6, true, now())
on conflict (id) do update set
  nombre = excluded.nombre,
  interfaz = excluded.interfaz,
  gateway = excluded.gateway,
  updated_at = now();

-- Habilitar Realtime para actualización instantánea en el panel
alter publication supabase_realtime add table public.mikrotik_status;
