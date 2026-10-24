# Checklist de homologação

A produção com dados reais só começa com todos os itens marcados e as assinaturas no fim.

## Técnica
- [ ] Migrações aplicadas em projeto Supabase de homologação e de produção (mesma versão)
- [ ] CI verde: tipos, lint, testes de domínio, 60 testes de RLS e build
- [ ] Cadastro aberto desativado; templates de e-mail com `/auth/callback`
- [ ] `SUPABASE_SECRET_KEY` apenas nas variáveis de servidor da Vercel
- [ ] Teste manual com um usuário de cada papel (admin, RH, DP, gestor, diretoria, colaborador)
- [ ] Tentativa de acesso cruzado entre duas unidades bloqueada
- [ ] Backup diário configurado (docs/BACKUP.md), primeiro backup baixado e restauração testada
      num projeto de teste; senha do backup guardada no cofre da empresa
- [ ] Domínio próprio com HTTPS

## Processos legais e de DP
- [ ] Contabilidade validou o layout do CSV de movimentações e o resumo de ponto
- [ ] Contabilidade conferiu as tabelas de INSS, IRRF e salário-família cadastradas em Prévia da folha → Tabelas
- [ ] Prévia de um mês real comparada com a folha oficial (diferença explicada rubrica a rubrica)
- [ ] Colaborador de teste conferiu "Minha folha" contra o holerite oficial do mesmo mês
- [ ] Contabilidade conferiu 13º (1ª e 2ª parcelas) e um recibo de férias com abono contra o sistema oficial,
      incluindo o método de médias e a tributação do IRRF
- [ ] Envio, download e exclusão de documentos testados em cada aba (Colaboradores, RH, DP) e
      documento "visível a todos" conferido com um usuário colaborador
- [ ] RH validou o checklist de admissão e a exclusão de candidatos não contratados (LGPD)
- [ ] Comercial validou os planos de comissão (faixas, categorias, base venda/recebido) com um mês real
      e a planilha exportada do sistema de vendas foi importada sem linhas ignoradas
- [ ] DP validou rubricas, incidências e a regra de DSR/faltas usada na prévia
- [ ] RH validou as definições de indicador (rotatividade, tempo de casa) da tela Análises
- [ ] Relatórios exportados conferidos contra a base (Excel, CSV e PDF) e registro em `report_exports` revisado
- [ ] DP validou as regras de férias aplicadas (fracionamento, abono, início, aviso)
- [ ] Definido o sistema de ponto oficial e conferida a importação de um mês real
- [ ] Encarregado (DPO) aprovou a tabela de bases legais e retenção (spec, seção 7)
- [ ] DPO ciente da transferência internacional do backup criptografado (Cloudflare R2, EUA; chave só com a empresa)
- [ ] Aviso de privacidade aos colaboradores atualizado mencionando o People OS e o assistente de IA

## Assinaturas
| Área | Nome | Data |
| --- | --- | --- |
| RH | | |
| DP | | |
| Contabilidade | | |
| TI / responsável técnico | | |
