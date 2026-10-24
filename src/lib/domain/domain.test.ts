import { describe, expect, it } from "vitest";
import { addMonths, daysInclusive, isIsoDate, monthBounds } from "./dates";
import { checkVacationRequest } from "./vacation";
import { isValidCpf, isValidPis, maskCpf } from "./documents-br";
import { csvCell, parseCsv, toCsv } from "./csv";
import { can } from "./roles";
import { genericCsvAdapter, parseHours, parseBrDate } from "@/lib/integrations/time-clock";
import { flattenPayload, genericCsvPayrollAdapter } from "@/lib/integrations/payroll";

describe("datas", () => {
  it("conta dias inclusivos e valida ISO", () => {
    expect(daysInclusive("2026-12-07", "2026-12-21")).toBe(15);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });
  it("soma meses respeitando o fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(monthBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});

describe("férias (CLT)", () => {
  const today = "2026-10-23";
  // 2026-12-07 é segunda-feira
  it("aceita 30 dias corridos começando na segunda", () => {
    const r = checkVacationRequest({ request: { start: "2026-12-07", end: "2027-01-05" }, today });
    expect(r.errors).toEqual([]);
  });
  it("recusa parcela menor que 5 dias", () => {
    const r = checkVacationRequest({ request: { start: "2026-12-07", end: "2026-12-10" }, today });
    expect(r.errors.join()).toMatch(/pelo menos 5 dias/);
  });
  it("recusa início na sexta (dois dias antes do domingo)", () => {
    const r = checkVacationRequest({ request: { start: "2026-12-04", end: "2026-12-18" }, today });
    expect(r.errors.join()).toMatch(/repouso semanal/);
  });
  it("recusa início na véspera da véspera de feriado", () => {
    const r = checkVacationRequest({
      request: { start: "2026-12-22", end: "2027-01-05" },
      holidays: ["2026-12-24"],
      today,
    });
    expect(r.errors.join()).toMatch(/feriado/);
  });
  it("exige uma parcela de 14 dias quando não sobra espaço", () => {
    const r = checkVacationRequest({
      request: { start: "2027-03-01", end: "2027-03-10" },
      otherPeriods: [{ start: "2027-01-04", end: "2027-01-13" }],
      today,
    });
    // 10 + 10 usados, restam 10 < 14
    expect(r.errors.join()).toMatch(/14 dias/);
  });
  it("permite primeira parcela curta se ainda cabe uma de 14", () => {
    const r = checkVacationRequest({ request: { start: "2027-01-04", end: "2027-01-13" }, today });
    expect(r.errors).toEqual([]);
  });
  it("limita a 3 parcelas e abono de 10 dias", () => {
    const r = checkVacationRequest({
      request: { start: "2027-06-07", end: "2027-06-11", sellDays: 11 },
      otherPeriods: [
        { start: "2027-01-04", end: "2027-01-17" },
        { start: "2027-03-01", end: "2027-03-05" },
        { start: "2027-04-05", end: "2027-04-09" },
      ],
      today,
    });
    expect(r.errors.join()).toMatch(/no máximo 3 parcelas/);
    expect(r.errors.join()).toMatch(/abono/);
  });
  it("avisa sobre antecedência e prazo concessivo", () => {
    const r = checkVacationRequest({
      request: { start: "2026-11-02", end: "2026-11-16" },
      acquisitionStart: "2024-09-01",
      today,
    });
    expect(r.warnings.join()).toMatch(/30 dias de antecedência/);
    expect(r.warnings.join()).toMatch(/dobro/);
  });
});

describe("documentos", () => {
  it("valida CPF e PIS", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidPis("120.5454.123-0")).toBe(false);
    expect(isValidPis("17033259504")).toBe(true);
  });
  it("mascara CPF", () => {
    expect(maskCpf("52998224725")).toBe("***.982.247-**");
  });
});

describe("CSV", () => {
  it("neutraliza fórmulas e escapa separadores", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-12,5")).toBe("-12,5");
    expect(csvCell('a;"b"')).toBe('"a;""b"""');
  });
  it("faz ida e volta", () => {
    const text = toCsv(["a", "b"], [["x;y", 'z"w']]);
    expect(parseCsv(text)).toEqual([["a", "b"], ["x;y", 'z"w']]);
  });
});

describe("importação de ponto", () => {
  it("interpreta horas e datas", () => {
    expect(parseHours("08:30")).toBe(510);
    expect(parseHours("8,5")).toBe(510);
    expect(parseHours("abc")).toBeNull();
    expect(parseBrDate("31/12/2026")).toBe("2026-12-31");
    expect(parseBrDate("31/02/2026")).toBeNull();
  });
  it("lê o layout padrão e aponta linhas com erro", () => {
    const csv = [
      "Matrícula;Data;Horas Trabalhadas;Horas Extras;Faltas;Adicional Noturno",
      "002;01/11/2026;08:00;01:30;0;0",
      "002;01/11/2026;08:00;0;0;0",
      "003;32/11/2026;08:00;0;0;0",
      ";02/11/2026;08:00;0;0;0",
    ].join("\n");
    const r = genericCsvAdapter.parse(csv);
    expect(r.rows).toEqual([
      {
        registrationNumber: "002",
        workDate: "2026-11-01",
        workedMinutes: 480,
        overtimeMinutes: 90,
        absenceMinutes: 0,
        nightMinutes: 0,
      },
    ]);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });
});

describe("exportação para folha", () => {
  it("gera CSV de movimentações", () => {
    const f = genericCsvPayrollAdapter.buildEvents("2026-11", [
      {
        unitCode: "MTZ",
        registrationNumber: "002",
        fullName: "Colaborador Um",
        cpf: "52998224725",
        type: "alteracao_salarial",
        effectiveDate: "2026-11-01",
        payload: { novo_salario: 4600, motivo: "Promoção" },
        notes: null,
      },
    ]);
    expect(f.fileName).toBe("movimentacoes-2026-11.csv");
    const rows = parseCsv(f.content);
    expect(rows[1]).toEqual([
      "MTZ", "002", "Colaborador Um", "52998224725", "Alteração salarial", "01/11/2026",
      "novo_salario=4600 | motivo=Promoção", "",
    ]);
  });
  it("achata payload ignorando vazios", () => {
    expect(flattenPayload({ a: 1, b: "", c: null })).toBe("a=1");
  });
});

describe("papéis", () => {
  it("gestor decide ausências mas não vê dados sensíveis", () => {
    expect(can(["gestor"], "decideLeaves")).toBe(true);
    expect(can(["gestor"], "viewSensitive")).toBe(false);
    expect(can(["colaborador", "dp"], "exportPayroll")).toBe(true);
  });
});

import { buildPayload, describePayload } from "./dp-events";

describe("movimentações do DP", () => {
  it("valida campos obrigatórios e converte valores", () => {
    const ok = buildPayload("alteracao_salarial", { "payload.novo_salario": "4.600,50", "payload.motivo": "merito" });
    expect(ok).toEqual({ payload: { novo_salario: 4600.5, motivo: "merito" }, errors: {} });
    expect(buildPayload("alteracao_salarial", { "payload.novo_salario": "4600.50", "payload.motivo": "merito" }).payload.novo_salario).toBe(4600.5);
    const bad = buildPayload("desligamento", { "payload.tipo": "inventado" });
    expect(bad.errors["payload.tipo"]).toBeDefined();
    const exp = buildPayload("admissao", { "payload.salario_base": "3000", "payload.experiencia_dias": "120" });
    expect(exp.errors["payload.experiencia_dias"]).toBeDefined();
  });
  it("descreve o payload para leitura", () => {
    expect(describePayload("desligamento", { tipo: "acordo" })).toEqual([["Tipo de desligamento", "Acordo (art. 484-A)"]]);
  });
});
