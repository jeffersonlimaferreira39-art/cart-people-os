import { describe, expect, it } from "vitest";
import { diffGrid, parseGridNumber } from "./payroll-grid";

describe("digitação de folha", () => {
  it("lê números no formato brasileiro e recusa inválidos", () => {
    expect(parseGridNumber("1.234,56")).toBe(1234.56);
    expect(parseGridNumber("12,5")).toBe(12.5);
    expect(parseGridNumber("7.5")).toBe(7.5);
    expect(parseGridNumber(" R$ 300 ")).toBe(300);
    expect(parseGridNumber("")).toBeNull();
    expect(() => parseGridNumber("abc")).toThrow(/inválido/);
    expect(() => parseGridNumber("-3")).toThrow(/inválido/);
  });

  it("aponta só as células alteradas; zerar ou esvaziar remove o lançamento", () => {
    const saved = { a: { HE50: 10, COMISSAO: 500 }, b: { FALTA_DIAS: 1 } };
    const edited = { a: { HE50: 10, COMISSAO: 650, ADIANTAMENTO: 400 }, b: { FALTA_DIAS: 0 }, c: { VT_DIAS: 18 } };
    expect(diffGrid(saved, edited)).toEqual([
      { employee_id: "a", code: "COMISSAO", value: 650 },
      { employee_id: "a", code: "ADIANTAMENTO", value: 400 },
      { employee_id: "b", code: "FALTA_DIAS", value: null },
      { employee_id: "c", code: "VT_DIAS", value: 18 },
    ]);
    expect(diffGrid(saved, saved)).toEqual([]);
  });
});
