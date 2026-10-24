import { describe, expect, it } from "vitest";
import { canMove, checklistProgress, funnel } from "./recruitment";

describe("contratação", () => {
  it("contratado só pela ação de contratar; contratado não volta ao funil", () => {
    expect(canMove("triagem", "entrevista")).toEqual({ ok: true });
    expect(canMove("reprovado", "triagem")).toEqual({ ok: true });
    expect(canMove("aprovado", "contratado").ok).toBe(false);
    expect(canMove("contratado", "triagem").ok).toBe(false);
    expect(canMove("teste", "teste").ok).toBe(false);
  });

  it("funil conta etapas, ativos e taxa de contratação entre os decididos", () => {
    const f = funnel([{ stage: "triagem" }, { stage: "triagem" }, { stage: "proposta" }, { stage: "contratado" }, { stage: "reprovado" }, { stage: "reprovado" }, { stage: "desistiu" }]);
    expect(f.counts.triagem).toBe(2);
    expect(f).toMatchObject({ active: 3, total: 7, hireRate: 25 });
    expect(funnel([]).hireRate).toBeNull();
  });

  it("progresso do checklist", () => {
    expect(checklistProgress([{ done: true }, { done: false }, { done: true }, { done: true }])).toEqual({ done: 3, total: 4, pct: 75, complete: false });
    expect(checklistProgress([{ done: true }]).complete).toBe(true);
    expect(checklistProgress([]).complete).toBe(false);
  });
});
