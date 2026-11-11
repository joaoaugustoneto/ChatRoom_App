// Testes do banco com PGlite (Postgres real, rodando dentro do Node, sem Docker).
// Aplica o MESMO schema.sql que você roda no Supabase.
// Execução: node --test supabase/tests/ (ou npm run test:db)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { after, before, describe, it } from 'node:test';

const SUPABASE = fileURLToPath(new URL('..', import.meta.url));
const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CARL = '33333333-3333-3333-3333-333333333333';

// O que o Supabase já oferece e o Postgres puro não tem: o schema "auth", a
// tabela de usuários (com o campo que o gatilho lê), a função auth.uid() e
// os papéis anon e authenticated.
const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
`;

let db;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);

  const schema = readFileSync(`${SUPABASE}/schema.sql`, 'utf8').replace(
    /alter publication [^\n;]+;/gi,
    '-- pulado no teste local',
  );
  await db.exec(schema);

  // Três usuários o cadastro de cada um já dispara o gatilho e cria o perfil.
  await db.query(
    'insert into auth.users (id, email, raw_user_meta_data) values ($1, \'ana@x.com\', \'{"full_name": "Ana Souza"}\')',
    [ALICE],
  );
  await db.query(
    'insert into auth.users (id, email, raw_user_meta_data) values ($1, \'bob@x.com\', \'{"full_name": "Bob"}\')',
    [BOB],
  );
  await db.query("insert into auth.users (id, email) values ($1, 'carl@x.com')", [CARL]);
});

after(async () => {
  await db.close();
});

async function as(uid, fn) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;

async function createRoom(uid, name = 'Sala geral') {
  return as(uid, async () => {
    const row = await one(
      'insert into rooms (name, created_by) values ($1, $2) returning id',
      [name, uid],
    );
    await db.query('insert into room_members (room_id, user_id) values ($1, $2)', [
      row.id,
      uid,
    ]);
    return row.id;
  });
}

const join = (uid, roomId) =>
  as(uid, () =>
    db.query('insert into room_members (room_id, user_id) values ($1, $2)', [
      roomId,
      uid,
    ]),
  );

const send = (uid, roomId, body) =>
  as(
    uid,
    async () =>
      (
        await one(
          'insert into messages (room_id, user_id, body) values ($1, $2, $3) returning id',
          [roomId, uid, body],
        )
      ).id,
  );

describe('perfis (gatilho automático)', () => {
  it('cria um perfil para cada usuário cadastrado, com o nome certo', async () => {
    const ana = await one('select username from profiles where id = $1', [ALICE]);
    const carl = await one('select username from profiles where id = $1', [CARL]);
    assert.equal(ana.username, 'Ana Souza');
    assert.equal(carl.username, 'carl'); // sem full_name: usa a parte antes do @
  });

  it('qualquer usuário logado lê os perfis, mas só atualiza o próprio', async () => {
    assert.equal((await as(BOB, () => rows('select id from profiles'))).length, 3);

    await as(ALICE, () =>
      db.query("update profiles set username = 'Ana A.' where id = $1", [ALICE]),
    );
    assert.equal(
      (await one('select username from profiles where id = $1', [ALICE])).username,
      'Ana A.',
    );

    // Update não "explode": ele só não encontra a linha de Alice para Bob
    // atualizar (o RLS filtra antes), então afeta 0 linhas e nada muda.
    const result = await as(BOB, () =>
      db.query("update profiles set username = 'hack' where id = $1", [ALICE]),
    );
    assert.equal(result.affectedRows ?? result.rowCount ?? 0, 0);
    assert.equal(
      (await one('select username from profiles where id = $1', [ALICE])).username,
      'Ana A.',
    );
  });
});

describe('salas e participação', () => {
  it('qualquer usuário logado cria uma sala e já entra nela', async () => {
    const roomId = await createRoom(ALICE, 'Fãs de React Native');
    const room = await one('select name, created_by from rooms where id = $1', [roomId]);
    assert.equal(room.name, 'Fãs de React Native');
    assert.equal(room.created_by, ALICE);
    assert.equal(
      Number(
        (await one('select count(*) c from room_members where room_id = $1', [roomId])).c,
      ),
      1,
    );
  });

  it('não é possível criar uma sala em nome de outro usuário', async () => {
    await assert.rejects(
      as(ALICE, () =>
        db.query('insert into rooms (name, created_by) values ($1, $2)', ['Sala', BOB]),
      ),
      /row-level security/,
    );
  });

  it('não é possível entrar numa sala em nome de outro usuário', async () => {
    const roomId = await createRoom(ALICE);
    await assert.rejects(
      as(BOB, () =>
        db.query('insert into room_members (room_id, user_id) values ($1, $2)', [
          roomId,
          CARL,
        ]),
      ),
      /row-level security/,
    );
  });

  it('um membro vê os outros membros da mesma sala; quem está fora, não', async () => {
    const roomId = await createRoom(ALICE);
    await join(BOB, roomId);

    assert.equal(
      (
        await as(BOB, () =>
          rows('select user_id from room_members where room_id = $1', [roomId]),
        )
      ).length,
      2,
    );

    assert.equal(
      (
        await as(CARL, () =>
          rows('select user_id from room_members where room_id = $1', [roomId]),
        )
      ).length,
      0,
    );
  });

  it('sair da sala apaga a própria participação, e só a própria', async () => {
    const roomId = await createRoom(ALICE);
    await join(BOB, roomId);

    await as(BOB, () =>
      db.query('delete from room_members where room_id = $1 and user_id = $2', [
        roomId,
        BOB,
      ]),
    );

    assert.equal(
      Number(
        (await one('select count(*) c from room_members where room_id = $1', [roomId])).c,
      ),
      1,
    );
  });

  it('cria sala privada com código de convite', async () => {
    const roomId = await as(ALICE, async () => {
      const row = await one(
        'insert into rooms (name, is_private, invite_code, created_by) values ($1, $2, $3, $4) returning id',
        ['Sala VIP', true, 'SEGREDO', ALICE],
      );
      await db.query('insert into room_members (room_id, user_id) values ($1, $2)', [
        row.id,
        ALICE,
      ]);
      return row.id;
    });

    const room = await one('select is_private, invite_code from rooms where id = $1', [
      roomId,
    ]);
    assert.equal(room.is_private, true);
    assert.equal(room.invite_code, 'SEGREDO');
  });

  it('mensagens diretas (1 para 1): apenas os 2 participantes enxergam a sala e conversam', async () => {
    // Alice cria/obtém sala direta com Bob
    const dmRoomId = (
      await as(ALICE, () => one('select get_or_create_direct_room($1) as id', [BOB]))
    ).id;

    assert.ok(dmRoomId);

    // Idempotência: chamar novamente com os mesmos participantes retorna a mesma sala
    const dmRoomId2 = (
      await as(BOB, () => one('select get_or_create_direct_room($1) as id', [ALICE]))
    ).id;
    assert.equal(dmRoomId, dmRoomId2);

    // Alice e Bob enxergam a sala na consulta de rooms
    const aliceRooms = await as(ALICE, () =>
      rows('select id from rooms where id = $1', [dmRoomId]),
    );
    assert.equal(aliceRooms.length, 1);

    const bobRooms = await as(BOB, () =>
      rows('select id from rooms where id = $1', [dmRoomId]),
    );
    assert.equal(bobRooms.length, 1);

    // Carl (terceiro) NÃO consegue ver a sala direta (RLS protege salas diretas)
    const carlRooms = await as(CARL, () =>
      rows('select id from rooms where id = $1', [dmRoomId]),
    );
    assert.equal(carlRooms.length, 0);

    // Alice e Bob podem trocar mensagens na DM
    await send(ALICE, dmRoomId, 'Oi Bob, conversa privada!');
    await send(BOB, dmRoomId, 'Oi Alice, recebido em sigilo!');

    // Carl não consegue ler mensagens da DM
    const carlMsgs = await as(CARL, () =>
      rows('select id from messages where room_id = $1', [dmRoomId]),
    );
    assert.equal(carlMsgs.length, 0);

    // Nem enviar mensagens na DM
    await assert.rejects(
      send(CARL, dmRoomId, 'Quero me intrometer!'),
      /row-level security/,
    );
  });
});

describe('mensagens', () => {
  it('só um membro da sala consegue enviar mensagem nela', async () => {
    const roomId = await createRoom(ALICE);
    await send(ALICE, roomId, 'Olá pessoal!');

    await assert.rejects(send(BOB, roomId, 'Posso entrar?'), /row-level security/);

    await join(BOB, roomId);
    await send(BOB, roomId, 'Agora sim!');

    assert.equal(
      Number(
        (await one('select count(*) c from messages where room_id = $1', [roomId])).c,
      ),
      2,
    );
  });

  it('só um membro da sala consegue ler as mensagens dela', async () => {
    const roomId = await createRoom(ALICE);
    await send(ALICE, roomId, 'Segredo do grupo');

    assert.equal(
      (await as(BOB, () => rows('select id from messages where room_id = $1', [roomId])))
        .length,
      0,
    );

    await join(BOB, roomId);

    assert.equal(
      (await as(BOB, () => rows('select id from messages where room_id = $1', [roomId])))
        .length,
      1,
    );
  });

  it('recusa mensagem vazia ou maior que 2000 caracteres', async () => {
    const roomId = await createRoom(ALICE);
    await assert.rejects(send(ALICE, roomId, ''), /messages_body_check/);
    await assert.rejects(send(ALICE, roomId, '   '), /messages_body_check/);
    await assert.rejects(send(ALICE, roomId, 'x'.repeat(2001)), /messages_body_check/);
  });

  it('cada um só apaga a própria mensagem', async () => {
    const roomId = await createRoom(ALICE);
    await join(BOB, roomId);

    const msgId = await send(ALICE, roomId, 'Vou apagar isso');

    await as(BOB, () => db.query('delete from messages where id = $1', [msgId]));
    assert.equal(
      Number((await one('select count(*) c from messages where id = $1', [msgId])).c),
      1,
    );

    await as(ALICE, () => db.query('delete from messages where id = $1', [msgId]));
    assert.equal(
      Number((await one('select count(*) c from messages where id = $1', [msgId])).c),
      0,
    );
  });

  it('o autor pode editar sua própria mensagem, mas outros não', async () => {
    const roomId = await createRoom(ALICE);
    await join(BOB, roomId);

    const msgId = await send(ALICE, roomId, 'Texto original');

    const bobResult = await as(BOB, () =>
      db.query("update messages set body = 'Hack', is_edited = true where id = $1", [
        msgId,
      ]),
    );
    assert.equal(bobResult.affectedRows ?? bobResult.rowCount ?? 0, 0);

    const checkMsg = await one('select body, is_edited from messages where id = $1', [
      msgId,
    ]);
    assert.equal(checkMsg.body, 'Texto original');
    assert.equal(checkMsg.is_edited, false);

    const aliceResult = await as(ALICE, () =>
      db.query(
        "update messages set body = 'Texto editado', is_edited = true where id = $1",
        [msgId],
      ),
    );
    assert.equal(aliceResult.affectedRows ?? aliceResult.rowCount ?? 0, 1);

    const editedMsg = await one('select body, is_edited from messages where id = $1', [
      msgId,
    ]);
    assert.equal(editedMsg.body, 'Texto editado');
    assert.equal(editedMsg.is_edited, true);
  });

  it('permite enviar e ler mensagem com imagem anexada', async () => {
    const roomId = await createRoom(ALICE);
    await join(BOB, roomId);

    const msgRow = await as(ALICE, () =>
      one(
        'insert into messages (room_id, body, image_url) values ($1, $2, $3) returning id, body, image_url',
        [roomId, 'Olha essa foto!', 'https://example.com/foto.jpg'],
      ),
    );

    assert.equal(msgRow.body, 'Olha essa foto!');
    assert.equal(msgRow.image_url, 'https://example.com/foto.jpg');

    const bobRead = await as(BOB, () =>
      one('select body, image_url from messages where id = $1', [msgRow.id]),
    );
    assert.equal(bobRead.image_url, 'https://example.com/foto.jpg');
  });

  it('visitante (anon) não lê nem escreve nada', async () => {
    const roomId = await createRoom(ALICE);
    await db.exec('set role anon');

    try {
      await assert.rejects(
        db.query('select * from messages where room_id = $1', [roomId]),
        /permission denied/,
      );
    } finally {
      await db.exec('reset role');
    }
  });
});

describe('reações (Apêndice C)', () => {
  it('membro pode adicionar e remover reações a uma mensagem', async () => {
    const roomId = await createRoom(ALICE);
    await join(BOB, roomId);
    const msgId = await send(ALICE, roomId, 'Mensagem legal');

    await as(BOB, () =>
      db.query(
        'insert into message_reactions (message_id, user_id, emoji) values ($1, $2, $3)',
        [msgId, BOB, '❤️'],
      ),
    );

    const reactions = await as(ALICE, () =>
      rows('select emoji, user_id from message_reactions where message_id = $1', [msgId]),
    );
    assert.equal(reactions.length, 1);
    assert.equal(reactions[0].emoji, '❤️');

    await assert.rejects(
      as(CARL, () =>
        db.query(
          'insert into message_reactions (message_id, user_id, emoji) values ($1, $2, $3)',
          [msgId, CARL, '👍'],
        ),
      ),
      /row-level security/,
    );

    await as(BOB, () =>
      db.query('delete from message_reactions where message_id = $1 and emoji = $2', [
        msgId,
        '❤️',
      ]),
    );

    const reactionsAfter = await as(ALICE, () =>
      rows('select id from message_reactions where message_id = $1', [msgId]),
    );
    assert.equal(reactionsAfter.length, 0);
  });
});

describe('confirmação de leitura (Apêndice C)', () => {
  it('membro pode marcar mensagem como lida e outros membros leem a confirmação', async () => {
    const roomId = await createRoom(ALICE);
    await join(BOB, roomId);
    const msgId = await send(ALICE, roomId, 'Você viu isso?');

    await as(BOB, () =>
      db.query('insert into message_reads (message_id, user_id) values ($1, $2)', [
        msgId,
        BOB,
      ]),
    );

    const reads = await as(ALICE, () =>
      rows('select user_id from message_reads where message_id = $1', [msgId]),
    );
    assert.equal(reads.length, 1);
    assert.equal(reads[0].user_id, BOB);

    await assert.rejects(
      as(CARL, () =>
        db.query('insert into message_reads (message_id, user_id) values ($1, $2)', [
          msgId,
          CARL,
        ]),
      ),
      /row-level security/,
    );
  });
});

describe('notificações push (Apêndice C)', () => {
  it('usuário registra, atualiza e deleta seu próprio token de push com proteção RLS', async () => {
    // Alice cadastra seu token
    await as(ALICE, () =>
      db.query('insert into user_push_tokens (user_id, push_token) values ($1, $2)', [
        ALICE,
        'ExponentPushToken[alice-token-123]',
      ]),
    );

    const aliceToken = await as(ALICE, () =>
      one('select push_token from user_push_tokens where user_id = $1', [ALICE]),
    );
    assert.equal(aliceToken.push_token, 'ExponentPushToken[alice-token-123]');

    // Bob não consegue ver nem alterar o token de Alice
    const bobViewAliceToken = await as(BOB, () =>
      rows('select push_token from user_push_tokens where user_id = $1', [ALICE]),
    );
    assert.equal(bobViewAliceToken.length, 0);

    const bobUpdateAlice = await as(BOB, () =>
      db.query(
        "update user_push_tokens set push_token = 'ExponentPushToken[hacked]' where user_id = $1",
        [ALICE],
      ),
    );
    assert.equal(bobUpdateAlice.affectedRows ?? bobUpdateAlice.rowCount ?? 0, 0);

    // Alice atualiza o próprio token
    await as(ALICE, () =>
      db.query(
        "update user_push_tokens set push_token = 'ExponentPushToken[alice-new-456]' where user_id = $1",
        [ALICE],
      ),
    );

    const aliceUpdated = await as(ALICE, () =>
      one('select push_token from user_push_tokens where user_id = $1', [ALICE]),
    );
    assert.equal(aliceUpdated.push_token, 'ExponentPushToken[alice-new-456]');

    // Alice apaga seu token
    await as(ALICE, () =>
      db.query('delete from user_push_tokens where user_id = $1', [ALICE]),
    );

    const aliceDeleted = await as(ALICE, () =>
      rows('select push_token from user_push_tokens where user_id = $1', [ALICE]),
    );
    assert.equal(aliceDeleted.length, 0);
  });
});
