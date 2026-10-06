-- MemoType schema. Run this once in the Supabase SQL editor.
-- Then set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for local dev,
-- and the same names in the Cloudflare Pages project.

create extension if not exists pgcrypto;

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  mode text not null check (mode in ('practice', 'recall')),
  score integer not null,
  wpm double precision not null,
  accuracy double precision,
  seconds double precision not null,
  created_at timestamptz not null default now()
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  builtin_key text unique,
  updated_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  position integer not null,
  term text not null default '',
  definition text not null,
  image text not null default '',
  card_key text not null,
  unique (deck_id, card_key)
);

create table if not exists public.card_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  deck_id uuid not null references public.decks (id) on delete cascade,
  card_key text not null,
  errors integer not null default 0,
  corrects integer not null default 0,
  last_seen bigint not null default 0,
  primary key (user_id, deck_id, card_key)
);

alter table public.sources enable row level security;
alter table public.scores enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.card_stats enable row level security;

drop policy if exists sources_own on public.sources;
drop policy if exists scores_own on public.scores;
drop policy if exists decks_read on public.decks;
drop policy if exists decks_write on public.decks;
drop policy if exists decks_update on public.decks;
drop policy if exists decks_delete on public.decks;
drop policy if exists cards_read on public.cards;
drop policy if exists cards_write on public.cards;
drop policy if exists cards_delete on public.cards;
drop policy if exists stats_own on public.card_stats;

create policy sources_own on public.sources
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy scores_own on public.scores
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy decks_read on public.decks
  for select using (user_id = auth.uid() or builtin_key is not null);

create policy decks_write on public.decks
  for insert with check (user_id = auth.uid());

create policy decks_update on public.decks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy decks_delete on public.decks
  for delete using (user_id = auth.uid());

create policy cards_read on public.cards
  for select using (
    exists (
      select 1 from public.decks d
      where d.id = deck_id and (d.user_id = auth.uid() or d.builtin_key is not null)
    )
  );

create policy cards_write on public.cards
  for insert with check (
    exists (select 1 from public.decks d where d.id = deck_id and d.user_id = auth.uid())
  );

create policy cards_delete on public.cards
  for delete using (
    exists (select 1 from public.decks d where d.id = deck_id and d.user_id = auth.uid())
  );

create policy stats_own on public.card_stats
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.sources, public.scores, public.decks, public.cards, public.card_stats to authenticated;

insert into public.decks (id, user_id, name, builtin_key)
values ('00000000-0000-4000-8000-000000000001', null, 'Country capitals', 'country-capitals')
on conflict (builtin_key) do nothing;

insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 0, 'Afghanistan', 'Kabul', 'Afghanistan' || chr(31) || 'Kabul');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 1, 'Albania', 'Tirana', 'Albania' || chr(31) || 'Tirana');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 2, 'Algeria', 'Algiers', 'Algeria' || chr(31) || 'Algiers');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 3, 'Andorra', 'Andorra la Vella', 'Andorra' || chr(31) || 'Andorra la Vella');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 4, 'Angola', 'Luanda', 'Angola' || chr(31) || 'Luanda');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 5, 'Antigua and Barbuda', 'Saint John''s', 'Antigua and Barbuda' || chr(31) || 'Saint John''s');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 6, 'Argentina', 'Buenos Aires', 'Argentina' || chr(31) || 'Buenos Aires');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 7, 'Armenia', 'Yerevan', 'Armenia' || chr(31) || 'Yerevan');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 8, 'Australia', 'Canberra', 'Australia' || chr(31) || 'Canberra');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 9, 'Austria', 'Vienna', 'Austria' || chr(31) || 'Vienna');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 10, 'Azerbaijan', 'Baku', 'Azerbaijan' || chr(31) || 'Baku');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 11, 'Bahamas', 'Nassau', 'Bahamas' || chr(31) || 'Nassau');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 12, 'Bahrain', 'Manama', 'Bahrain' || chr(31) || 'Manama');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 13, 'Bangladesh', 'Dhaka', 'Bangladesh' || chr(31) || 'Dhaka');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 14, 'Barbados', 'Bridgetown', 'Barbados' || chr(31) || 'Bridgetown');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 15, 'Belarus', 'Minsk', 'Belarus' || chr(31) || 'Minsk');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 16, 'Belgium', 'Brussels', 'Belgium' || chr(31) || 'Brussels');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 17, 'Belize', 'Belmopan', 'Belize' || chr(31) || 'Belmopan');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 18, 'Benin', 'Porto-Novo', 'Benin' || chr(31) || 'Porto-Novo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 19, 'Bhutan', 'Thimphu', 'Bhutan' || chr(31) || 'Thimphu');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 20, 'Bolivia', 'La Paz', 'Bolivia' || chr(31) || 'La Paz');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 21, 'Bosnia and Herzegovina', 'Sarajevo', 'Bosnia and Herzegovina' || chr(31) || 'Sarajevo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 22, 'Botswana', 'Gaborone', 'Botswana' || chr(31) || 'Gaborone');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 23, 'Brazil', 'Brasilia', 'Brazil' || chr(31) || 'Brasilia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 24, 'Brunei', 'Bandar Seri Begawan', 'Brunei' || chr(31) || 'Bandar Seri Begawan');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 25, 'Bulgaria', 'Sofia', 'Bulgaria' || chr(31) || 'Sofia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 26, 'Burkina Faso', 'Ouagadougou', 'Burkina Faso' || chr(31) || 'Ouagadougou');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 27, 'Burundi', 'Gitega', 'Burundi' || chr(31) || 'Gitega');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 28, 'Cabo Verde', 'Praia', 'Cabo Verde' || chr(31) || 'Praia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 29, 'Cambodia', 'Phnom Penh', 'Cambodia' || chr(31) || 'Phnom Penh');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 30, 'Cameroon', 'Yaounde', 'Cameroon' || chr(31) || 'Yaounde');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 31, 'Canada', 'Ottawa', 'Canada' || chr(31) || 'Ottawa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 32, 'Central African Republic', 'Bangui', 'Central African Republic' || chr(31) || 'Bangui');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 33, 'Chad', 'N''Djamena', 'Chad' || chr(31) || 'N''Djamena');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 34, 'Chile', 'Santiago', 'Chile' || chr(31) || 'Santiago');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 35, 'China', 'Beijing', 'China' || chr(31) || 'Beijing');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 36, 'Colombia', 'Bogota', 'Colombia' || chr(31) || 'Bogota');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 37, 'Comoros', 'Moroni', 'Comoros' || chr(31) || 'Moroni');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 38, 'Costa Rica', 'San Jose', 'Costa Rica' || chr(31) || 'San Jose');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 39, 'Croatia', 'Zagreb', 'Croatia' || chr(31) || 'Zagreb');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 40, 'Cuba', 'Havana', 'Cuba' || chr(31) || 'Havana');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 41, 'Cyprus', 'Nicosia', 'Cyprus' || chr(31) || 'Nicosia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 42, 'Czechia', 'Prague', 'Czechia' || chr(31) || 'Prague');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 43, 'Democratic Republic of the Congo', 'Kinshasa', 'Democratic Republic of the Congo' || chr(31) || 'Kinshasa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 44, 'Denmark', 'Copenhagen', 'Denmark' || chr(31) || 'Copenhagen');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 45, 'Djibouti', 'Djibouti', 'Djibouti' || chr(31) || 'Djibouti');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 46, 'Dominica', 'Roseau', 'Dominica' || chr(31) || 'Roseau');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 47, 'Dominican Republic', 'Santo Domingo', 'Dominican Republic' || chr(31) || 'Santo Domingo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 48, 'Ecuador', 'Quito', 'Ecuador' || chr(31) || 'Quito');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 49, 'Egypt', 'Cairo', 'Egypt' || chr(31) || 'Cairo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 50, 'El Salvador', 'San Salvador', 'El Salvador' || chr(31) || 'San Salvador');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 51, 'Equatorial Guinea', 'Malabo', 'Equatorial Guinea' || chr(31) || 'Malabo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 52, 'Eritrea', 'Asmara', 'Eritrea' || chr(31) || 'Asmara');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 53, 'Estonia', 'Tallinn', 'Estonia' || chr(31) || 'Tallinn');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 54, 'Eswatini', 'Mbabane', 'Eswatini' || chr(31) || 'Mbabane');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 55, 'Ethiopia', 'Addis Ababa', 'Ethiopia' || chr(31) || 'Addis Ababa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 56, 'Fiji', 'Suva', 'Fiji' || chr(31) || 'Suva');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 57, 'Finland', 'Helsinki', 'Finland' || chr(31) || 'Helsinki');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 58, 'France', 'Paris', 'France' || chr(31) || 'Paris');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 59, 'Gabon', 'Libreville', 'Gabon' || chr(31) || 'Libreville');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 60, 'Gambia', 'Banjul', 'Gambia' || chr(31) || 'Banjul');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 61, 'Georgia', 'Tbilisi', 'Georgia' || chr(31) || 'Tbilisi');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 62, 'Germany', 'Berlin', 'Germany' || chr(31) || 'Berlin');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 63, 'Ghana', 'Accra', 'Ghana' || chr(31) || 'Accra');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 64, 'Greece', 'Athens', 'Greece' || chr(31) || 'Athens');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 65, 'Grenada', 'Saint George''s', 'Grenada' || chr(31) || 'Saint George''s');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 66, 'Guatemala', 'Guatemala City', 'Guatemala' || chr(31) || 'Guatemala City');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 67, 'Guinea', 'Conakry', 'Guinea' || chr(31) || 'Conakry');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 68, 'Guinea-Bissau', 'Bissau', 'Guinea-Bissau' || chr(31) || 'Bissau');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 69, 'Guyana', 'Georgetown', 'Guyana' || chr(31) || 'Georgetown');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 70, 'Haiti', 'Port-au-Prince', 'Haiti' || chr(31) || 'Port-au-Prince');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 71, 'Honduras', 'Tegucigalpa', 'Honduras' || chr(31) || 'Tegucigalpa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 72, 'Hungary', 'Budapest', 'Hungary' || chr(31) || 'Budapest');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 73, 'Iceland', 'Reykjavik', 'Iceland' || chr(31) || 'Reykjavik');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 74, 'India', 'New Delhi', 'India' || chr(31) || 'New Delhi');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 75, 'Indonesia', 'Jakarta', 'Indonesia' || chr(31) || 'Jakarta');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 76, 'Iran', 'Tehran', 'Iran' || chr(31) || 'Tehran');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 77, 'Iraq', 'Baghdad', 'Iraq' || chr(31) || 'Baghdad');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 78, 'Ireland', 'Dublin', 'Ireland' || chr(31) || 'Dublin');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 79, 'Israel', 'Jerusalem', 'Israel' || chr(31) || 'Jerusalem');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 80, 'Italy', 'Rome', 'Italy' || chr(31) || 'Rome');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 81, 'Ivory Coast', 'Yamoussoukro', 'Ivory Coast' || chr(31) || 'Yamoussoukro');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 82, 'Jamaica', 'Kingston', 'Jamaica' || chr(31) || 'Kingston');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 83, 'Japan', 'Tokyo', 'Japan' || chr(31) || 'Tokyo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 84, 'Jordan', 'Amman', 'Jordan' || chr(31) || 'Amman');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 85, 'Kazakhstan', 'Astana', 'Kazakhstan' || chr(31) || 'Astana');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 86, 'Kenya', 'Nairobi', 'Kenya' || chr(31) || 'Nairobi');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 87, 'Kiribati', 'Tarawa', 'Kiribati' || chr(31) || 'Tarawa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 88, 'Kuwait', 'Kuwait City', 'Kuwait' || chr(31) || 'Kuwait City');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 89, 'Kyrgyzstan', 'Bishkek', 'Kyrgyzstan' || chr(31) || 'Bishkek');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 90, 'Laos', 'Vientiane', 'Laos' || chr(31) || 'Vientiane');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 91, 'Latvia', 'Riga', 'Latvia' || chr(31) || 'Riga');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 92, 'Lebanon', 'Beirut', 'Lebanon' || chr(31) || 'Beirut');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 93, 'Lesotho', 'Maseru', 'Lesotho' || chr(31) || 'Maseru');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 94, 'Liberia', 'Monrovia', 'Liberia' || chr(31) || 'Monrovia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 95, 'Libya', 'Tripoli', 'Libya' || chr(31) || 'Tripoli');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 96, 'Liechtenstein', 'Vaduz', 'Liechtenstein' || chr(31) || 'Vaduz');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 97, 'Lithuania', 'Vilnius', 'Lithuania' || chr(31) || 'Vilnius');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 98, 'Luxembourg', 'Luxembourg', 'Luxembourg' || chr(31) || 'Luxembourg');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 99, 'Madagascar', 'Antananarivo', 'Madagascar' || chr(31) || 'Antananarivo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 100, 'Malawi', 'Lilongwe', 'Malawi' || chr(31) || 'Lilongwe');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 101, 'Malaysia', 'Kuala Lumpur', 'Malaysia' || chr(31) || 'Kuala Lumpur');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 102, 'Maldives', 'Male', 'Maldives' || chr(31) || 'Male');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 103, 'Mali', 'Bamako', 'Mali' || chr(31) || 'Bamako');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 104, 'Malta', 'Valletta', 'Malta' || chr(31) || 'Valletta');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 105, 'Marshall Islands', 'Majuro', 'Marshall Islands' || chr(31) || 'Majuro');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 106, 'Mauritania', 'Nouakchott', 'Mauritania' || chr(31) || 'Nouakchott');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 107, 'Mauritius', 'Port Louis', 'Mauritius' || chr(31) || 'Port Louis');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 108, 'Mexico', 'Mexico City', 'Mexico' || chr(31) || 'Mexico City');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 109, 'Micronesia', 'Palikir', 'Micronesia' || chr(31) || 'Palikir');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 110, 'Moldova', 'Chisinau', 'Moldova' || chr(31) || 'Chisinau');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 111, 'Monaco', 'Monaco', 'Monaco' || chr(31) || 'Monaco');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 112, 'Mongolia', 'Ulaanbaatar', 'Mongolia' || chr(31) || 'Ulaanbaatar');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 113, 'Montenegro', 'Podgorica', 'Montenegro' || chr(31) || 'Podgorica');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 114, 'Morocco', 'Rabat', 'Morocco' || chr(31) || 'Rabat');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 115, 'Mozambique', 'Maputo', 'Mozambique' || chr(31) || 'Maputo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 116, 'Myanmar', 'Naypyidaw', 'Myanmar' || chr(31) || 'Naypyidaw');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 117, 'Namibia', 'Windhoek', 'Namibia' || chr(31) || 'Windhoek');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 118, 'Nauru', 'Yaren', 'Nauru' || chr(31) || 'Yaren');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 119, 'Nepal', 'Kathmandu', 'Nepal' || chr(31) || 'Kathmandu');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 120, 'Netherlands', 'Amsterdam', 'Netherlands' || chr(31) || 'Amsterdam');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 121, 'New Zealand', 'Wellington', 'New Zealand' || chr(31) || 'Wellington');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 122, 'Nicaragua', 'Managua', 'Nicaragua' || chr(31) || 'Managua');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 123, 'Niger', 'Niamey', 'Niger' || chr(31) || 'Niamey');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 124, 'Nigeria', 'Abuja', 'Nigeria' || chr(31) || 'Abuja');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 125, 'North Korea', 'Pyongyang', 'North Korea' || chr(31) || 'Pyongyang');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 126, 'North Macedonia', 'Skopje', 'North Macedonia' || chr(31) || 'Skopje');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 127, 'Norway', 'Oslo', 'Norway' || chr(31) || 'Oslo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 128, 'Oman', 'Muscat', 'Oman' || chr(31) || 'Muscat');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 129, 'Pakistan', 'Islamabad', 'Pakistan' || chr(31) || 'Islamabad');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 130, 'Palau', 'Ngerulmud', 'Palau' || chr(31) || 'Ngerulmud');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 131, 'Panama', 'Panama City', 'Panama' || chr(31) || 'Panama City');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 132, 'Papua New Guinea', 'Port Moresby', 'Papua New Guinea' || chr(31) || 'Port Moresby');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 133, 'Paraguay', 'Asuncion', 'Paraguay' || chr(31) || 'Asuncion');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 134, 'Peru', 'Lima', 'Peru' || chr(31) || 'Lima');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 135, 'Philippines', 'Manila', 'Philippines' || chr(31) || 'Manila');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 136, 'Poland', 'Warsaw', 'Poland' || chr(31) || 'Warsaw');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 137, 'Portugal', 'Lisbon', 'Portugal' || chr(31) || 'Lisbon');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 138, 'Qatar', 'Doha', 'Qatar' || chr(31) || 'Doha');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 139, 'Republic of the Congo', 'Brazzaville', 'Republic of the Congo' || chr(31) || 'Brazzaville');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 140, 'Romania', 'Bucharest', 'Romania' || chr(31) || 'Bucharest');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 141, 'Russia', 'Moscow', 'Russia' || chr(31) || 'Moscow');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 142, 'Rwanda', 'Kigali', 'Rwanda' || chr(31) || 'Kigali');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 143, 'Saint Kitts and Nevis', 'Basseterre', 'Saint Kitts and Nevis' || chr(31) || 'Basseterre');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 144, 'Saint Lucia', 'Castries', 'Saint Lucia' || chr(31) || 'Castries');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 145, 'Saint Vincent and the Grenadines', 'Kingstown', 'Saint Vincent and the Grenadines' || chr(31) || 'Kingstown');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 146, 'Samoa', 'Apia', 'Samoa' || chr(31) || 'Apia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 147, 'San Marino', 'San Marino', 'San Marino' || chr(31) || 'San Marino');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 148, 'Sao Tome and Principe', 'Sao Tome', 'Sao Tome and Principe' || chr(31) || 'Sao Tome');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 149, 'Saudi Arabia', 'Riyadh', 'Saudi Arabia' || chr(31) || 'Riyadh');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 150, 'Senegal', 'Dakar', 'Senegal' || chr(31) || 'Dakar');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 151, 'Serbia', 'Belgrade', 'Serbia' || chr(31) || 'Belgrade');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 152, 'Seychelles', 'Victoria', 'Seychelles' || chr(31) || 'Victoria');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 153, 'Sierra Leone', 'Freetown', 'Sierra Leone' || chr(31) || 'Freetown');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 154, 'Singapore', 'Singapore', 'Singapore' || chr(31) || 'Singapore');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 155, 'Slovakia', 'Bratislava', 'Slovakia' || chr(31) || 'Bratislava');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 156, 'Slovenia', 'Ljubljana', 'Slovenia' || chr(31) || 'Ljubljana');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 157, 'Solomon Islands', 'Honiara', 'Solomon Islands' || chr(31) || 'Honiara');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 158, 'Somalia', 'Mogadishu', 'Somalia' || chr(31) || 'Mogadishu');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 159, 'South Africa', 'Pretoria', 'South Africa' || chr(31) || 'Pretoria');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 160, 'South Korea', 'Seoul', 'South Korea' || chr(31) || 'Seoul');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 161, 'South Sudan', 'Juba', 'South Sudan' || chr(31) || 'Juba');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 162, 'Spain', 'Madrid', 'Spain' || chr(31) || 'Madrid');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 163, 'Sri Lanka', 'Colombo', 'Sri Lanka' || chr(31) || 'Colombo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 164, 'Sudan', 'Khartoum', 'Sudan' || chr(31) || 'Khartoum');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 165, 'Suriname', 'Paramaribo', 'Suriname' || chr(31) || 'Paramaribo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 166, 'Sweden', 'Stockholm', 'Sweden' || chr(31) || 'Stockholm');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 167, 'Switzerland', 'Bern', 'Switzerland' || chr(31) || 'Bern');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 168, 'Syria', 'Damascus', 'Syria' || chr(31) || 'Damascus');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 169, 'Taiwan', 'Taipei', 'Taiwan' || chr(31) || 'Taipei');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 170, 'Tajikistan', 'Dushanbe', 'Tajikistan' || chr(31) || 'Dushanbe');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 171, 'Tanzania', 'Dodoma', 'Tanzania' || chr(31) || 'Dodoma');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 172, 'Thailand', 'Bangkok', 'Thailand' || chr(31) || 'Bangkok');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 173, 'Timor-Leste', 'Dili', 'Timor-Leste' || chr(31) || 'Dili');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 174, 'Togo', 'Lome', 'Togo' || chr(31) || 'Lome');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 175, 'Tonga', 'Nuku''alofa', 'Tonga' || chr(31) || 'Nuku''alofa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 176, 'Trinidad and Tobago', 'Port of Spain', 'Trinidad and Tobago' || chr(31) || 'Port of Spain');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 177, 'Tunisia', 'Tunis', 'Tunisia' || chr(31) || 'Tunis');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 178, 'Turkey', 'Ankara', 'Turkey' || chr(31) || 'Ankara');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 179, 'Turkmenistan', 'Ashgabat', 'Turkmenistan' || chr(31) || 'Ashgabat');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 180, 'Tuvalu', 'Funafuti', 'Tuvalu' || chr(31) || 'Funafuti');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 181, 'Uganda', 'Kampala', 'Uganda' || chr(31) || 'Kampala');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 182, 'Ukraine', 'Kyiv', 'Ukraine' || chr(31) || 'Kyiv');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 183, 'United Arab Emirates', 'Abu Dhabi', 'United Arab Emirates' || chr(31) || 'Abu Dhabi');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 184, 'United Kingdom', 'London', 'United Kingdom' || chr(31) || 'London');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 185, 'United States', 'Washington', 'United States' || chr(31) || 'Washington');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 186, 'Uruguay', 'Montevideo', 'Uruguay' || chr(31) || 'Montevideo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 187, 'Uzbekistan', 'Tashkent', 'Uzbekistan' || chr(31) || 'Tashkent');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 188, 'Vanuatu', 'Port Vila', 'Vanuatu' || chr(31) || 'Port Vila');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 189, 'Vatican City', 'Vatican City', 'Vatican City' || chr(31) || 'Vatican City');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 190, 'Venezuela', 'Caracas', 'Venezuela' || chr(31) || 'Caracas');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 191, 'Vietnam', 'Hanoi', 'Vietnam' || chr(31) || 'Hanoi');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 192, 'Yemen', 'Sana''a', 'Yemen' || chr(31) || 'Sana''a');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 193, 'Zambia', 'Lusaka', 'Zambia' || chr(31) || 'Lusaka');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 194, 'Zimbabwe', 'Harare', 'Zimbabwe' || chr(31) || 'Harare');
