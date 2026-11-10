-- Allow stanza practice and stanza recall scores.
-- Paste this into the Supabase SQL editor. Safe to run more than once.

alter table public.scores drop constraint if exists scores_mode_check;
alter table public.scores add constraint scores_mode_check
  check (mode in ('practice', 'recall', 'stanza-practice', 'stanza-recall'));
