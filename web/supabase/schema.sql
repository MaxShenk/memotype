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

insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 0, 'Afghanistan', 'Kabul', 'Afghanistan' || chr(0) || 'Kabul');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 1, 'Albania', 'Tirana', 'Albania' || chr(0) || 'Tirana');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 2, 'Algeria', 'Algiers', 'Algeria' || chr(0) || 'Algiers');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 3, 'Andorra', 'Andorra la Vella', 'Andorra' || chr(0) || 'Andorra la Vella');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 4, 'Angola', 'Luanda', 'Angola' || chr(0) || 'Luanda');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 5, 'Antigua and Barbuda', 'Saint John''s', 'Antigua and Barbuda' || chr(0) || 'Saint John''s');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 6, 'Argentina', 'Buenos Aires', 'Argentina' || chr(0) || 'Buenos Aires');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 7, 'Armenia', 'Yerevan', 'Armenia' || chr(0) || 'Yerevan');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 8, 'Australia', 'Canberra', 'Australia' || chr(0) || 'Canberra');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 9, 'Austria', 'Vienna', 'Austria' || chr(0) || 'Vienna');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 10, 'Azerbaijan', 'Baku', 'Azerbaijan' || chr(0) || 'Baku');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 11, 'Bahamas', 'Nassau', 'Bahamas' || chr(0) || 'Nassau');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 12, 'Bahrain', 'Manama', 'Bahrain' || chr(0) || 'Manama');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 13, 'Bangladesh', 'Dhaka', 'Bangladesh' || chr(0) || 'Dhaka');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 14, 'Barbados', 'Bridgetown', 'Barbados' || chr(0) || 'Bridgetown');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 15, 'Belarus', 'Minsk', 'Belarus' || chr(0) || 'Minsk');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 16, 'Belgium', 'Brussels', 'Belgium' || chr(0) || 'Brussels');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 17, 'Belize', 'Belmopan', 'Belize' || chr(0) || 'Belmopan');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 18, 'Benin', 'Porto-Novo', 'Benin' || chr(0) || 'Porto-Novo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 19, 'Bhutan', 'Thimphu', 'Bhutan' || chr(0) || 'Thimphu');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 20, 'Bolivia', 'La Paz', 'Bolivia' || chr(0) || 'La Paz');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 21, 'Bosnia and Herzegovina', 'Sarajevo', 'Bosnia and Herzegovina' || chr(0) || 'Sarajevo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 22, 'Botswana', 'Gaborone', 'Botswana' || chr(0) || 'Gaborone');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 23, 'Brazil', 'Brasilia', 'Brazil' || chr(0) || 'Brasilia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 24, 'Brunei', 'Bandar Seri Begawan', 'Brunei' || chr(0) || 'Bandar Seri Begawan');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 25, 'Bulgaria', 'Sofia', 'Bulgaria' || chr(0) || 'Sofia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 26, 'Burkina Faso', 'Ouagadougou', 'Burkina Faso' || chr(0) || 'Ouagadougou');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 27, 'Burundi', 'Gitega', 'Burundi' || chr(0) || 'Gitega');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 28, 'Cabo Verde', 'Praia', 'Cabo Verde' || chr(0) || 'Praia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 29, 'Cambodia', 'Phnom Penh', 'Cambodia' || chr(0) || 'Phnom Penh');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 30, 'Cameroon', 'Yaounde', 'Cameroon' || chr(0) || 'Yaounde');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 31, 'Canada', 'Ottawa', 'Canada' || chr(0) || 'Ottawa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 32, 'Central African Republic', 'Bangui', 'Central African Republic' || chr(0) || 'Bangui');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 33, 'Chad', 'N''Djamena', 'Chad' || chr(0) || 'N''Djamena');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 34, 'Chile', 'Santiago', 'Chile' || chr(0) || 'Santiago');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 35, 'China', 'Beijing', 'China' || chr(0) || 'Beijing');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 36, 'Colombia', 'Bogota', 'Colombia' || chr(0) || 'Bogota');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 37, 'Comoros', 'Moroni', 'Comoros' || chr(0) || 'Moroni');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 38, 'Costa Rica', 'San Jose', 'Costa Rica' || chr(0) || 'San Jose');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 39, 'Croatia', 'Zagreb', 'Croatia' || chr(0) || 'Zagreb');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 40, 'Cuba', 'Havana', 'Cuba' || chr(0) || 'Havana');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 41, 'Cyprus', 'Nicosia', 'Cyprus' || chr(0) || 'Nicosia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 42, 'Czechia', 'Prague', 'Czechia' || chr(0) || 'Prague');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 43, 'Democratic Republic of the Congo', 'Kinshasa', 'Democratic Republic of the Congo' || chr(0) || 'Kinshasa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 44, 'Denmark', 'Copenhagen', 'Denmark' || chr(0) || 'Copenhagen');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 45, 'Djibouti', 'Djibouti', 'Djibouti' || chr(0) || 'Djibouti');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 46, 'Dominica', 'Roseau', 'Dominica' || chr(0) || 'Roseau');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 47, 'Dominican Republic', 'Santo Domingo', 'Dominican Republic' || chr(0) || 'Santo Domingo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 48, 'Ecuador', 'Quito', 'Ecuador' || chr(0) || 'Quito');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 49, 'Egypt', 'Cairo', 'Egypt' || chr(0) || 'Cairo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 50, 'El Salvador', 'San Salvador', 'El Salvador' || chr(0) || 'San Salvador');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 51, 'Equatorial Guinea', 'Malabo', 'Equatorial Guinea' || chr(0) || 'Malabo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 52, 'Eritrea', 'Asmara', 'Eritrea' || chr(0) || 'Asmara');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 53, 'Estonia', 'Tallinn', 'Estonia' || chr(0) || 'Tallinn');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 54, 'Eswatini', 'Mbabane', 'Eswatini' || chr(0) || 'Mbabane');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 55, 'Ethiopia', 'Addis Ababa', 'Ethiopia' || chr(0) || 'Addis Ababa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 56, 'Fiji', 'Suva', 'Fiji' || chr(0) || 'Suva');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 57, 'Finland', 'Helsinki', 'Finland' || chr(0) || 'Helsinki');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 58, 'France', 'Paris', 'France' || chr(0) || 'Paris');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 59, 'Gabon', 'Libreville', 'Gabon' || chr(0) || 'Libreville');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 60, 'Gambia', 'Banjul', 'Gambia' || chr(0) || 'Banjul');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 61, 'Georgia', 'Tbilisi', 'Georgia' || chr(0) || 'Tbilisi');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 62, 'Germany', 'Berlin', 'Germany' || chr(0) || 'Berlin');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 63, 'Ghana', 'Accra', 'Ghana' || chr(0) || 'Accra');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 64, 'Greece', 'Athens', 'Greece' || chr(0) || 'Athens');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 65, 'Grenada', 'Saint George''s', 'Grenada' || chr(0) || 'Saint George''s');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 66, 'Guatemala', 'Guatemala City', 'Guatemala' || chr(0) || 'Guatemala City');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 67, 'Guinea', 'Conakry', 'Guinea' || chr(0) || 'Conakry');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 68, 'Guinea-Bissau', 'Bissau', 'Guinea-Bissau' || chr(0) || 'Bissau');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 69, 'Guyana', 'Georgetown', 'Guyana' || chr(0) || 'Georgetown');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 70, 'Haiti', 'Port-au-Prince', 'Haiti' || chr(0) || 'Port-au-Prince');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 71, 'Honduras', 'Tegucigalpa', 'Honduras' || chr(0) || 'Tegucigalpa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 72, 'Hungary', 'Budapest', 'Hungary' || chr(0) || 'Budapest');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 73, 'Iceland', 'Reykjavik', 'Iceland' || chr(0) || 'Reykjavik');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 74, 'India', 'New Delhi', 'India' || chr(0) || 'New Delhi');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 75, 'Indonesia', 'Jakarta', 'Indonesia' || chr(0) || 'Jakarta');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 76, 'Iran', 'Tehran', 'Iran' || chr(0) || 'Tehran');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 77, 'Iraq', 'Baghdad', 'Iraq' || chr(0) || 'Baghdad');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 78, 'Ireland', 'Dublin', 'Ireland' || chr(0) || 'Dublin');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 79, 'Israel', 'Jerusalem', 'Israel' || chr(0) || 'Jerusalem');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 80, 'Italy', 'Rome', 'Italy' || chr(0) || 'Rome');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 81, 'Ivory Coast', 'Yamoussoukro', 'Ivory Coast' || chr(0) || 'Yamoussoukro');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 82, 'Jamaica', 'Kingston', 'Jamaica' || chr(0) || 'Kingston');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 83, 'Japan', 'Tokyo', 'Japan' || chr(0) || 'Tokyo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 84, 'Jordan', 'Amman', 'Jordan' || chr(0) || 'Amman');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 85, 'Kazakhstan', 'Astana', 'Kazakhstan' || chr(0) || 'Astana');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 86, 'Kenya', 'Nairobi', 'Kenya' || chr(0) || 'Nairobi');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 87, 'Kiribati', 'Tarawa', 'Kiribati' || chr(0) || 'Tarawa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 88, 'Kuwait', 'Kuwait City', 'Kuwait' || chr(0) || 'Kuwait City');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 89, 'Kyrgyzstan', 'Bishkek', 'Kyrgyzstan' || chr(0) || 'Bishkek');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 90, 'Laos', 'Vientiane', 'Laos' || chr(0) || 'Vientiane');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 91, 'Latvia', 'Riga', 'Latvia' || chr(0) || 'Riga');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 92, 'Lebanon', 'Beirut', 'Lebanon' || chr(0) || 'Beirut');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 93, 'Lesotho', 'Maseru', 'Lesotho' || chr(0) || 'Maseru');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 94, 'Liberia', 'Monrovia', 'Liberia' || chr(0) || 'Monrovia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 95, 'Libya', 'Tripoli', 'Libya' || chr(0) || 'Tripoli');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 96, 'Liechtenstein', 'Vaduz', 'Liechtenstein' || chr(0) || 'Vaduz');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 97, 'Lithuania', 'Vilnius', 'Lithuania' || chr(0) || 'Vilnius');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 98, 'Luxembourg', 'Luxembourg', 'Luxembourg' || chr(0) || 'Luxembourg');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 99, 'Madagascar', 'Antananarivo', 'Madagascar' || chr(0) || 'Antananarivo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 100, 'Malawi', 'Lilongwe', 'Malawi' || chr(0) || 'Lilongwe');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 101, 'Malaysia', 'Kuala Lumpur', 'Malaysia' || chr(0) || 'Kuala Lumpur');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 102, 'Maldives', 'Male', 'Maldives' || chr(0) || 'Male');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 103, 'Mali', 'Bamako', 'Mali' || chr(0) || 'Bamako');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 104, 'Malta', 'Valletta', 'Malta' || chr(0) || 'Valletta');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 105, 'Marshall Islands', 'Majuro', 'Marshall Islands' || chr(0) || 'Majuro');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 106, 'Mauritania', 'Nouakchott', 'Mauritania' || chr(0) || 'Nouakchott');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 107, 'Mauritius', 'Port Louis', 'Mauritius' || chr(0) || 'Port Louis');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 108, 'Mexico', 'Mexico City', 'Mexico' || chr(0) || 'Mexico City');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 109, 'Micronesia', 'Palikir', 'Micronesia' || chr(0) || 'Palikir');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 110, 'Moldova', 'Chisinau', 'Moldova' || chr(0) || 'Chisinau');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 111, 'Monaco', 'Monaco', 'Monaco' || chr(0) || 'Monaco');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 112, 'Mongolia', 'Ulaanbaatar', 'Mongolia' || chr(0) || 'Ulaanbaatar');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 113, 'Montenegro', 'Podgorica', 'Montenegro' || chr(0) || 'Podgorica');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 114, 'Morocco', 'Rabat', 'Morocco' || chr(0) || 'Rabat');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 115, 'Mozambique', 'Maputo', 'Mozambique' || chr(0) || 'Maputo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 116, 'Myanmar', 'Naypyidaw', 'Myanmar' || chr(0) || 'Naypyidaw');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 117, 'Namibia', 'Windhoek', 'Namibia' || chr(0) || 'Windhoek');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 118, 'Nauru', 'Yaren', 'Nauru' || chr(0) || 'Yaren');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 119, 'Nepal', 'Kathmandu', 'Nepal' || chr(0) || 'Kathmandu');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 120, 'Netherlands', 'Amsterdam', 'Netherlands' || chr(0) || 'Amsterdam');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 121, 'New Zealand', 'Wellington', 'New Zealand' || chr(0) || 'Wellington');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 122, 'Nicaragua', 'Managua', 'Nicaragua' || chr(0) || 'Managua');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 123, 'Niger', 'Niamey', 'Niger' || chr(0) || 'Niamey');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 124, 'Nigeria', 'Abuja', 'Nigeria' || chr(0) || 'Abuja');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 125, 'North Korea', 'Pyongyang', 'North Korea' || chr(0) || 'Pyongyang');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 126, 'North Macedonia', 'Skopje', 'North Macedonia' || chr(0) || 'Skopje');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 127, 'Norway', 'Oslo', 'Norway' || chr(0) || 'Oslo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 128, 'Oman', 'Muscat', 'Oman' || chr(0) || 'Muscat');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 129, 'Pakistan', 'Islamabad', 'Pakistan' || chr(0) || 'Islamabad');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 130, 'Palau', 'Ngerulmud', 'Palau' || chr(0) || 'Ngerulmud');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 131, 'Panama', 'Panama City', 'Panama' || chr(0) || 'Panama City');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 132, 'Papua New Guinea', 'Port Moresby', 'Papua New Guinea' || chr(0) || 'Port Moresby');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 133, 'Paraguay', 'Asuncion', 'Paraguay' || chr(0) || 'Asuncion');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 134, 'Peru', 'Lima', 'Peru' || chr(0) || 'Lima');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 135, 'Philippines', 'Manila', 'Philippines' || chr(0) || 'Manila');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 136, 'Poland', 'Warsaw', 'Poland' || chr(0) || 'Warsaw');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 137, 'Portugal', 'Lisbon', 'Portugal' || chr(0) || 'Lisbon');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 138, 'Qatar', 'Doha', 'Qatar' || chr(0) || 'Doha');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 139, 'Republic of the Congo', 'Brazzaville', 'Republic of the Congo' || chr(0) || 'Brazzaville');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 140, 'Romania', 'Bucharest', 'Romania' || chr(0) || 'Bucharest');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 141, 'Russia', 'Moscow', 'Russia' || chr(0) || 'Moscow');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 142, 'Rwanda', 'Kigali', 'Rwanda' || chr(0) || 'Kigali');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 143, 'Saint Kitts and Nevis', 'Basseterre', 'Saint Kitts and Nevis' || chr(0) || 'Basseterre');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 144, 'Saint Lucia', 'Castries', 'Saint Lucia' || chr(0) || 'Castries');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 145, 'Saint Vincent and the Grenadines', 'Kingstown', 'Saint Vincent and the Grenadines' || chr(0) || 'Kingstown');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 146, 'Samoa', 'Apia', 'Samoa' || chr(0) || 'Apia');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 147, 'San Marino', 'San Marino', 'San Marino' || chr(0) || 'San Marino');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 148, 'Sao Tome and Principe', 'Sao Tome', 'Sao Tome and Principe' || chr(0) || 'Sao Tome');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 149, 'Saudi Arabia', 'Riyadh', 'Saudi Arabia' || chr(0) || 'Riyadh');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 150, 'Senegal', 'Dakar', 'Senegal' || chr(0) || 'Dakar');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 151, 'Serbia', 'Belgrade', 'Serbia' || chr(0) || 'Belgrade');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 152, 'Seychelles', 'Victoria', 'Seychelles' || chr(0) || 'Victoria');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 153, 'Sierra Leone', 'Freetown', 'Sierra Leone' || chr(0) || 'Freetown');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 154, 'Singapore', 'Singapore', 'Singapore' || chr(0) || 'Singapore');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 155, 'Slovakia', 'Bratislava', 'Slovakia' || chr(0) || 'Bratislava');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 156, 'Slovenia', 'Ljubljana', 'Slovenia' || chr(0) || 'Ljubljana');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 157, 'Solomon Islands', 'Honiara', 'Solomon Islands' || chr(0) || 'Honiara');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 158, 'Somalia', 'Mogadishu', 'Somalia' || chr(0) || 'Mogadishu');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 159, 'South Africa', 'Pretoria', 'South Africa' || chr(0) || 'Pretoria');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 160, 'South Korea', 'Seoul', 'South Korea' || chr(0) || 'Seoul');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 161, 'South Sudan', 'Juba', 'South Sudan' || chr(0) || 'Juba');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 162, 'Spain', 'Madrid', 'Spain' || chr(0) || 'Madrid');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 163, 'Sri Lanka', 'Colombo', 'Sri Lanka' || chr(0) || 'Colombo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 164, 'Sudan', 'Khartoum', 'Sudan' || chr(0) || 'Khartoum');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 165, 'Suriname', 'Paramaribo', 'Suriname' || chr(0) || 'Paramaribo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 166, 'Sweden', 'Stockholm', 'Sweden' || chr(0) || 'Stockholm');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 167, 'Switzerland', 'Bern', 'Switzerland' || chr(0) || 'Bern');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 168, 'Syria', 'Damascus', 'Syria' || chr(0) || 'Damascus');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 169, 'Taiwan', 'Taipei', 'Taiwan' || chr(0) || 'Taipei');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 170, 'Tajikistan', 'Dushanbe', 'Tajikistan' || chr(0) || 'Dushanbe');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 171, 'Tanzania', 'Dodoma', 'Tanzania' || chr(0) || 'Dodoma');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 172, 'Thailand', 'Bangkok', 'Thailand' || chr(0) || 'Bangkok');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 173, 'Timor-Leste', 'Dili', 'Timor-Leste' || chr(0) || 'Dili');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 174, 'Togo', 'Lome', 'Togo' || chr(0) || 'Lome');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 175, 'Tonga', 'Nuku''alofa', 'Tonga' || chr(0) || 'Nuku''alofa');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 176, 'Trinidad and Tobago', 'Port of Spain', 'Trinidad and Tobago' || chr(0) || 'Port of Spain');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 177, 'Tunisia', 'Tunis', 'Tunisia' || chr(0) || 'Tunis');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 178, 'Turkey', 'Ankara', 'Turkey' || chr(0) || 'Ankara');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 179, 'Turkmenistan', 'Ashgabat', 'Turkmenistan' || chr(0) || 'Ashgabat');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 180, 'Tuvalu', 'Funafuti', 'Tuvalu' || chr(0) || 'Funafuti');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 181, 'Uganda', 'Kampala', 'Uganda' || chr(0) || 'Kampala');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 182, 'Ukraine', 'Kyiv', 'Ukraine' || chr(0) || 'Kyiv');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 183, 'United Arab Emirates', 'Abu Dhabi', 'United Arab Emirates' || chr(0) || 'Abu Dhabi');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 184, 'United Kingdom', 'London', 'United Kingdom' || chr(0) || 'London');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 185, 'United States', 'Washington', 'United States' || chr(0) || 'Washington');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 186, 'Uruguay', 'Montevideo', 'Uruguay' || chr(0) || 'Montevideo');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 187, 'Uzbekistan', 'Tashkent', 'Uzbekistan' || chr(0) || 'Tashkent');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 188, 'Vanuatu', 'Port Vila', 'Vanuatu' || chr(0) || 'Port Vila');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 189, 'Vatican City', 'Vatican City', 'Vatican City' || chr(0) || 'Vatican City');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 190, 'Venezuela', 'Caracas', 'Venezuela' || chr(0) || 'Caracas');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 191, 'Vietnam', 'Hanoi', 'Vietnam' || chr(0) || 'Hanoi');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 192, 'Yemen', 'Sana''a', 'Yemen' || chr(0) || 'Sana''a');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 193, 'Zambia', 'Lusaka', 'Zambia' || chr(0) || 'Lusaka');
insert into public.cards (deck_id, position, term, definition, card_key) values ('00000000-0000-4000-8000-000000000001', 194, 'Zimbabwe', 'Harare', 'Zimbabwe' || chr(0) || 'Harare');
