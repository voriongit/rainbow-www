-- Production schema for rainbow's persistent signal store (live deployment only).
-- Apply via the Supabase SQL editor or `supabase db push`. Safe to run again.
--
-- Ingest is idempotent: (tenant_id, signal_id) is unique and inserts use
-- ON CONFLICT DO NOTHING, so a producer that retries a batch cannot count the
-- same failure twice. That matters because the risk accumulator sums one
-- contribution per failure signal; a duplicated failure would inflate it.
--
-- `seq` is a bigint identity column: server-assigned in insert order.
-- `inserted_at` is the database clock; the live feed tails the table by it.

create table if not exists public.rainbow_signals (
  seq          bigint generated always as identity primary key,
  tenant_id    text   not null,
  signal_id    text   not null,
  agent_id     text   not null,
  timestamp_ms bigint not null,
  payload      jsonb  not null,
  inserted_at  timestamptz not null default now()
);

-- Upgrade path for a table created before idempotent ingest. On a table made
-- by the statement above these are all no-ops.
alter table public.rainbow_signals add column if not exists tenant_id text;
alter table public.rainbow_signals add column if not exists signal_id text;

update public.rainbow_signals
   set tenant_id = coalesce(tenant_id, payload->>'tenantId'),
       signal_id = coalesce(signal_id, payload->>'signalId')
 where tenant_id is null or signal_id is null;

-- Where a retry already stored the same signal twice, keep the earliest row.
delete from public.rainbow_signals
 where seq in (
   select seq from (
     select seq,
            row_number() over (partition by tenant_id, signal_id order by seq) as occurrence
       from public.rainbow_signals
   ) ranked
   where occurrence > 1
 );

alter table public.rainbow_signals alter column tenant_id set not null;
alter table public.rainbow_signals alter column signal_id set not null;

create unique index if not exists uq_rainbow_signals_tenant_signal
  on public.rainbow_signals (tenant_id, signal_id);

create index if not exists idx_rainbow_signals_agent_ts
  on public.rainbow_signals (agent_id, timestamp_ms);
create index if not exists idx_rainbow_signals_ts
  on public.rainbow_signals (timestamp_ms);
create index if not exists idx_rainbow_signals_inserted_at
  on public.rainbow_signals (inserted_at);

-- RLS is enabled with NO policies. That denies every anon and authenticated
-- request outright; only the service-role key reaches this table, and it is
-- used exclusively from server-side code (app/lib/supabase-signal-repository.ts).
--
-- This deliberately differs from the rainbow-interop harness schema
-- (rainbow-interop/sql/supabase-schema.sql), which grants anon select/insert/
-- DELETE. Those policies are labelled test-only in that file and must never be
-- applied to a project serving rainbow data: the anon key is a public
-- client-side credential, so anon-delete means anyone can erase the fleet
-- history.
alter table public.rainbow_signals enable row level security;

-- Ingest is authenticated at the edge by RAINBOW_INGEST_TOKEN
-- (app/api/signals/route.ts), not by a database role.
