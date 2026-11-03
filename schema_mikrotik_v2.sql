-- ==============================================================================
-- GAMING CENTER ARCADIA - NOC MIKROTIK TELEMETRY & 40 PCS FLOOR MAP
-- Supabase Migration Script
-- ==============================================================================

-- 1. TABLA: Salud y Rendimiento del Router MikroTik hEX
create table if not exists public.mikrotik_health (
  id text primary key default 'system',
  cpu_load integer default 0,
  free_memory_mb numeric default 0,
  total_memory_mb numeric default 256,
  memory_pct numeric default 0,
  uptime text default '0h 0m',
  cpu_frequency integer default 880,
  board_name text default 'hEX (RB750Gr3)',
  version text default 'RouterOS v6.49',
  temperature numeric,
  voltage numeric,
  updated_at timestamp with time zone default now()
);

alter table public.mikrotik_health enable row level security;
drop policy if exists "Allow all mikrotik_health" on public.mikrotik_health;
create policy "Allow all mikrotik_health" on public.mikrotik_health for all using (true) with check (true);

insert into public.mikrotik_health (id, cpu_load, free_memory_mb, total_memory_mb, memory_pct, uptime, cpu_frequency, board_name, version)
values ('system', 12, 214, 256, 16, '1d 06:15:00', 880, 'hEX (RB750Gr3)', 'RouterOS v6.49')
on conflict (id) do update set
  cpu_load = excluded.cpu_load,
  free_memory_mb = excluded.free_memory_mb,
  total_memory_mb = excluded.total_memory_mb,
  memory_pct = excluded.memory_pct,
  uptime = excluded.uptime,
  updated_at = now();

-- 2. TABLA: Mapa de 40 PCs Clientes Arcadia (192.168.1.101 al 192.168.1.140)
create table if not exists public.mikrotik_clients (
  ip text primary key,
  pc_name text not null,
  pc_number integer not null,
  online boolean default false,
  rx_kbps numeric default 0,
  tx_kbps numeric default 0,
  wan_active text default 'idle', -- 'wan3_gaming', 'wan1_nav', 'wan2_nav', 'idle'
  actividad text default 'libre', -- 'gaming', 'navegacion', 'descarga', 'libre', 'apagada'
  updated_at timestamp with time zone default now()
);

alter table public.mikrotik_clients enable row level security;
drop policy if exists "Allow all mikrotik_clients" on public.mikrotik_clients;
create policy "Allow all mikrotik_clients" on public.mikrotik_clients for all using (true) with check (true);

-- Poblar automáticamente los 40 puestos fijos del LAN Center
do $$
begin
  for i in 1..40 loop
    insert into public.mikrotik_clients (ip, pc_name, pc_number, online, rx_kbps, tx_kbps, wan_active, actividad)
    values (
      '192.168.1.' || (100 + i),
      'PC-' || lpad(i::text, 2, '0'),
      i,
      false,
      0,
      0,
      'idle',
      'apagada'
    )
    on conflict (ip) do nothing;
  end loop;
end $$;

-- 3. Triggers para actualizar updated_at al segundo exacto
create or replace trigger trg_mikrotik_health_updated_at
before update on public.mikrotik_health
for each row execute function set_mikrotik_updated_at();

create or replace trigger trg_mikrotik_clients_updated_at
before update on public.mikrotik_clients
for each row execute function set_mikrotik_updated_at();

-- 4. Habilitar Realtime para reflejo instantáneo en la Web
alter publication supabase_realtime add table public.mikrotik_health;
alter publication supabase_realtime add table public.mikrotik_clients;
