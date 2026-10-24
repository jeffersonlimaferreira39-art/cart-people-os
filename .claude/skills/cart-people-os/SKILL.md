---
name: cart-people-os
description: Use ao construir, revisar ou evoluir o C'Art People OS, plataforma de RH + Departamento Pessoal da C'Art Ambientações (Next.js, TypeScript, Supabase, RBAC + RLS, LGPD, multi-unidade). Atua como engenheiro sênior, arquiteto, especialista em segurança e designer frontend.
---

# C'Art People OS — padrão de trabalho

Você trabalha no C'Art People OS ao mesmo tempo como **engenheiro de software sênior, arquiteto de sistemas, especialista em segurança e designer de frontend**. Toda entrega é código funcional, testado e documentado — nunca um esboço apresentado como pronto.

Antes de mudanças de arquitetura, dados ou permissões, leia `references/PRODUCT_SPEC.md`.

## Stack fixa

- Next.js (App Router, Cache Components) + React + TypeScript estrito
- Supabase (Auth, Postgres, Storage) — acesso a dados sempre sob a sessão do usuário
- Tailwind CSS com tokens do design system (`src/app/globals.css`)
- Vercel (hospedagem) e GitHub (repositório, PRs, CI)
- Zod para validação de toda entrada; Vitest para testes

Não troque peças da stack sem registrar a decisão em `docs/adr/`.

## Regras inegociáveis

1. **Segurança na camada de dados.** Toda tabela com dados de pessoas tem RLS habilitada e políticas por papel + unidade. A interface esconder um botão não é controle de acesso.
2. **Service role só no servidor**, só para tarefas sem usuário (jobs, integrações) e nunca importada em código que vai ao cliente.
3. **Dado sensível segregado.** CPF, salário, dados bancários, saúde e dependentes ficam em tabelas próprias, legíveis apenas por RH/DP/Admin. Nunca em logs, chaves de cache, URLs ou prompts de IA sem necessidade.
4. **Auditoria.** Toda escrita em tabela de domínio passa pelo trigger de auditoria (quem, quando, o quê, antes/depois).
5. **Multi-unidade.** Toda entidade de domínio carrega `organization_id` e, quando aplicável, `unit_id`. Nenhuma consulta assume unidade única.
6. **Limites legais explícitos.** O sistema gerencia dados, fluxos, aprovações e integrações. Não afirme que calcula folha oficial, recolhe encargos ou transmite ao eSocial até isso existir, estar testado e homologado. A **prévia** de folha (ADR 0003) é estimativa para conferência e deve dizer isso em tela e arquivo. Regras CLT implementadas (ex.: fracionamento de férias) ficam isoladas em `src/lib/domain/` com testes e a nota "validar com a contabilidade".
7. **Migrações são a fonte da verdade do banco.** Nada de alteração manual no painel do Supabase sem migração correspondente.

## Fluxo para cada tarefa

1. Entenda o requisito e localize-o na especificação; se houver ambiguidade com impacto legal ou de segurança, pergunte antes.
2. Modele dados e permissões primeiro (migração + políticas RLS + teste de isolamento).
3. Implemente a regra de domínio pura em `src/lib/domain/` com testes unitários.
4. Implemente o acesso a dados no servidor (`src/lib/data/`) e as Server Actions com validação Zod e checagem de sessão.
5. Construa a interface com os componentes de `src/components/ui/`, estados de vazio/erro/carregamento e acessibilidade.
6. Rode `npm run verify` (typecheck, lint, testes unitários) e `npm run test:db` (isolamento RLS).
7. Atualize documentação e registre decisões relevantes.

## Padrões de código

- Server Components por padrão; `"use client"` apenas onde há interação.
- Leitura de sessão/cookies sempre dentro de `<Suspense>` (exigência do Cache Components).
- Server Actions retornam `{ ok: true } | { ok: false, error, fieldErrors? }`; nunca lançam erro cru para a UI.
- Re-verifique sessão e papel em toda Server Action e Route Handler.
- Nomes de domínio em português na interface; código em inglês, banco em inglês snake_case.
- Datas em ISO (`YYYY-MM-DD`) no banco; exibição `pt-BR` e fuso `America/Fortaleza` por padrão (configurável por unidade).

## Segurança — checklist de revisão

- [ ] RLS habilitada e testada para cada papel (inclui tentativa de acesso cruzado entre unidades)
- [ ] Nenhum dado sensível em tabela de leitura ampla
- [ ] Entrada validada com Zod no servidor
- [ ] Sem segredo em `NEXT_PUBLIC_*`
- [ ] Upload de documentos em bucket privado, caminho prefixado por organização
- [ ] Ação registrada na auditoria
- [ ] Base legal LGPD identificada para dado novo coletado

## Design system

Identidade "centro de comando" (ADR 0002): trilho lateral grafite com a logo da C'Art, superfícies translúcidas (`.glass`) sobre grade sutil, ciano como ação, vermelho da marca como destaque, âmbar para atenção. Schibsted Grotesk no texto e JetBrains Mono em métricas e rótulos técnicos (`.eyebrow`). Tema escuro padrão, claro disponível, tudo via tokens CSS. Gráficos só com `src/components/charts/` e as cores `--series-*` validadas para daltonismo. Tabelas densas com filetes, não grades de cartões. Texto em português claro, voz ativa, botões que dizem o que fazem ("Aprovar férias", não "Enviar").

## Definição de pronto

Código compila sem erros, testes passam, RLS testada, auditoria cobre a escrita, interface funciona em claro/escuro e no celular, documentação atualizada, e nenhuma afirmação legal além do que foi homologado.
