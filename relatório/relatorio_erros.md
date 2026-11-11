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
