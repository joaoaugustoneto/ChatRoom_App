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

## 5. Resumo das Validações de Qualidade da Etapa 14

Conforme solicitado na Etapa 14 do guia de construção:

1. **Verificações Automáticas:**
   - `pnpm run typecheck`: Executado com sucesso, 0 erros de TypeScript detectados.
   - `pnpm test:app`: 3 suítes de teste Jest executadas (`messages.test.ts`, `avatar.test.ts`, `typing.test.ts`), totalizando **20 testes unitários passando**.
   - `pnpm run test:db`: 3 suítes de teste PGlite (`perfis`, `salas e participação`, `mensagens`), totalizando **12 testes de banco de dados passando**.
   - `pnpm test`: Orquestração completa com **32 testes automatizados aprovados (20 app + 12 banco)** com 0 falhas.
   - `pnpm run format`: Padronização de todo o código fonte via Prettier conforme `.prettierrc`.

2. **Segurança e RLS no Banco de Dados:**
   - **Tabela `profiles`**: Leitura permitida para qualquer usuário autenticado (`select to authenticated using (true)`). Atualização restrita ao dono da linha (`update to authenticated using (auth.uid() = id)`).
   - **Tabela `rooms`**: Leitura aberta para usuários autenticados (`select to authenticated using (true)`). Criação restrita com verificação de dono (`insert to authenticated with check (auth.uid() = created_by)`).
   - **Tabela `room_members`**: Previne recursão infinita delegando a checagem à função `security definer` `public.is_room_member(room_id)`. Leitura permitida para o próprio usuário e para colegas de sala. Inserção restrita a si próprio (`user_id = auth.uid()`). Exclusão restrita à própria linha.
   - **Tabela `messages`**: Leitura e inserção restritas aos membros ativos da sala (`is_room_member(room_id)`). Exclusão permitida apenas ao autor da mensagem (`user_id = auth.uid()`).
   - **Replication**: Publicação Realtime habilitada em `public.messages`.
