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

## Consequências
Antes do uso real, a contabilidade compara a prévia com a folha oficial de pelo menos um mês
(checklist de homologação). Encargos patronais além do FGTS, 13º, férias e rescisão ficam fora.
