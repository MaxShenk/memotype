-- Store fractional scores, and keep how many words were revealed.
-- Paste this into the Supabase SQL editor. Safe to run more than once.

alter table public.scores alter column score type double precision;
alter table public.scores add column if not exists reveals integer not null default 0;
