# ADR 0003 — Prévia de folha de pagamento

**Status:** aceita (outubro de 2026)

## Contexto
O DP pediu os campos de folha (salário, VA, VT, benefícios, descontos, dependentes/filhos) e o
cálculo. A especificação mantém a folha oficial com a contabilidade até homologação.

## Decisões
1. **Prévia, não folha oficial.** O sistema calcula uma estimativa mensal por colaborador para
   conferência e exporta em Excel/CSV para a contabilidade, que continua emitindo holerite,
   guias e eSocial. Toda tela e arquivo dizem isso.
2. **Motor puro e testado** em `src/lib/domain/payroll.ts`: salário proporcional (mês comercial),
   horas extras 50%/100%, adicional noturno, DSR sobre variáveis (sem feriados), insalubridade
   (sobre o mínimo), periculosidade, rubricas fixas com incidências, faltas e DSR perdido
   (aproximado), salário-família, INSS progressivo, IRRF (deduções legais × desconto
   simplificado + redução da Lei 15.270/2025), pensão alimentícia, VT (até 6%), VA/VR com
   coparticipação, planos, contribuição sindical, adiantamento e FGTS (8% / aprendiz 2%).
   Estágio: sem INSS, FGTS e desconto de VT. PJ: fora da folha.
3. **Tabelas com vigência** (`payroll_tax_tables`), editáveis por Admin/DP da organização. Sem
   cadastro, valem as tabelas de referência 2026 do código, marcadas como "conferir".
4. **Dados de remuneração são sensíveis**: perfil, rubricas fixas e lançamentos do mês só para
   Admin/RH/DP da unidade (e leitura pelo titular). Diretoria e gestor não veem. Auditoria
   registra quem/quando/quais campos, sem valores. Lançamentos não são editados, só excluídos.
5. **Horas extras e noturnas do ponto** entram como sugestão; lançamento manual do mesmo código
   prevalece. Ausências do ponto não viram desconto automático (podem ser justificadas).

6. **Minha folha** (migração 007): o titular vê a própria prévia em Meus dados, somente leitura,
   sem o custo da empresa. As tabelas de cálculo passam a ser legíveis por qualquer membro da
   organização (são valores legais, não pessoais) para que a prévia do titular use as mesmas
   vigências do DP.

7. **13º e férias** (`src/lib/domain/payroll-annual.ts`), como tipos de folha na prévia:
   - 13º: avos (meses com 15+ dias), base = remuneração fixa (salário, adicionais, rubricas com
     INSS) + média de variáveis do ano; 1ª parcela = 50% sem INSS/IRRF, com FGTS; 2ª parcela =
     integral − adiantamento, INSS e IRRF exclusivos (deduções legais, sem desconto simplificado
     nem redução), FGTS sobre a diferença. Desligados: 13º na rescisão (fora). Estágio: sem 13º.
   - Férias: recibo no mês de início de cada férias aprovada em "Férias e ausências": férias +
     1/3, abono pecuniário + 1/3 (isentos), INSS, IRRF (como no mês), pensão, FGTS e data-limite
     de pagamento (CLT art. 145). Estágio: recesso sem 1/3. Na folha mensal, os dias de férias
     saem do salário e o VT é proporcional.
   - Médias: horas médias × valor-hora atual e comissões em R$ (12 meses antes das férias; meses
     do ano antes do 13º). O DP pode informar médias e a 1ª parcela já paga, substituindo o cálculo.

8. **Aba Benefícios e descontos** (`src/lib/domain/payroll-benefits.ts`): visão consolidada da
   folha mensal por colaborador — VT concedido/desconto/custo, VA/VR concedido/coparticipação/custo,
   plano de saúde (colaborador e empresa), odonto, seguro, sindical, pensão, descontos fixos e
   adiantamento, com totais e planilha. Deriva das mesmas linhas do demonstrativo.

## Consequências
Antes do uso real, a contabilidade compara a prévia com a folha oficial de pelo menos um mês
(checklist de homologação). Encargos patronais além do FGTS e rescisão ficam fora; o INSS do mês com férias é consolidado pela contabilidade.
