-- ============================================================
-- Fluxo — Octa44 Hub
-- Rode isso no SQL Editor do seu projeto Supabase
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  texto_original text not null,
  criado_em timestamptz not null default now(),

  -- Preenchido pela IA na Camada 2. Fica null até lá — não bloqueia nada.
  tipo text check (tipo in ('tarefa', 'nota')),
  categoria text,
  data_sugerida timestamptz,

  status text not null default 'pendente' check (status in ('pendente', 'feito', 'arquivado')),
  concluido_em timestamptz,

  recorrente text check (recorrente in ('diario', 'semanal')),
  prioridade_calculada numeric not null default 0,
  vezes_adiado integer not null default 0,

  -- Camada 3: compartilhamento. Vazio por padrão = só o dono vê.
  compartilhado_com uuid[] not null default '{}'
);

create index if not exists items_owner_idx on public.items (owner_id);
create index if not exists items_status_idx on public.items (status);

alter table public.items enable row level security;

-- Dono vê e edita os próprios itens
create policy "owner_select" on public.items
  for select using (auth.uid() = owner_id);

create policy "owner_insert" on public.items
  for insert with check (auth.uid() = owner_id);

create policy "owner_update" on public.items
  for update using (auth.uid() = owner_id);

create policy "owner_delete" on public.items
  for delete using (auth.uid() = owner_id);

-- Camada 3 (ativar quando o compartilhamento com Amanda/Marcelo entrar):
-- create policy "shared_select" on public.items
--   for select using (auth.uid() = any(compartilhado_com));
