# Checklist de homologação

A produção com dados reais só começa com todos os itens marcados e as assinaturas no fim.

## Técnica
- [ ] Migrações aplicadas em projeto Supabase de homologação e de produção (mesma versão)
- [ ] CI verde: tipos, lint, testes de domínio, 43 testes de RLS e build
- [ ] Cadastro aberto desativado; templates de e-mail com `/auth/callback`
- [ ] `SUPABASE_SECRET_KEY` apenas nas variáveis de servidor da Vercel
- [ ] Teste manual com um usuário de cada papel (admin, RH, DP, gestor, diretoria, colaborador)
- [ ] Tentativa de acesso cruzado entre duas unidades bloqueada
- [ ] Backups automáticos (PITR) ativos no Supabase
- [ ] Domínio próprio com HTTPS

## Processos legais e de DP
- [ ] Contabilidade validou o layout do CSV de movimentações e o resumo de ponto
- [ ] Contabilidade conferiu as tabelas de INSS, IRRF e salário-família cadastradas em Prévia da folha → Tabelas
- [ ] Prévia de um mês real comparada com a folha oficial (diferença explicada rubrica a rubrica)
- [ ] Colaborador de teste conferiu "Minha folha" contra o holerite oficial do mesmo mês
- [ ] DP validou rubricas, incidências e a regra de DSR/faltas usada na prévia
- [ ] RH validou as definições de indicador (rotatividade, tempo de casa) da tela Análises
- [ ] Relatórios exportados conferidos contra a base (Excel, CSV e PDF) e registro em `report_exports` revisado
- [ ] DP validou as regras de férias aplicadas (fracionamento, abono, início, aviso)
- [ ] Definido o sistema de ponto oficial e conferida a importação de um mês real
- [ ] Encarregado (DPO) aprovou a tabela de bases legais e retenção (spec, seção 7)
- [ ] Aviso de privacidade aos colaboradores atualizado mencionando o People OS e o assistente de IA

## Assinaturas
| Área | Nome | Data |
| --- | --- | --- |
| RH | | |
| DP | | |
| Contabilidade | | |
| TI / responsável técnico | | |
