# C'Art People OS — Especificação de produto e arquitetura

Versão 1.0 (outubro de 2026). Fonte da verdade para requisitos, dados, permissões e limites legais.
Quando o código divergir deste documento, corrija um dos dois na mesma mudança.

## 1. Objetivo

Plataforma própria de RH + Departamento Pessoal da C'Art Ambientações. Começa em uma unidade,
expande para filiais sem reconstrução, atende 21 a 100 usuários na fase inicial.

O sistema é responsável por **dados, fluxos, aprovações, indicadores e integrações**. O cálculo
oficial da folha, encargos, guias e eventos do eSocial continuam no processador oficial (sistema
de folha ou escritório contábil) até que essas funções sejam implementadas, testadas e homologadas.
O sistema calcula uma **prévia** mensal da folha para conferência (ADR 0003), sem substituir a oficial.

## 2. Decisões oficiais

| Item | Definição |
| --- | --- |
| Unidades | Multiunidade desde o início (`organization_id` + `unit_id` em todo dado de pessoa) |
| Público | RH, DP, gestores, diretoria e colaboradores |
| DP | Movimentações com aprovação e exportação para a folha oficial |
| Ponto | Importação do espelho do sistema de ponto existente (adaptadores) |
| Folha | Exportação por adaptador (CSV genérico na v1) + prévia mensal calculada em Excel/CSV |
| IA | Consultas em linguagem natural sobre dados já autorizados, sem dado sensível |
| Frontend | Next.js 16 (App Router, Cache Components) + React 19 + TypeScript |
| Backend | Supabase (Auth, Postgres, Storage) |
| Hospedagem | Vercel; repositório no GitHub com CI |
| Interface | Modo claro, escuro e do sistema |
| Segurança | RBAC + RLS, auditoria, LGPD, testes de isolamento |
| Produção | Somente após homologação técnica e validação dos processos legais (ver `docs/HOMOLOGACAO.md`) |

## 3. Papéis e permissões

Papéis são concedidos por organização, opcionalmente restritos a uma unidade (`memberships.unit_id`).
Sem unidade = vale para todas. A tabela abaixo é a regra de negócio; a RLS é a implementação.

| Capacidade | Admin | RH | DP | Gestor | Diretoria | Colaborador |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Ver colaboradores | todos | unidade | unidade | equipe | todos | a si |
| Cadastrar/editar colaborador | ✓ | ✓ | ✓ | | | |
| Ver dados sensíveis (CPF, salário, banco, endereço) | ✓ | ✓ | ✓ | | | os próprios |
| Solicitar ausência | ✓ | ✓ | ✓ | equipe | | a si |
| Decidir ausência (não a própria) | ✓ | ✓ | ✓ | equipe | | |
| Ver movimentações do DP | ✓ | ✓ | ✓ | | ✓ | |
| Registrar/aprovar movimentação (aprovador ≠ autor) | ✓ | ✓ | ✓ | | | |
| Gerar lote para a folha | ✓ | | ✓ | | | |
| Dados e prévia da folha (remuneração, benefícios, descontos) | ✓ | ✓ | ✓ | | | os próprios (leitura) |
| Tabelas de cálculo da folha (INSS, IRRF, ...) | org | | org | | | |
| Importar ponto | ✓ | | ✓ | | | |
| Ver ponto | ✓ | ✓ | ✓ | equipe | ✓ | o próprio |
| Assistente de IA | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Auditoria | org | | | | | |
| Documentos do RH (enviar/excluir) | ✓ | ✓ | | | | |
| Documentos do DP (enviar/excluir) | ✓ | | ✓ | | | |
| Documentos da empresa marcados "todos" (ler) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Configurações e acessos | ✓ | | | | | |

"Equipe" = liderados diretos e indiretos (cadeia `manager_id`, até 10 níveis).
A diretoria vê movimentações do DP (inclusive valores de alteração salarial no payload), mas não
a tabela de dados sensíveis.

## 4. Módulos (v1)

1. **Painel** — quadro, admissões e desligamentos do mês, rotatividade 12 meses, pendências,
   ausentes hoje, quadro por departamento, tempo de casa. Colaborador vê painel pessoal.
2. **Colaboradores** — cadastro (vínculo, contato), dados pessoais segregados, documentos em
   bucket privado com vencimento, histórico de ausências e movimentações.
3. **Férias e ausências** — solicitação, conferência das regras da CLT, aprovação pelo gestor/RH,
   cancelamento, calendário de 45 dias, histórico.
4. **Movimentações do DP** — admissão, alteração salarial/cargo, transferência, afastamento,
   retorno, desligamento, férias. Fluxo `rascunho → enviada → aprovada → enviada à folha`,
   segregação de funções, lote exportável, importação de férias aprovadas.
5. **Prévia da folha** — por colaborador: salário, VT, VA/VR, planos, adicionais, pensão,
   rubricas fixas e dependentes (filhos até 14 anos, dependentes de IR); por competência:
   lançamentos variáveis (horas extras, faltas, comissões, adiantamento) e demonstrativo estimado
   com INSS, IRRF, FGTS e líquido; 13º (1ª e 2ª parcelas) e recibo de férias (1/3, abono, médias);
   aba consolidada de benefícios e descontos; digitação de folha em grade (todos os colaboradores,
   colar do Excel); tabelas com vigência; exportação para a contabilidade.
   **Comissões** — planos (% fixo, faixas por meta, % por categoria; base venda ou recebido),
   vendedores com meta e % próprio, vendas e recebimentos por digitação ou planilha CSV, apuração
   e lançamento como COMISSAO na folha; o vendedor vê a própria comissão em Minha folha.
   **Contratação** — vagas por unidade (aberta/pausada/encerrada), candidatos com consentimento
   LGPD e currículo em bucket privado, quadro por etapa (triagem → entrevista → teste → proposta →
   aprovado), histórico automático, contratação que gera o cadastro "em admissão", o checklist de
   admissão e a movimentação de admissão em rascunho; conclusão ativa o colaborador. RH/Admin
   mantêm; DP lê candidatos e cuida do checklist; diretoria vê as vagas.
6. **Ponto** — importação do espelho (adaptador CSV), resumo mensal, download do resumo para a folha.
7. **Documentos** — abas Colaboradores (todos os documentos das pessoas, com envio e filtro de
   vencimento), RH e DP (documentos da empresa por área, com unidade, competência, vencimento e
   visibilidade "só equipe" ou "todos"); quem não é da equipe vê os documentos compartilhados.
8. **Assistente** — perguntas em linguagem natural; ferramentas somente leitura sob RLS.
9. **Configurações** — unidades, departamentos, cargos (CBO), acessos por convite.
   **Controle de acesso** (administrador geral) — usuários com papéis, situação, último acesso e
   sessões; criar usuário com e-mail e senha provisória (troca obrigatória no primeiro acesso,
   marca em `app_metadata`); alterar papel/escopo, revogar, bloquear/desbloquear (suspende papéis, encerra sessões,
   bloqueia o login no Auth), reenviar convite ou link de senha; revisão periódica a cada 90 dias
   (carimbo de quem revisou no banco); histórico de acessos (entradas, senhas incorretas, saídas e
   ações administrativas, com IP e dispositivo).
10. **Auditoria** — trilha de alterações, sem valores de dados sensíveis.
11. **Meus dados** — portal do colaborador, definição de senha e "Minha folha" (prévia do próprio
    pagamento, benefícios, rubricas, lançamentos e dependentes; somente leitura, últimos 6 meses).

## 5. Modelo de dados

Migrações em `supabase/migrations/` são a fonte da verdade. Resumo:

- `organizations`, `units`, `departments`, `positions` — estrutura.
- `memberships(user_id, organization_id, unit_id?, role, active)` — acesso.
- `employees` — dado de uso amplo (sem CPF/salário). `user_id` liga ao login.
- `employee_sensitive` — CPF, RG, nascimento, PIS, salário base, banco, Pix, endereço, emergência.
- `dependents` — dependentes (sensível).
- `leave_requests` — ausências; `days` calculado; regras de transição em trigger.
- `dp_events` + `payroll_export_batches` — movimentações e lotes; `payload jsonb` por tipo
  (campos em `src/lib/domain/dp-events.ts`). Nunca colocar CID ou dado de saúde no payload.
- `time_imports` + `time_entries` — ponto importado (único por colaborador e dia).
- `employee_documents` — metadados; arquivo em `employee-documents/{org}/{employee}/{uuid}-{nome}`.
- `employee_payroll_profile`, `employee_payroll_items`, `payroll_entries` — remuneração, rubricas
  fixas e lançamentos do mês (sensível); `payroll_tax_tables` — tabelas de cálculo com vigência.
- `org_documents` — documentos do RH/DP (bucket privado `org-documents/{org}/{area}/...`).
- `commission_plans`, `employee_commission`, `sales`, `sale_payments` — comissões (remuneração:
  Admin/RH/DP da unidade e o próprio vendedor; planos legíveis por membros).
- `job_openings`, `candidates`, `candidate_events`, `admission_checklist` — contratação; currículos
  em `recruitment/{org}/{candidato}/{uuid}-{nome}`; candidato herda unidade da vaga.
- `memberships.reviewed_at/reviewed_by/suspended_at` — revisão periódica e bloqueio reversível.
- `access_events` — histórico de acessos; login gravado só pelo servidor (`record_access_event`,
  chave secreta); leitura pelo administrador geral e pelo próprio usuário. Funções `org_users`,
  `org_user_sessions` e `end_user_sessions` expõem dados do Auth só ao administrador geral.
- `report_exports` — registro imutável de exportações.
- `audit_log` — somente inserção via trigger; `ai_query_log` — perguntas ao assistente.

Regras no banco (triggers):
- Escopo derivado do colaborador: `organization_id/unit_id` das tabelas filhas vêm de `employees`.
- Colaborador: departamento/gestor da mesma organização, sem ciclo de gestão, desligado exige data.
- Ausência: nasce pendente; decisão só por gestor/RH/DP; ninguém decide a própria; sem sobreposição;
  decidida não muda datas; aprovada só é cancelada por responsável.
- Movimentação: transições válidas; aprovador diferente do autor; conteúdo só muda em rascunho;
  exportação exige lote; campos de controle não são graváveis.

## 6. Segurança

- RLS em todas as tabelas; funções auxiliares `SECURITY DEFINER` no schema `private` (não exposto).
- `anon` não acessa tabelas. Sem cadastro aberto: entrada só por convite ou por
  usuário criado pelo administrador geral (senha provisória trocada no primeiro acesso).
- Chave secreta apenas no servidor (convites, criação de usuário e e-mails na auditoria). Escritas de domínio sempre
  com a sessão do usuário.
- Toda Server Action revalida sessão e papel; entradas validadas com Zod.
- Cabeçalhos: `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, HSTS, `nosniff`, Referrer-Policy.
- CSV exportado neutraliza fórmulas (injeção de CSV).
- Testes de isolamento em `supabase/tests/rls.test.ts` rodam no CI contra Postgres real.

## 7. LGPD

| Dado | Base legal (art. 7º / 11) | Acesso | Retenção sugerida |
| --- | --- | --- | --- |
| Cadastro e vínculo | Execução de contrato / obrigação legal | amplo conforme papel | vínculo + prazos trabalhistas |
| CPF, PIS, salário, banco | Obrigação legal (folha, eSocial) | RH, DP, admin, titular | idem |
| Remuneração, benefícios, descontos, pensão | Execução de contrato / obrigação legal | RH, DP, admin, titular | idem |
| Dependentes (nome, nascimento, CPF) | Obrigação legal (IR, salário-família) | RH, DP, admin, titular | idem |
| Documentos (contrato, ASO) | Obrigação legal | RH, DP, admin, titular | conforme NR-7 e CLT |
| Ponto | Obrigação legal (Portaria 671/2021) | DP, RH, gestor (equipe) | 5 anos |
| Perguntas à IA | Legítimo interesse | autor, admin | 12 meses |

Princípios aplicados: minimização (assistente sem dado sensível, auditoria sem valores
sensíveis), segregação, controle de acesso, rastreabilidade e direito de acesso do titular
("Meus dados"). Validar a tabela com o encarregado (DPO) antes da produção.

## 8. Integrações

- **Folha** — interface `PayrollAdapter` (`src/lib/integrations/payroll.ts`). Novo destino = novo
  adaptador; o lote guarda o `provider` e o arquivo é regenerável.
- **Ponto** — interface `TimeClockAdapter` (`src/lib/integrations/time-clock.ts`). Quando o sistema
  oficial for identificado, criar adaptador do layout dele (ou API) e manter o CSV como alternativa.
- **eSocial** — fora do escopo da v1.

## 9. IA

- Modelo configurável (`ANTHROPIC_MODEL`), chave no servidor.
- Ferramentas somente leitura, com a sessão do usuário e a unidade em foco, limitadas em tamanho.
- O modelo nunca recebe CPF, salário, banco, endereço ou saúde.
- Limite de 60 perguntas por hora por usuário; perguntas registradas em `ai_query_log`.

## 10. Design system

- Materiais de ambientação: barra lateral eucalipto (`--brand`), fundo pedra fria (`--bg`),
  latão para atenção (`--brass`), vermelho terroso para erro (`--danger`).
- Tipografia única: Schibsted Grotesk. `.tnum` = algarismos de linha; `.num` = largura fixa só em
  colunas puramente numéricas (a fonte alarga vírgula/ponto com "tnum").
- Tabelas densas com filetes; painéis só para agrupar. Raio 6px em controles, 10px em painéis.
- Tokens em `src/app/globals.css`, com variantes para `.dark`.
- Texto: português claro, voz ativa, botões com o verbo da ação, erros dizem o que fazer.

## 11. Requisitos não funcionais

- Até 100 usuários simultâneos e 5 mil colaboradores sem paginação no servidor.
- Páginas com shell estático e conteúdo dinâmico em streaming (Cache Components).
- Funciona em celular (≥ 360px), teclado e leitor de tela; respeita movimento reduzido.
- Uploads até 4 MB (limite de corpo das funções da Vercel); maiores exigem upload assinado.

## 12. Roteiro

- **v1 (este repositório)** — módulos da seção 4.
- **v1.1** — calendário de feriados por unidade (alimenta a regra do art. 134 §3º), saldo de férias
  por período aquisitivo, dependentes na interface, notificações por e-mail.
- **v1.2** — adaptador do sistema de ponto oficial, adaptador do sistema de folha/contabilidade.
- **v2** — avaliação de desempenho, treinamentos, onboarding com checklist, assinatura eletrônica.

## 13. Critérios de aceite da v1

- [ ] Migrações aplicam em projeto Supabase limpo; seed cria organização e matriz.
- [ ] 64 testes de RLS passam; nenhum papel lê dados fora do seu escopo.
- [ ] Fluxo de férias: solicitar → decidir → aparecer no DP como rascunho.
- [ ] Fluxo de movimentação com aprovador diferente do autor e lote baixado em CSV.
- [ ] Importação de ponto com relatório de linhas ignoradas.
- [ ] Convite de usuário, primeiro acesso e definição de senha.
- [ ] Interface aprovada em claro, escuro e celular.
- [ ] Checklist de homologação (`docs/HOMOLOGACAO.md`) assinado por RH, DP e contabilidade.
