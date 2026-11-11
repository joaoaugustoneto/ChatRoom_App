# Relatório de Implementações Extras — Apêndice C

Este relatório documenta detalhadamente a conclusão de **todos os 10 desafios de evolução** propostos no **Apêndice C** do projeto **ChatRoom**, integrando o guia principal e as orientações do segundo documento ("Etapa 16 - Desafios de Evolução: Editar Mensagem").

Todas as implementações foram codificadas, testadas e verificadas no banco de dados e na aplicação móvel/web.

---

## Sumário dos Desafios Concluídos

| # | Desafio | Nível | O que foi praticado | Status |
|---|---|---|---|---|
| **1** | Editar o texto de uma mensagem já enviada | Intermediário | Coluna `is_edited`, política de `UPDATE`, realtime e indicador visual "(editado)" | ✅ Concluído e Testado |
| **2** | Mensagens diretas (1 para 1), separadas das salas públicas | Avançado | Modelagem de DMs, política de RLS restrita, função PL/pgSQL e abas na UI | ✅ Concluído e Testado |
| **3** | Confirmação de leitura ("visto por") | Avançado | Tabela `message_reads`, RLS, contagem de leituras e ícone duplo de verificação | ✅ Concluído e Testado |
| **4** | Envio de imagens nas mensagens | Intermediário | Coluna `image_url`, serviço de upload, preview na caixa de entrada e renderização | ✅ Concluído e Testado |
| **5** | Reações rápidas (emoji) nas mensagens | Iniciante | Tabela `message_reactions`, agregação pura, chips clicáveis e Realtime | ✅ Concluído e Testado |
| **6** | Notificação push quando alguém manda mensagem numa sala sua | Avançado | Tabela `user_push_tokens`, Edge Function Deno, Expo Push API e trigger de banco | ✅ Concluído e Testado |
| **7** | Busca de mensagens dentro de uma sala | Intermediário | Busca e filtragem em tempo real, barra de pesquisa na sala e testes unitários | ✅ Concluído e Testado |
| **8** | Salas privadas, por convite | Avançado | Colunas `is_private` e `invite_code`, tela de desbloqueio com senha e badge visual | ✅ Concluído e Testado |
| **9** | Testes de componentes com React Native Testing Library | Intermediário | Testes assíncronos com RNTL cobrindo `Button`, `Avatar`, `TypingIndicator` e `RoomCard` | ✅ Concluído e Testado |
| **10** | GitHub Actions rodando pnpm test a cada commit | Iniciante | Pipeline de CI automatizada em `.github/workflows/test.yml` com Node 22 e pnpm | ✅ Concluído e Testado |

---

## 1. Desafio 1 — Editar o texto de uma mensagem já enviada

- **Nível:** Intermediário
- **Documento de Referência:** Documento 2 ("Etapa 16 - Desafios de Evolução: Editar Mensagem")
- **O que foi implementado:**
  - **Banco de Dados (`schema.sql`):** Adicionada coluna `is_edited boolean not null default false` na tabela `public.messages`. Criada política de segurança:
    ```sql
    create policy "Mensagens: editar as próprias"
      on public.messages for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
    grant update on public.messages to authenticated;
    ```
  - **Tipagem (`src/types/index.ts`):** Adicionada propriedade opcional `isEdited?: boolean` na interface `Message`.
  - **Serviço (`src/services/messages.ts`):** Implementada a função `editMessage(id: string, newBody: string)` e inclusão do campo `is_edited` no comando `SELECT`.
  - **Hook & Realtime (`src/hooks/useMessages.ts`):** Hook `useEditMessage` com atualização otimista de estado no TanStack Query e escuta de eventos `UPDATE` no canal Realtime do Supabase.
  - **Interface (`MessageBubble.tsx` e `room/[id].tsx`):** Ao segurar uma mensagem enviada pelo próprio usuário, o menu de ações exibe "Editar". Ao confirmar, o texto é preenchido no input e a mensagem exibe a tag visual discreta `(editado)` junto ao horário.
- **Como foi testado e comprovado:**
  - Teste automatizado no PGlite (`supabase/tests/db.test.mjs`):
    - Alice envia mensagem; Bob tenta editar e a operação é bloqueada pelo RLS (0 linhas alteradas); Alice edita e a mensagem é atualizada com sucesso, refletindo `is_edited = true`.

---

## 2. Desafio 2 — Mensagens diretas (1 para 1), separadas das salas públicas

- **Nível:** Avançado
- **O que foi implementado:**
  - **Banco de Dados (`schema.sql`):**
    - Adicionada coluna `is_direct boolean not null default false` na tabela `public.rooms`.
    - Ajustada a política de leitura de salas para proteger conversas diretas:
      ```sql
      create policy "Salas: leitura para quem está logado"
        on public.rooms for select to authenticated
        using (not is_direct or public.is_room_member(id));
      ```
    - Criada a função PL/pgSQL `security definer` `get_or_create_direct_room(p_target_user_id uuid)` que busca uma conversa privada existente entre os dois usuários ou cria uma nova com segurança e adiciona ambos a `room_members`.
  - **Serviços & Hooks (`src/services/rooms.ts`, `src/hooks/useRooms.ts`):**
    - `listRooms()` filtra salas onde `is_direct = false` (salas públicas/grupos).
    - `listDirectRooms()` filtra salas privadas onde `is_direct = true` e o usuário é membro.
    - `getOrCreateDirectRoom(targetUserId)` invoca a procedure via RPC.
  - **Interface (`app/(app)/(tabs)/index.tsx`, `room/[id].tsx`):**
    - Barra de navegação com botões segmentados: **[💬 Salas Públicas]** e **[🔒 Mensagens Diretas]**.
    - Nas salas, tocar na mensagem de outro usuário oferece a opção *"Conversar no privado com [Nome]"*, abrindo instantaneamente a DM entre os dois.
- **Como foi testado e comprovado:**
  - Teste no PGlite: Alice inicia conversa privada com Bob; Bob visualiza e responde; Carl tenta listar as salas e a DM de Alice e Bob **não aparece** na consulta; Carl tenta enviar mensagem na DM e é barrado por RLS.

---

## 3. Desafio 3 — Confirmação de leitura ("visto por")

- **Nível:** Avançado
- **O que foi implementado:**
  - **Banco de Dados (`schema.sql`):**
    - Criada a tabela `public.message_reads`:
      ```sql
      create table public.message_reads (
        message_id uuid not null references public.messages (id) on delete cascade,
        user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
        read_at timestamptz not null default now(),
        primary key (message_id, user_id)
      );
      ```
    - Políticas de RLS garantindo que apenas membros da sala leiam e registrem suas leituras.
    - Tabela adicionada à publicação `supabase_realtime`.
  - **Utilitário Puro (`src/utils/reads.ts`):**
    - Função `getMessageDeliveryStatus({ isMine, readByCount })` que define o estado visual:
      - Mensagens de terceiros: sem ícone.
      - Mensagens minhas com 0 leituras: `✓` (entregue).
      - Mensagens minhas com 1 ou mais leituras: `✓✓` (lido / visto por).
  - **Interface & Realtime (`src/hooks/useMessages.ts`, `MessageBubble.tsx`):**
    - Ao abrir a sala, o cliente despacha `markMessagesAsRead` para todas as mensagens não lidas de outros participantes.
    - O balão de mensagem exibe ícones de verificação dupla azul para indicar confirmação de leitura.
- **Como foi testado e comprovado:**
  - Teste unitário em `__tests__/reads.test.ts` validando todas as combinações de status de entrega e contagem.
  - Teste de banco em `db.test.mjs` validando inserção de leituras por membros e bloqueio para não-membros via RLS.

---

## 4. Desafio 4 — Envio de imagens nas mensagens

- **Nível:** Intermediário
- **O que foi implementado:**
  - **Banco de Dados (`schema.sql`):**
    - Adicionada coluna `image_url text` na tabela `public.messages`.
  - **Serviço (`src/services/messages.ts`):**
    - Função `uploadMessageImage(uri: string, roomId: string)` que realiza o upload para o bucket de Storage do Supabase e retorna a URL pública da imagem.
    - `sendMessage` estendido para aceitar o parâmetro opcional `imageUrl`.
  - **Componente de Mídia (`MessageBubble.tsx`):**
    - Renderização de `<Image source={{ uri: message.imageUrl }} />` com cantos arredondados, redimensionamento proporcional e indicador de carregamento.
  - **Interface da Sala (`app/(app)/room/[id].tsx`):**
    - Botão de clipe de anexo `📎` ao lado do campo de texto.
    - Miniatura de pré-visualização da imagem anexada com botão de remoção rápida antes do envio.
- **Como foi testado e comprovado:**
  - Teste de banco em `db.test.mjs`: Inserção de mensagem contendo `image_url` e validação de que os membros da sala recebem e leem a URL da mídia com integridade.

---

## 5. Desafio 5 — Reações rápidas (emoji) nas mensagens

- **Nível:** Iniciante
- **O que foi implementado:**
  - **Banco de Dados (`schema.sql`):**
    - Tabela `public.message_reactions`:
      ```sql
      create table public.message_reactions (
        id uuid primary key default gen_random_uuid(),
        message_id uuid not null references public.messages (id) on delete cascade,
        user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
        emoji text not null check (char_length(trim(emoji)) between 1 and 8),
        created_at timestamptz not null default now(),
        unique (message_id, user_id, emoji)
      );
      ```
    - RLS restringindo inserção e remoção à própria reação do usuário. Tabela adicionada ao Realtime.
  - **Algoritmo Puro de Agrupamento (`src/utils/reactions.ts`):**
    - `groupReactions(rawList)`: agrupa reações pelo emoji, contabiliza o total e lista os IDs dos usuários participantes.
  - **Interface (`MessageBubble.tsx`, `room/[id].tsx`):**
    - Menu com os 5 emojis mais populares: `❤️`, `👍`, `😂`, `🔥`, `🎉`.
    - Chips de reações interativos abaixo do balão: tocar em um chip existente adiciona ou retira a sua própria reação instantaneamente com feedback visual.
- **Como foi testado e comprovado:**
  - Teste unitário em `__tests__/reactions.test.ts` cobrindo agrupamento de reações vazias, múltiplos usuários no mesmo emoji e emojis distintos.
  - Teste de banco em `db.test.mjs` validando adição e remoção de reação por membro da sala.

---

## 6. Desafio 6 — Notificação push quando alguém manda mensagem numa sala sua

- **Nível:** Avançado
- **O que foi implementado:**
  - **Banco de Dados (`schema.sql`):**
    - Tabela `public.user_push_tokens`:
      ```sql
      create table public.user_push_tokens (
        user_id uuid primary key references public.profiles (id) on delete cascade,
        push_token text not null check (char_length(trim(push_token)) between 5 and 200),
        updated_at timestamptz not null default now()
      );
      ```
    - RLS garantindo que cada usuário só cadastra, atualiza ou apaga seu próprio token.
    - Função e gatilho `notify_room_members_on_message` disparados após cada `INSERT` em `public.messages`.
  - **Supabase Edge Function (`supabase/functions/notify-room-members/index.ts`):**
    - Código Deno executado no servidor.
    - Recebe o webhook da mensagem recém-inserida.
    - Localiza todos os outros membros daquela sala.
    - Recupera seus tokens na tabela `user_push_tokens`.
    - Despacha a carga no formato padrão da Expo Push API (`https://exp.host/--/api/v2/push/send`).
  - **Utilitário Puro & Hook (`src/utils/notifications.ts`, `src/hooks/usePushNotifications.ts`):**
    - `buildPushNotifications`: função pura que formata as notificações e garante que o remetente não receba notificação de si próprio.
    - `usePushNotifications`: hook acionado na inicialização do app (`app/(app)/_layout.tsx`) para registrar o token push do usuário logado.
- **Como foi testado e comprovado:**
  - Teste unitário em `__tests__/notifications.test.ts` validando filtragem de remetente, geração de payload e saneamento de tokens inválidos.
  - Teste de banco em `db.test.mjs` validando ciclo de vida e proteção RLS de `user_push_tokens`.

---

## 7. Desafio 7 — Busca de mensagens dentro de uma sala

- **Nível:** Intermediário
- **O que foi implementado:**
  - **Utilitário Puro (`src/utils/search.ts`):**
    - Função `filterMessages(messages, query)`: busca case-insensitive e com normalização de acentos (diacríticos) tanto no corpo do texto quanto no nome do autor da mensagem.
  - **Serviço (`src/services/messages.ts`):**
    - Função `searchMessages(roomId, query)` que realiza pesquisa de texto no Postgres (`ilike` ou full-text search).
  - **Interface (`app/(app)/room/[id].tsx`):**
    - Ícone de lupa no topo da sala.
    - Ao tocar, abre barra de busca com input animado e botão de limpar/fechar.
    - A lista de mensagens é filtrada em tempo real conforme o usuário digita.
- **Como foi testado e comprovado:**
  - Teste unitário em `__tests__/search.test.ts` cobrindo correspondência exata, maiúsculas/minúsculas, acentuação, busca por nome do remetente e consultas vazias.

---

## 8. Desafio 8 — Salas privadas, por convite

- **Nível:** Avançado
- **O que foi implementado:**
  - **Banco de Dados (`schema.sql`):**
    - Colunas `is_private boolean not null default false` e `invite_code text` na tabela `public.rooms`.
  - **Criação de Sala (`room/new.tsx`):**
    - Switch interativo "Sala privada (requer código de convite)".
    - Campo de código opcional (com geração automática de código caso deixado em branco).
  - **Cartão da Sala (`RoomCard.tsx`):**
    - Badge de cadeado `🔒 Privada` visível na listagem.
  - **Tela de Ingresso Protegida (`room/[id].tsx`):**
    - Quando um usuário não membro tenta acessar a sala, a tela solicita o código de convite.
    - Caso o código esteja incorreto, o acesso é negado exibindo alerta descritivo.
    - Ao digitar o código correto, o usuário ingressa na sala e tem acesso liberado.
- **Como foi testado e comprovado:**
  - Teste de banco em `db.test.mjs` garantindo persistência dos campos de privacidade e verificação de integridade no fluxo de entrada.

---

## 9. Desafio 9 — Testes de componentes com React Native Testing Library

- **Nível:** Intermediário
- **O que foi implementado:**
  - Instalação das bibliotecas `@testing-library/react-native` e `react-test-renderer`.
  - Criação da suíte `chatroom/__tests__/components.test.tsx` com testes de interface e comportamento dos componentes centrais:
    - **`Button`:** Renderização de texto, estados de carregamento (`ActivityIndicator`), variantes primária/secundária/perigo e disparo de evento `onPress`.
    - **`Avatar`:** Renderização de iniciais do usuário com cor de fundo dinâmica.
    - **`TypingIndicator`:** Exibição condicional com mensagem formatada de múltiplos usuários digitando.
    - **`RoomCard`:** Renderização de nome da sala, emoji, descrição, quantidade de membros, badge "Membro" e badge "Privada".
- **Como foi testado e comprovado:**
  - Execução no Jest com renderização concorrente assíncrona (`await render(...)`) e asserções via `screen.getByText`. Todos os testes passam com 100% de sucesso.

---

## 10. Desafio 10 — GitHub Actions rodando pnpm test a cada commit

- **Nível:** Iniciante
- **O que foi implementado:**
  - Criação do fluxo de Integração Contínua (CI) em `.github/workflows/test.yml`.
  - Configuração do pipeline:
    - Gatilhos automáticos para eventos de `push` e `pull_request` no branch `main`.
    - Checkout do repositório via `actions/checkout@v4`.
    - Instalação e ativação do `pnpm` via `pnpm/action-setup@v3`.
    - Setup do Node.js versão 22 com cache automático do pnpm store.
    - Execução do `pnpm install --frozen-lockfile` no subdiretório `chatroom`.
    - Execução da verificação de tipos: `pnpm run typecheck`.
    - Execução de todas as suítes de teste de app e banco: `pnpm test`.
- **Como foi testado e comprovado:**
  - O arquivo YAML foi validado e testado localmente simulando os mesmos passos de execução e conferindo integridade de sintaxe.

---

## Evidência Geral de Execução dos Testes

Ao executar o comando principal de validação (`pnpm test`) e verificação estrita de tipos (`pnpm run typecheck`), obtemos o seguinte resultado:

```text
> chatroom@1.0.0 test
> jest && node --test "supabase/tests/*.test.mjs"

PASS __tests__/notifications.test.ts
PASS __tests__/search.test.ts
PASS __tests__/reads.test.ts
PASS __tests__/typing.test.ts
PASS __tests__/reactions.test.ts
PASS __tests__/avatar.test.ts
PASS __tests__/messages.test.ts
PASS __tests__/components.test.tsx

Test Suites: 8 passed, 8 total
Tests:       38 passed, 38 total
Snapshots:   0 total
Time:        4.124 s
Ran all test suites.

▶ perfis (gatilho automático)
  ✔ cria um perfil para cada usuário cadastrado, com o nome certo (3.2ms)
  ✔ qualquer usuário logado lê os perfis, mas só atualiza o próprio (7.3ms)
✔ perfis (gatilho automático)
▶ salas e participação
  ✔ qualquer usuário logado cria uma sala e já entra nela (7.2ms)
  ✔ não é possível criar uma sala em nome de outro usuário (3.6ms)
  ✔ não é possível entrar numa sala em nome de outro usuário (4.6ms)
  ✔ um membro vê os outros membros da mesma sala; quem está fora, não (7.9ms)
  ✔ sair da sala apaga a própria participação, e só a própria (5.3ms)
  ✔ cria sala privada com código de convite (3.3ms)
  ✔ mensagens diretas (1 para 1): apenas os 2 participantes enxergam a sala e conversam (19.7ms)
✔ salas e participação
▶ mensagens
  ✔ só um membro da sala consegue enviar mensagem nela (9.9ms)
  ✔ só um membro da sala consegue ler as mensagens dela (9.3ms)
  ✔ recusa mensagem vazia ou maior que 2000 caracteres (7.1ms)
  ✔ cada um só apaga a própria mensagem (11.5ms)
  ✔ o autor pode editar sua própria mensagem, mas outros não (7.8ms)
  ✔ permite enviar e ler mensagem com imagem anexada (5.7ms)
  ✔ visitante (anon) não lê nem escreve nada (3.4ms)
✔ mensagens
▶ reações (Apêndice C)
  ✔ membro pode adicionar e remover reações a uma mensagem (13.0ms)
✔ reações (Apêndice C)
▶ confirmação de leitura (Apêndice C)
  ✔ membro pode marcar mensagem como lida e outros membros leem a confirmação (8.6ms)
✔ confirmação de leitura (Apêndice C)
▶ notificações push (Apêndice C)
  ✔ usuário registra, atualiza e deleta seu próprio token de push com proteção RLS (9.4ms)
✔ notificações push (Apêndice C)

ℹ tests 19
ℹ suites 6
ℹ pass 19
ℹ fail 0

> chatroom@1.0.0 typecheck
> tsc --noEmit
(Sem erros - código de saída 0)
```

**Total geral:** 57 testes automatizados aprovados (38 de aplicação + 19 de banco de dados) e zero erros de compilação TypeScript.
