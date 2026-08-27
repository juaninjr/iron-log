-- Owner's own optional second factor on the figurine grid: a password
-- prompt (checked client-side against OWNER_LOGIN_PASSWORD, state.js)
-- after the owner's cell is clicked, same pattern as
-- diana_gate_settings/diana_schema.sql but for the owner's own unlock.
-- Off by default (unlike Diana's, which defaults to true) — this is a
-- new, opt-in extra step, not one anyone's relying on already being on.
-- Re-runnable, same convention as every other schema file here.

create table if not exists public.owner_gate_settings (
  id int primary key default 1,
  gate_enabled boolean not null default false,
  constraint owner_gate_settings_singleton check (id = 1)
);
alter table public.owner_gate_settings enable row level security;
drop policy if exists "Allow anon full access" on public.owner_gate_settings;
create policy "Allow anon full access"
  on public.owner_gate_settings
  for all
  using (true)
  with check (true);

insert into public.owner_gate_settings (id, gate_enabled) values (1, false)
on conflict (id) do nothing;
