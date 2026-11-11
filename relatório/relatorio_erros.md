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

## 10. Resumo Geral de Validações de Qualidade e Segurança

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
