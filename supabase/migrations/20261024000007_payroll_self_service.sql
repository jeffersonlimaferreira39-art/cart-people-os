-- ===========================================================================
-- "Minha folha" em Meus dados: o colaborador vê a própria prévia.
-- As tabelas de cálculo (INSS, IRRF, salário-família, parâmetros) são valores
-- legais, não dados pessoais; qualquer membro da organização pode lê-las para
-- que a prévia do titular use as mesmas vigências do DP. Alteração continua
-- restrita a Admin/DP da organização inteira.
-- ===========================================================================
drop policy payroll_tables_select on public.payroll_tax_tables;
create policy payroll_tables_select on public.payroll_tax_tables for select to authenticated
  using (private.is_member(organization_id));
