-- ChatRoom: esquema do banco (execute no SQL Editor do Supabase)

-- 1) Perfis --------------------------------------------------------------
-- Uma linha por usuário, criada automaticamente (veja o gatilho abaixo).
-- É daqui que vêm o nome e a cor mostrados nas mensagens.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar_color text not null default '#2563EB',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Perfis: leitura para quem está logado"
  on public.profiles for select to authenticated using (true);

create policy "Perfis: atualizar o próprio"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

grant select, update on public.profiles to authenticated;

-- Gatilho: toda vez que alguém se cadastra (uma linha nova em auth.users),
-- criamos o perfil correspondente sozinhos. "security definer" é necessário
-- aqui porque o gatilho roda no meio do cadastro, antes de existir sessão.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_color)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    (array['#2563EB', '#7C3AED', '#DB2777', '#059669', '#D97706', '#DC2626', '#0891B2'])
      [1 + floor(random() * 7)]
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Salas ----------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  description text not null default '',
  emoji text not null default '💬',
  is_private boolean not null default false,
  invite_code text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create policy "Salas: leitura para quem está logado"
  on public.rooms for select to authenticated using (true);

create policy "Salas: criar como dono"
  on public.rooms for insert to authenticated
  with check (auth.uid() = created_by);

grant select, insert on public.rooms to authenticated;

-- 3) Participação nas salas ------------------------------------------------
-- Entrar numa sala é um ato explícito: só quem tem uma linha aqui consegue
-- ler ou mandar mensagem naquela sala (políticas de "messages" abaixo).
create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.room_members enable row level security;

-- "Você está nesta sala?" — numa função à parte, e não direto na política.
-- Uma política de "room_members" que consultasse "room_members" de novo
-- reaplicaria essa MESMA política à subconsulta, causando recursão infinita
-- de verdade (o Postgres recusa com o erro "infinite recursion detected").
-- Com "security definer", a função consulta a tabela ignorando o RLS por
-- dentro, e a política só chama a função — sem se referenciar de volta.
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

create policy "Membros: a própria linha e os colegas de sala"
  on public.room_members for select to authenticated
  using (user_id = auth.uid() or public.is_room_member(room_id));

create policy "Membros: entrar como eu mesmo"
  on public.room_members for insert to authenticated
  with check (user_id = auth.uid());

create policy "Membros: sair (apagar a própria linha)"
  on public.room_members for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.room_members to authenticated;

-- 4) Mensagens --------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  image_url text,
  is_edited boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_room_idx on public.messages (room_id, created_at);

alter table public.messages enable row level security;

create policy "Mensagens: ler as das salas em que estou"
  on public.messages for select to authenticated
  using (public.is_room_member(room_id));

create policy "Mensagens: enviar nas salas em que estou"
  on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_room_member(room_id));

create policy "Mensagens: editar as próprias"
  on public.messages for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Mensagens: apagar as próprias"
  on public.messages for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.messages to authenticated;

-- 5) Reações em mensagens (Apêndice C) -------------------------------------
create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(trim(emoji)) between 1 and 8),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index message_reactions_msg_idx on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

create policy "Reações: membros leem"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
      and public.is_room_member(m.room_id)
    )
  );

create policy "Reações: reagir como eu mesmo"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
      and public.is_room_member(m.room_id)
    )
  );

create policy "Reações: remover própria reação"
  on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.message_reactions to authenticated;

-- 6) Confirmação de leitura (Apêndice C) -----------------------------------
create table public.message_reads (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index message_reads_msg_idx on public.message_reads (message_id);

alter table public.message_reads enable row level security;

create policy "Leituras: membros leem"
  on public.message_reads for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id
      and public.is_room_member(m.room_id)
    )
  );

create policy "Leituras: marcar como lido por mim mesmo"
  on public.message_reads for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id
      and public.is_room_member(m.room_id)
    )
  );

grant select, insert on public.message_reads to authenticated;

-- 7) Tempo real ---------------------------------------------------------
-- Sem isto, os inserts em "messages" acontecem no banco mas não chegam aos
-- outros usuários conectados: é este publish que liga a tabela ao Realtime.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.message_reads;
