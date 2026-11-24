-- Vocabulary decks can be practiced by using each word in a sentence.
alter table public.decks add column if not exists vocabulary boolean not null default false;
