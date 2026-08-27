-- Production schema for rainbow's persistent WindowStore.
-- Apply via the Supabase SQL editor or `supabase db push`.
--
-- `seq` is a bigint identity column: server-assigned in insert order, which is
-- the ordering contract rainbow's MemoryWindowStore semantics depend on
-- (insertion order per agent; stable timestamp sort across agents).

create table if not exists public.rainbow_signals (
  seq          bigint generated always as identity primary key,
  agent_id     text   not null,
  timestamp_ms bigint not null,
  payload      jsonb  not null,
  inserted_at  timestamptz not null default now()
);

create index if not exists idx_rainbow_signals_agent_ts
  on public.rainbow_signals (agent_id, timestamp_ms);
create index if not exists idx_rainbow_signals_ts
  on public.rainbow_signals (timestamp_ms);

-- RLS is enabled with NO policies. That denies every anon and authenticated
-- request outright; only the service-role key reaches this table, and it is
-- used exclusively from server-side code (app/lib/supabase-window-store.ts).
--
-- This deliberately differs from the rainbow-interop harness schema
-- (rainbow-interop/sql/supabase-schema.sql), which grants anon select/insert/
-- DELETE. Those policies are labelled test-only in that file and must never be
-- applied to a project serving rainbow.vorion.org: the anon key is a public
-- client-side credential, so anon-delete means anyone can erase the fleet
-- history.
alter table public.rainbow_signals enable row level security;

-- Ingest is authenticated at the edge by RAINBOW_INGEST_TOKEN
-- (app/api/signals/route.ts), not by a database role.
