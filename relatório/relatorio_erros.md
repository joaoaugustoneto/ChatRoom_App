# Relatório de Erros e Soluções do Projeto ChatRoom

Este documento detalha todos os erros identificados durante a análise e implementação passo a passo do aplicativo **ChatRoom**, conforme as instruções do guia e requisitos de qualidade.

---

## 1. Erro de Execução no Jest com Testes ESM do PGlite (`supabase/tests/db.test.mjs`)

- **Etapa Relacionada:** Etapa 2 / Etapa 4 / Etapa 14
- **Arquivo Afetado:** `chatroom/package.json`
- **Sintoma / Mensagem de Erro:**
  ```text
  FAIL supabase/tests/db.test.mjs
    ● Test suite failed to run
      Must use import to load ES Module: .../supabase/tests/db.test.mjs
      The file contains ESM syntax (import/export) that could not be executed as CommonJS.
  ```
- **Causa Raiz:** O script `test` e o comando `jest` buscavam todos os arquivos de teste no repositório por padrão, incluindo os arquivos dentro de `supabase/tests/`. Porém, `db.test.mjs` foi escrito em ESM puro utilizando a biblioteca `@electric-sql/pglite` e os módulos nativos do Node (`node:test` e `node:assert/strict`), feitos especificamente para serem executados pelo test runner nativo do Node (`node --test`).
- **Solução Aplicada:**
  Configurado o campo `"jest"` em `chatroom/package.json` adicionando explicitamente a propriedade `testMatch`:
  ```json
  "jest": {
    "preset": "jest-expo",
    "testMatch": [
      "<rootDir>/__tests__/**/*.test.[jt]s?(x)"
    ],
    "moduleNameMapper": {
      "^@/(.*)$": "<rootDir>/src/$1"
    }
  }
  ```
  Com isso, o Jest passa a rodar exclusivamente os testes de componentes/utilitários da pasta `__tests__/`, enquanto os testes do banco rodam isoladamente pelo comando `pnpm run test:db`. Ambos são orquestrados com sucesso no `pnpm test`.

---

## 2. Incompatibilidade de Tipos com `ColorValue` no Ícone das Abas (`tabIcon`)

- **Etapa Relacionada:** Etapa 10 (Código 45)
- **Arquivo Afetado:** `chatroom/app/(app)/(tabs)/_layout.tsx`
- **Sintoma / Mensagem de Erro:**
  ```text
  app/(app)/(tabs)/_layout.tsx(9,39): error TS2322: Type '____ColorValue_Internal' is not assignable to type 'string | NativeColorValue | undefined'.
    Type 'null' is not assignable to type 'string | NativeColorValue | undefined'.
  ```
- **Causa Raiz:** No React Native moderno e Expo Router, os tipos de retorno das propriedades de renderização de ícones de abas transmitem `ColorValue` (que aceita `null` internamente), ao passo que a tipagem das propriedades de `@expo/vector-icons` (`Ionicons`) exige `string | undefined`.
- **Solução Aplicada:**
  Realizado o cast seguro de tipo no componente:
  ```tsx
  function tabIcon(name: IconName) {
    return ({ color, size }: { color: ColorValue; size: number }) => (
      <Ionicons name={name} size={size} color={color as string} />
    );
  }
  ```
  Isso resolveu completamente o erro no `tsc --noEmit` sem alterar o comportamento em tempo de execução.

---

## 3. Arquivos Residuais do Template Padrão (`App.tsx` e `index.ts`)

- **Etapa Relacionada:** Etapa 2.1
- **Arquivos Afetados:** `chatroom/App.tsx` e `chatroom/index.ts`
- **Sintoma:** Conflito em potencial de entrypoint do Expo Router e não conformidade com a estrutura do Apêndice A.
- **Causa Raiz:** Ao inicializar com o template TypeScript básico do Expo, os arquivos `App.tsx` e `index.ts` foram gerados e comitados na Etapa 2, em vez de serem excluídos conforme orientado na seção 2.1 do guia.
- **Solução Aplicada:**
  Arquivos removidos do versionamento com `git rm chatroom/App.tsx chatroom/index.ts`, garantindo que o entrypoint seja unicamente gerenciado pelo Expo Router através de `chatroom/app/`.

---

## 4. Tipagem Incompatível de `onRefresh` no `RefreshControl` com `refetch` do TanStack Query

- **Etapa Relacionada:** Etapa 11 (Código 46)
- **Arquivo Afetado:** `chatroom/app/(app)/(tabs)/index.tsx`
- **Sintoma / Mensagem de Erro:**
  ```text
  app/(app)/(tabs)/index.tsx(58,13): error TS2769: No overload matches this call.
    Overload 1 of 2, '(props: RefreshControlProps): RefreshControl', gave the following error.
      Type '(options?: RefetchOptions | undefined) => Promise<QueryObserverResult<Room[], Error>>' is not assignable to type '() => void | Promise<void>'.
  ```
- **Causa Raiz:** A função `refetch` do hook retornado pelo TanStack Query devolve uma `Promise<QueryObserverResult<...>>`. Já a propriedade `onRefresh` de `RefreshControl` (React Native) exige assinatura compatível com `() => void | Promise<void>`.
- **Solução Aplicada:**
  Ajustada a chamada da propriedade para encapsular a execução em void:
  ```tsx
  <RefreshControl
    refreshing={isRefetching}
    onRefresh={() => void refetch()}
    tintColor={colors.primary}
  />
  ```
  Permitindo compilação estrita sem erros de tipo.

---

## 5. Chamada Síncrona do `render` na v14 da React Native Testing Library com React 19

- **Etapa Relacionada:** Desafio 9 do Apêndice C (Testes de Componentes com RNTL)
- **Arquivo Afetado:** `chatroom/__tests__/components.test.tsx`
- **Sintoma / Mensagem de Erro:**
  ```text
  TypeError: getByText is not a function / The `render` function has not been called or returned a Promise.
  ```
- **Causa Raiz:** A partir da versão 14 da `@testing-library/react-native` em conjunto com o React 19 / React Native 0.88, a função `render()` passou a ser assíncrona por encapsular `React.act()` de forma concorrente. Executar `render(<Button ... />)` de forma síncrona sem `await` impedia a resolução das consultas do `screen`.
- **Solução Aplicada:**
  Todas as funções de teste de componentes foram refatoradas para funções assíncronas utilizando `await render(...)` e consultas diretas no objeto `screen` (`screen.getByText`, `screen.getByPlaceholderText`, `screen.getByTestId`):
  ```tsx
  it('renderiza o título e executa onPress', async () => {
    const onPress = jest.fn();
    await render(<Button title="Entrar" onPress={onPress} />);
    fireEvent.press(screen.getByText('Entrar'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  ```
  Resultando na aprovação total dos testes com feedback instantâneo.

---

## 6. Conflito de Tipagem entre Supabase Edge Functions (Deno Runtime) e TypeScript do Expo

- **Etapa Relacionada:** Desafio 6 do Apêndice C (Notificações Push com Edge Function)
- **Arquivo Afetado:** `chatroom/tsconfig.json` e `chatroom/supabase/functions/notify-room-members/index.ts`
- **Sintoma / Mensagem de Erro:**
  ```text
  supabase/functions/notify-room-members/index.ts: error TS2307: Cannot find module 'jsr:@supabase/supabase-js@2'.
  supabase/functions/notify-room-members/index.ts: error TS2304: Cannot find name 'Deno'.
  ```
- **Causa Raiz:** O TypeScript do projeto React Native (Expo) possui configuração padrão `"include": ["**/*.ts", "**/*.tsx"]`. Isso fazia com que o `tsc --noEmit` do app tentasse compilar a Edge Function, que foi projetada especificamente para o runtime Deno do Supabase (onde `Deno` e `jsr:` são nativos).
- **Solução Aplicada:**
  Adicionada a seção `"exclude"` no `chatroom/tsconfig.json`:
  ```json
  "exclude": [
    "supabase/functions"
  ]
  ```
  Com isso, o compilador do aplicativo foca nos arquivos de runtime mobile e web, mantendo as Edge Functions com sua infraestrutura Deno intacta.

---

## 7. Propriedade de Estilo Inexistente `colors.card`

- **Etapa Relacionada:** Desafio 2 do Apêndice C (Interface de Mensagens Diretas e Abas)
- **Arquivo Afetado:** `chatroom/app/(app)/(tabs)/index.tsx`
- **Sintoma / Mensagem de Erro:**
  ```text
  app/(app)/(tabs)/index.tsx: error TS2339: Property 'card' does not exist on type '{ primary: ...; surface: string; ... }'
  ```
- **Causa Raiz:** Ao estilizar a barra de alternância entre "Salas Públicas" e "Mensagens Diretas", foi referenciada a propriedade `colors.card`, enquanto a paleta central do projeto em `src/theme/index.ts` padroniza o fundo de cartões e superfícies como `colors.surface` (`#FFFFFF`).
- **Solução Aplicada:**
  Substituído `colors.card` por `colors.surface` e aplicado `#EEF2F6` no fundo do container das abas para contraste visual otimizado.

---

## 8. Falha na Criação de Salas (`POST /rooms 409 Conflict`) decorrente de Perfil Inexistente (`GET /profiles 406 Not Acceptable`)

- **Etapa Relacionada:** Etapa 11 (Criação de Salas) / Produção Supabase
- **Arquivos Afetados:** `chatroom/src/services/profile.ts`, `chatroom/src/services/rooms.ts`, `chatroom/app/(app)/room/new.tsx`, `chatroom/supabase/schema.sql`
- **Sintomas / Mensagens de Erro no Console DevTools:**
  ```text
  GET https://...supabase.co/rest/v1/profiles?select=id,username,avatar_color... 406 (Not Acceptable)
  POST https://...supabase.co/rest/v1/rooms?select=id 409 (Conflict)
  ```
- **Causa Raiz:**
  1. A tabela `public.rooms` possui a restrição de chave estrangeira: `created_by uuid not null references public.profiles (id)`.
  2. Caso o usuário logado tenha sido registrado antes da execução do gatilho `on_auth_user_created`, ou o gatilho não tenha sido disparado para contas pré-existentes, o usuário autenticado não possui registro correspondente na tabela `public.profiles`.
  3. A consulta `getProfile(userId)` utilizava `.single()`, que resulta em erro HTTP 406 (código PostgREST `PGRST116`) ao receber 0 linhas.
  4. Subsequentemente, o comando `insert into rooms (...)` viola a chave estrangeira `rooms_created_by_fkey`, resultando no erro HTTP 409 (Conflict). No ambiente Web, como `Alert.alert` não renderiza modal nativo, a falha ficava silenciosa para o usuário na interface.
- **Solução Aplicada:**
  1. **Auto-recuperação (Self-healing) no Serviço de Perfil (`src/services/profile.ts`):** Substituído `.single()` por `.maybeSingle()`. Se o perfil não for encontrado, o serviço recupera os metadados do usuário via `supabase.auth.getUser()` e insere/restaura automaticamente a linha em `public.profiles`.
  2. **Garantia de Pré-requisito na Criação de Salas (`src/services/rooms.ts`):** Invocação prévia de `await getProfile(userId)` antes de despachar o insert de `rooms`.
  3. **Permissão RLS e Migração Idempotente (`supabase/schema.sql`):** Adicionada política `Perfis: inserir próprio perfil` (`for insert to authenticated with check (auth.uid() = id)`) e script de inserção para todos os usuários órfãos em `auth.users`.
  4. **Feedback Visual Explícito na Interface (`room/new.tsx`):** Adicionado estado `formError` com renderização de texto de erro em vermelho logo acima do botão "Criar sala", garantindo que mensagens de erro sejam imediatamente visíveis tanto em dispositivos móveis quanto no navegador Web.

---

## 9. Comportamento de Edição e Caret no Navegador Web (Caret Browsing e Seleção de UI)

- **Etapa Relacionada:** Ambiente Web / React Native Web
- **Arquivo Afetado:** `chatroom/app/_layout.tsx`
- **Sintoma:** Ao clicar em textos informativos da interface (como o subtítulo "Converse em tempo real, em salas" na tela de login), um cursor vertical de digitação (`|`) aparecia como se o texto estivesse em modo de edição.
- **Causa Raiz:**
  1. No ambiente Web, componentes `<Text>` do React Native Web são renderizados como elementos `<div>` HTML com seleção padrão.
  2. Em navegadores Chromium (Chrome / Edge), pressionar acidentalmente a tecla **F7** ativa a funcionalidade de acessibilidade **Caret Browsing** ("Navegação por cursor"), que insere um cursor piscante em qualquer elemento de texto que o usuário clica.
- **Solução Aplicada:**
  1. Injetado estilo global na inicialização do aplicativo web em `chatroom/app/_layout.tsx`:
     ```css
     * {
       -webkit-user-select: none;
       user-select: none;
       -webkit-touch-callout: none;
     }
     input, textarea, [contenteditable="true"] {
       -webkit-user-select: text !important;
       user-select: text !important;
       cursor: text !important;
     }
     a, button, [role="button"] {
       cursor: pointer !important;
     }
     ```
     Isso padroniza a interface com o comportamento nativo de aplicativo móvel, eliminando seleção indesejada e cursores em textos de UI.
  2. Orientação para desativar a tecla de atalho **F7** do navegador caso o usuário tenha ativado o Caret Browsing nativo do Chrome/Edge.

---

## 10. Falha no Envio de Mensagens por Relação Múltipla (`Could not embed because more than one relationship was found for 'messages' and 'profiles'`)

- **Etapa Relacionada:** Etapa 12 / Desafios do Apêndice C
- **Arquivos Afetados:** `chatroom/src/services/messages.ts`, `chatroom/src/services/rooms.ts`, `chatroom/src/hooks/useMessages.ts`, `chatroom/app/(app)/room/[id].tsx`
- **Sintoma / Mensagem de Erro:**
  ```text
  Não foi possível enviar: Could not embed because more than one relationship was found for 'messages' and 'profiles'
  ```
- **Causa Raiz:**
  1. No banco de dados Supabase (PostgreSQL), quando existem múltiplas restrições de chave estrangeira entre duas tabelas (por exemplo, `messages_user_id_fkey` e outra chave estrangeira para `profiles` criada acidentalmente por migrações sucessivas ou scripts repetidos), o PostgREST não consegue inferir automaticamente qual relacionamento utilizar na cláusula `profiles(...)`.
  2. A função `sendMessage` tentava executar o `insert` encadeado com `.select(SELECT).single()`, exigindo a resolução de joins relacionais imediatos de `profiles`. Como o PostgREST recusava o embedding por ambiguidade, a inserção falhava com o alerta visualizado na tela.
  3. Além disso, as funções `listMessages`, `getMessage` e `listRoomMembers` também ficavam sujeitas à mesma recusa caso o PostgREST não recebesse a indicação explícita da coluna de chave estrangeira.
- **Solução Aplicada:**
  1. **Separação Estrita de Inserção e Leitura:** A função `sendMessage` foi atualizada para selecionar apenas as colunas escalares da própria tabela `messages` (`id, room_id, user_id, body, created_at`) durante o `insert(...)`, sem tentar joins relacionais no momento da escrita. Como o perfil do autor (`username` e `avatarColor`) já é conhecido via sessão e cache, o objeto `Message` é montado e retornado imediatamente com 100% de confiabilidade.
  2. **Desambiguação Explícita de Chave Estrangeira:** As consultas de leitura foram configuradas com a sintaxe explícita do PostgREST: `profiles!user_id(username, avatar_color)`.
  3. **Auto-população com Resiliência em Camadas:** Caso qualquer restrição no banco falhe, foi criada a função `populateProfilesForRows()`, que busca os registros puros da tabela `messages` e preenche os perfis dos autores consultando os `user_id`s diretamente na tabela `profiles`.
  4. **Correção Análoga em Membros da Sala:** A função `listRoomMembers` em `src/services/rooms.ts` recebeu a mesma desambiguação e fallback sem embedding relacional.

---

## 11. Falha na Confirmação de Cadastro via Link de E-mail

- **Etapa Relacionada:** Etapa 10 (Autenticação e Cadastro)
- **Arquivos Afetados:** `chatroom/src/context/AuthContext.tsx`, `chatroom/app/(auth)/register.tsx`
- **Sintoma:** Ao receber o e-mail de confirmação do Supabase e clicar no botão/link de verificação, a página não abre ou exibe erro de conexão recusada (`ERR_CONNECTION_REFUSED` em `http://localhost:3000`).
- **Causa Raiz:**
  1. Por padrão, projetos recém-criados no painel do Supabase possuem a URL do site (`Site URL`) configurada para `http://localhost:3000`.
  2. O servidor de desenvolvimento do Expo Web roda na porta `8081` (`http://localhost:8081`), e o aplicativo móvel utiliza esquemas de deep link (`chatroom://` ou `exp://`).
  3. A função `supabase.auth.signUp` não enviava a propriedade `emailRedirectTo`, fazendo com que o Supabase redirecionasse para o host padrão inexistente.
- **Solução Aplicada:**
  1. Configurado o parâmetro `emailRedirectTo` na chamada de cadastro do `AuthContext`:
     - No navegador web: utiliza dinamicamente `window.location.origin` (por exemplo, `http://localhost:8081`).
     - No mobile nativo: utiliza `Linking.createURL('/')` (esquema `chatroom://`).
  2. Configurado o ouvinte `Linking.addEventListener('url', ...)` no `AuthContext` para capturar retornos profundos com código PKCE ou tokens e autenticar automaticamente a sessão.
  3. Orientação no guia para adicionar `http://localhost:8081` nas *Redirect URLs* no painel do Supabase (`Authentication -> URL Configuration`), ou alternativamente desmarcar a opção *Confirm email* em `Authentication -> Providers -> Email` durante o desenvolvimento local.

---

## 12. Impossibilidade de Encerrar a Sessão (Sair da Conta) no Navegador Web e em Erros de Conexão

- **Etapa Relacionada:** Etapa 13 (Perfil e Logout)
- **Arquivos Afetados:** `chatroom/app/(app)/(tabs)/profile.tsx`, `chatroom/src/context/AuthContext.tsx`
- **Sintoma:** O usuário clica em "Sair da conta" na aba de Perfil, confirma a ação ou clica no botão, mas nada acontece e a conta continua logada.
- **Causa Raiz:**
  1. A implementação padrão do React Native Web para `Alert.alert(title, msg, buttons)` delega a chamada para o método nativo `window.alert()`, descartando completamente o vetor de botões com as ações de callback `onPress`. Dessa forma, o comando de saída nunca era executado no navegador.
  2. Caso o endpoint remoto do Supabase falhasse ou a conexão com a internet estivesse instável, a promessa de `supabase.auth.signOut()` lançava uma exceção não tratada, impedindo a limpeza do estado local de sessão.
- **Solução Aplicada:**
  1. Em `chatroom/app/(app)/(tabs)/profile.tsx`, adicionada verificação para `Platform.OS === 'web'` utilizando `window.confirm('Deseja encerrar a sessão?')`. Ao confirmar, a função `signOut()` é disparada de imediato.
  2. Em `chatroom/src/context/AuthContext.tsx`, encapsulada a rotina de logout em um bloco `try / finally`. Mesmo se a chamada remota falhar ou o token de acesso já estiver expirado no servidor, o estado local `setSession(null)` e a limpeza de cache `queryClient.clear()` são executados com garantia no bloco `finally`, forçando o redirecionamento imediato para a tela de login.

---

## 13. Impossibilidade de Atualizar o Nome de Usuário (Perfil)

- **Etapa Relacionada:** Etapa 13 (Perfil do Usuário)
- **Arquivos Afetados:** `chatroom/src/services/profile.ts`, `chatroom/src/hooks/useMyProfile.ts`, `chatroom/app/(app)/(tabs)/profile.tsx`
- **Sintoma:** Ao editar o nome no perfil e salvar, a alteração não persistia ou exibia erro de permissão.
- **Causa Raiz:**
  1. O método `updateUsername` utilizava apenas `supabase.from('profiles').update({ username }).eq('id', userId)`. Se a linha do usuário em `profiles` não existisse (por exemplo, conta criada antes da criação do gatilho), o comando `UPDATE` não afetava nenhuma linha silenciosamente.
  2. Os metadados de autenticação da conta (`raw_user_meta_data.username` e `full_name`) não estavam sincronizados com o Supabase Auth.
- **Solução Aplicada:**
  1. Em `src/services/profile.ts`, a função `updateUsername` sincroniza primeiro os metadados do usuário em `supabase.auth.updateUser({ data: { full_name: username, username } })`.
  2. Em seguida, tenta o `UPDATE` na tabela `profiles`. Caso não exista linha afetada, aciona o `upsert` com auto-recuperação do perfil.
  3. No hook `useMyProfile.ts`, adicionada atualização otimista instantânea no cache do React Query (`queryClient.setQueryData`), refletindo o novo nome na interface no mesmo milissegundo em que o usuário clica em "Salvar".
  4. Suporte a feedback na Web com `window.alert` para avisos de validação (mínimo de 2 caracteres).

---

## 14. Sobreposição da Interface sob os Botões do Celular (Problema de Responsividade e Safe Area)

- **Etapa Relacionada:** Responsividade em Dispositivos Móveis (Android / iOS)
- **Arquivos Afetados:** `chatroom/src/components/Screen.tsx`, `chatroom/app/(app)/(tabs)/_layout.tsx`, `chatroom/app/(app)/(tabs)/index.tsx`, `chatroom/app/(app)/room/[id].tsx`
- **Sintoma:** No celular Android ou iOS moderno, os elementos da parte inferior da tela (como a barra de abas "Salas / Perfil", o botão flutuante '+' e a caixa de digitação de mensagens) ficavam cortados ou escondidos atrás da barra de navegação do sistema (botões virtuais de Voltar/Home ou barra de gestos).
- **Causa Raiz:**
  1. O componente `Screen.tsx` definia `edges = ['top', 'left', 'right']`, omitindo intencionalmente a borda `'bottom'` do `SafeAreaView`.
  2. No layout de abas (`chatroom/app/(app)/(tabs)/_layout.tsx`), a propriedade `tabBarStyle` não calculava a margem de segurança inferior (`insets.bottom`), resultando em altura estática insuficiente em dispositivos com botões de navegação virtuais habilitados.
  3. No composer da sala de chat (`chatroom/app/(app)/room/[id].tsx`), o container de envio de mensagem utilizava espaçamento fixo na base, fazendo o campo de texto ficar ocultado pelos botões de sistema do aparelho.
- **Solução Aplicada:**
  1. Em `Screen.tsx`, ajustadas as bordas de segurança padrão para `edges = ['top', 'left', 'right', 'bottom']`.
  2. Em `chatroom/app/(app)/(tabs)/_layout.tsx`, importado `useSafeAreaInsets` e aplicada a altura dinâmica:
     ```tsx
     tabBarStyle: {
       height: 60 + Math.max(insets.bottom, 8),
       paddingBottom: Math.max(insets.bottom, 8),
       paddingTop: 8,
       backgroundColor: colors.surface,
       borderTopColor: colors.border,
     }
     ```
  3. Em `chatroom/app/(app)/(tabs)/index.tsx`, adicionado espaçamento dinâmico no botão flutuante: `style={[styles.fab, { bottom: spacing.lg + insets.bottom }]}` e no final da lista de salas.
  4. Em `chatroom/app/(app)/room/[id].tsx`, ajustado o estilo do composer: `style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}`.
  Com isso, tanto em aparelhos Android com botões virtuais tradicionais quanto em iPhones com entalhe/Dynamic Island, a interface mantém distância perfeita dos controles do sistema operacional.

---

## 15. Resumo Geral de Validações de Qualidade e Segurança

Ao término de todas as etapas (1 a 14) do guia principal e de todos os 10 desafios do Apêndice C:

1. **Testes Automatizados Totais: 57 testes passando (100% de sucesso)**
   - **38 testes de aplicativo (Jest / RNTL):**
     - `__tests__/messages.test.ts` (Agrupamento cronológico e de autor)
     - `__tests__/avatar.test.ts` (Geração de iniciais de avatar)
     - `__tests__/typing.test.ts` (Texto descritivo de digitação em tempo real)
     - `__tests__/reactions.test.ts` (Agrupamento e contagem de reações por emoji)
     - `__tests__/search.test.ts` (Filtro e busca textual de mensagens)
     - `__tests__/reads.test.ts` (Status de entrega e leitura com visto por)
     - `__tests__/components.test.tsx` (Renderização de `Button`, `Avatar`, `TypingIndicator`, `RoomCard`)
     - `__tests__/notifications.test.ts` (Cálculo de destinatários e montagem de push payload)
   - **19 testes de banco de dados (PGlite / Node test runner):**
     - Criação automática de perfis por trigger e controle de edição
     - Criação de salas, ingresso e impedimento de personificação
     - Visibilidade de membros e saída de salas
     - Salas privadas protegidas por senha/código de convite
     - Mensagens diretas (1 para 1) com isolamento estrito via RLS
     - Validação de mensagens vazias e limites de caracteres
     - Exclusão permitida apenas ao autor da mensagem
     - Edição de mensagens restrita ao autor com flag `is_edited`
     - Envio e leitura de mensagens com imagem anexada
     - Inclusão e remoção de reações com emoji
     - Confirmação de leitura e vistos por mensagem
     - Registro, atualização, exclusão e proteção RLS de tokens push

2. **Tipagem Estrita (TypeScript):**
   - `pnpm run typecheck` executado sem nenhum erro (`0 errors`).

3. **Formatação de Código:**
   - Todo o código formatado via Prettier de acordo com `.prettierrc`.
