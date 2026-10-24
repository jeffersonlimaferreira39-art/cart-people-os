import { describe, expect, it } from "vitest";
import {
  countBy, headcountSeries, leaveDaysByType, monthsBack, parsePeriodMonths, summarize, tenureDistribution, timeByMonth,
} from "./analytics";

const today = "2026-10-24";
const rows = [
  { hire_date: "2015-03-01", termination_date: null, status: "active" },
  { hire_date: "2024-01-10", termination_date: null, status: "on_leave" },
  { hire_date: "2026-09-15", termination_date: null, status: "onboarding" },
  { hire_date: "2022-05-02", termination_date: "2026-08-31", status: "terminated" },
];

describe("análises de pessoas", () => {
  it("lista os meses do período terminando no mês atual", () => {
    expect(monthsBack(today, 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(monthsBack("2026-01-31", 2)).toEqual(["2025-12", "2026-01"]);
    expect(parsePeriodMonths("24")).toBe(24);
    expect(parsePeriodMonths("7")).toBe(12);
  });

  it("conta quadro no fim de cada mês, admissões e desligamentos", () => {
    const s = headcountSeries(rows, today, 3);
    // Desligado em 31/08: ainda conta no próprio dia, sai do quadro depois.
    expect(s.map((p) => [p.period, p.headcount, p.hires, p.terminations])).toEqual([
      ["2026-08", 2, 0, 1],
      ["2026-09", 3, 1, 0],
      ["2026-10", 3, 0, 0],
    ]);
    expect(s[0].turnover).toBe(25);
  });

  it("resume o período com rotatividade e tempo médio de casa", () => {
    const r = summarize(rows, today, 12);
    expect(r).toMatchObject({ headcount: 3, hires: 1, terminations: 1, onLeave: 1, onboarding: 1 });
    expect(r.turnover).toBe(33.3);
    expect(r.avgTenureYears).toBeGreaterThan(4);
  });

  it("distribui tempo de casa em faixas e agrupa por chave", () => {
    expect(tenureDistribution(rows, today).map((b) => b.count)).toEqual([1, 0, 1, 0, 1]);
    expect(countBy([{ d: "TI" }, { d: null }, { d: "TI" }], (r) => r.d)).toEqual([
      { label: "TI", count: 2 },
      { label: "Não informado", count: 1 },
    ]);
  });

  it("recorta ausências e soma o ponto dentro do período", () => {
    const leaves = [
      { type: "ferias", start_date: "2026-07-25", end_date: "2026-08-10" },
      { type: "folga", start_date: "2026-09-01", end_date: "2026-09-01" },
      { type: "ferias", start_date: "2025-01-01", end_date: "2025-01-10" },
    ];
    expect(leaveDaysByType(leaves, "2026-08-01", today)).toEqual([
      { type: "ferias", days: 10 },
      { type: "folga", days: 1 },
    ]);
    const t = timeByMonth(
      [
        { work_date: "2026-09-02", overtime_minutes: 60, absence_minutes: 0 },
        { work_date: "2026-09-03", overtime_minutes: 30, absence_minutes: 15 },
      ],
      ["2026-09", "2026-10"],
    );
    expect(t).toEqual([
      { period: "2026-09", overtime: 90, absence: 15 },
      { period: "2026-10", overtime: 0, absence: 0 },
    ]);
  });
});

describe("arquivos de relatório", async () => {
  const { tableToCsv } = await import("@/lib/reports/files");
  it("gera CSV pt-BR com datas dd/mm/aaaa, vírgula decimal e proteção de fórmula", () => {
    const csv = tableToCsv({
      title: "T",
      scope: "S",
      columns: [
        { header: "Nome", kind: "text" },
        { header: "Admissão", kind: "date" },
        { header: "Horas", kind: "number" },
      ],
      rows: [["=CMD()", "2026-03-05", 7.5], ["Ana", null, 2]],
    });
    expect(csv).toBe("﻿Nome;Admissão;Horas\r\n'=CMD();05/03/2026;7,5\r\nAna;;2\r\n");
  });
});
