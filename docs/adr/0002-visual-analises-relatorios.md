# ADR 0002 — Visual "centro de comando", análises e exportação de relatórios

**Status:** aceita (outubro de 2026)

## Decisões
1. **Nova identidade visual.** Trilho lateral grafite nos dois temas, superfícies translúcidas
   (`.glass`) sobre grade sutil, ciano como ação, vermelho da logo como destaque e JetBrains Mono
   em métricas e rótulos técnicos (`.eyebrow`). Tema escuro é o padrão; o claro continua disponível.
   Tudo via tokens em `globals.css`, sem mudar a API dos componentes de `src/components/ui/`.
2. **Gráficos em SVG próprio** (`src/components/charts/`), sem biblioteca: um eixo, marcas finas,
   tooltip, legenda e tabela equivalente. Cores `--series-1/2` validadas para daltonismo nos dois
   temas (validador de paleta da skill de visualização).
3. **Indicadores como funções puras** em `src/lib/domain/analytics.ts`, com testes. Calculados
   sobre o que a RLS devolve para o usuário: o gestor vê só a equipe; ninguém vê dado sensível.
4. **Relatórios** em Excel (`write-excel-file`), CSV pt-BR (";", vírgula decimal, proteção contra
   fórmula) e PDF pela impressão do navegador (folha de estilo de impressão). Nenhum relatório
   inclui CPF, salário, dados bancários ou de saúde; movimentações do DP saem sem o `payload`.
5. **Toda exportação é registrada** em `report_exports` (migração 005, RLS, imutável). Se o
   registro falhar, o arquivo não é entregue (rastreabilidade LGPD).

## Consequências
Novo relatório = entrada em `src/lib/reports/catalog.ts` + caso em `build.ts`, com a capacidade
de papel correspondente. Definições de indicador (rotatividade, tempo de casa) precisam de
validação do RH antes de virarem meta.
