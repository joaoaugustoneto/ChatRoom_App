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

create policy "Perfis: inserir próprio perfil"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

grant select, insert, update on public.profiles to authenticated;

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
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      split_part(new.email, '@', 1),
      'Usuário'
    ),
    (array['#2563EB', '#7C3AED', '#DB2777', '#059669', '#D97706', '#DC2626', '#0891B2'])
      [1 + floor(random() * 7)]
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Garante que todo usuário já existente em auth.users possua um registro em public.profiles
insert into public.profiles (id, username, avatar_color)
select
  id,
  coalesce(
    nullif(trim(raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(raw_user_meta_data ->> 'username'), ''),
    split_part(email, '@', 1),
    'Usuário'
  ),
  '#2563EB'
from auth.users
where id not in (select id from public.profiles)
on conflict (id) do nothing;

-- 2) Salas ----------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  description text not null default '',
  emoji text not null default '💬',
  is_private boolean not null default false,
  invite_code text,
  is_direct boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create policy "Salas: criar como dono"
  on public.rooms for insert to authenticated
  with check (auth.uid() = created_by);

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

create policy "Salas: leitura para quem está logado"
  on public.rooms for select to authenticated
  using (not is_direct or public.is_room_member(id));

grant select, insert on public.rooms to authenticated;

-- Função auxiliar para mensagens diretas (1 para 1)
create or replace function public.get_or_create_direct_room(p_target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_current_user uuid := auth.uid();
  v_other_name text;
begin
  if v_current_user is null then
    raise exception 'Não autenticado';
  end if;
  if p_target_user_id = v_current_user then
    raise exception 'Não pode criar conversa direta consigo mesmo';
  end if;

  select r.id into v_room_id
  from public.rooms r
  join public.room_members m1 on m1.room_id = r.id and m1.user_id = v_current_user
  join public.room_members m2 on m2.room_id = r.id and m2.user_id = p_target_user_id
  where r.is_direct = true
  limit 1;

  if v_room_id is not null then
    return v_room_id;
  end if;

  select username into v_other_name from public.profiles where id = p_target_user_id;

  insert into public.rooms (name, description, emoji, is_direct, created_by)
  values (coalesce(v_other_name, 'Conversa Privada'), 'Mensagem Direta 1:1', '🔒', true, v_current_user)
  returning id into v_room_id;

  insert into public.room_members (room_id, user_id) values (v_room_id, v_current_user);
  insert into public.room_members (room_id, user_id) values (v_room_id, p_target_user_id);

  return v_room_id;
end;
$$;

revoke all on function public.get_or_create_direct_room(uuid) from public;
grant execute on function public.get_or_create_direct_room(uuid) to authenticated;

-- Função auxiliar para criação atômica de sala com membro e auto-recuperação de perfil
create or replace function public.create_room_with_member(
  p_name text,
  p_description text default '',
  p_emoji text default '💬',
  p_is_private boolean default false,
  p_invite_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_user_id uuid := auth.uid();
  v_username text;
begin
  if v_user_id is null then
    raise exception 'Não autenticado';
  end if;

  -- Garante que o perfil existe em profiles antes de criar a sala
  if not exists (select 1 from public.profiles where id = v_user_id) then
    select coalesce(
      nullif(trim(raw_user_meta_data->>'full_name'), ''),
      nullif(trim(raw_user_meta_data->>'username'), ''),
      split_part(email, '@', 1),
      'Usuário'
    ) into v_username
    from auth.users where id = v_user_id;

    insert into public.profiles (id, username, avatar_color)
    values (v_user_id, coalesce(v_username, 'Usuário'), '#2563EB')
    on conflict (id) do nothing;
  end if;

  -- Cria a sala
  insert into public.rooms (name, description, emoji, is_private, invite_code, is_direct, created_by)
  values (p_name, coalesce(p_description, ''), coalesce(p_emoji, '💬'), coalesce(p_is_private, false), p_invite_code, false, v_user_id)
  returning id into v_room_id;

  -- Adiciona o criador como membro
  insert into public.room_members (room_id, user_id)
  values (v_room_id, v_user_id)
  on conflict do nothing;

  return v_room_id;
end;
$$;

revoke all on function public.create_room_with_member from public;
grant execute on function public.create_room_with_member to authenticated;

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

-- 8) Tokens de notificação push e gatilho de disparo (Apêndice C) -------
create table public.user_push_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  push_token text not null check (char_length(trim(push_token)) between 5 and 200),
  updated_at timestamptz not null default now()
);

alter table public.user_push_tokens enable row level security;

create policy "Tokens de push: gerenciar apenas o próprio token"
  on public.user_push_tokens for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_push_tokens to authenticated;

-- Função e gatilho acionados ao criar mensagem
create or replace function public.notify_room_members_on_message()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Registra gatilho para acionamento de Webhook / Edge Function no Supabase
  return NEW;
end;
$$;

drop trigger if exists on_message_created_notify on public.messages;
create trigger on_message_created_notify
  after insert on public.messages
  for each row execute function public.notify_room_members_on_message();
