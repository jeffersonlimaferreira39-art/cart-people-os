"use client";

import { useMemo, useState, useTransition, type ClipboardEvent, type KeyboardEvent } from "react";
import { GRID_CODES, GRID_SHORT_LABELS, diffGrid, parseGridNumber, type GridCode, type GridValues } from "@/lib/domain/payroll-grid";
import type { ActionState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/components/ui/cn";

type Employee = { id: string; full_name: string; registration_number: string; unit_code: string };

const fmt = (v: number | undefined) => (v === undefined || v === 0 ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

export function PayrollGrid({
  employees,
  saved,
  ponto,
  save,
}: {
  employees: Employee[];
  saved: GridValues;
  ponto: GridValues;
  save: (changesJson: string) => Promise<ActionState>;
}) {
  // Texto digitado por célula (chave "empregado:código"); o número só é lido ao salvar.
  const [text, setText] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  const key = (id: string, code: GridCode) => `${id}:${code}`;
  const cellText = (id: string, code: GridCode) => text[key(id, code)] ?? fmt(saved[id]?.[code]);

  const { edited, invalid } = useMemo(() => {
    const out: GridValues = {};
    const bad = new Set<string>();
    for (const [k, v] of Object.entries(text)) {
      const [id, code] = k.split(":") as [string, GridCode];
      try {
        (out[id] ??= {})[code] = parseGridNumber(v) ?? 0;
      } catch {
        bad.add(k);
      }
    }
    // Começa do salvo e aplica o que foi digitado.
    const merged: GridValues = {};
    for (const e of employees) merged[e.id] = { ...saved[e.id], ...out[e.id] };
    return { edited: merged, invalid: bad };
  }, [text, saved, employees]);
  const changes = useMemo(() => diffGrid(saved, edited), [saved, edited]);
  const changedKeys = new Set(changes.map((c) => key(c.employee_id, c.code)));

  const visible = employees.filter((e) => {
    const q = filter.trim().toLowerCase();
    return !q || e.full_name.toLowerCase().includes(q) || e.registration_number.includes(q);
  });

  function onKey(e: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    const move = (r: number, c: number) => document.getElementById(`cell-${r}-${c}`)?.focus();
    if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); move(row + 1, col); }
    if (e.key === "ArrowUp") { e.preventDefault(); move(row - 1, col); }
  }

  /** Colar bloco do Excel: linhas por \n, colunas por \t, a partir da célula focada. */
  function onPaste(e: ClipboardEvent<HTMLInputElement>, row: number, col: number) {
    const data = e.clipboardData.getData("text");
    if (!data.includes("\t") && !data.includes("\n")) return;
    e.preventDefault();
    const next = { ...text };
    data.replace(/\r/g, "").split("\n").filter((l, i, a) => l !== "" || i < a.length - 1).forEach((line, dr) => {
      line.split("\t").forEach((val, dc) => {
        const emp = visible[row + dr];
        const code = GRID_CODES[col + dc];
        if (emp && code) next[key(emp.id, code)] = val.trim();
      });
    });
    setText(next);
  }

  function submit() {
    setState(null);
    start(async () => {
      const r = await save(JSON.stringify(changes));
      setState(r);
      if (r?.ok) setText({});
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar por nome ou matrícula"
          className="h-9 w-72 rounded-[var(--radius-control)] border border-line-strong bg-surface/80 px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        <p className="text-[12.5px] text-ink-3">
          Enter desce para a próxima linha. Cole um bloco do Excel numa célula para preencher várias de uma vez. Célula vazia ou 0 remove o lançamento.
        </p>
      </div>

      <div className="glass max-h-[65vh] overflow-auto rounded-[var(--radius-panel)] border border-line">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th scope="col" className="eyebrow sticky left-0 z-20 border-b border-line bg-surface px-3 py-2.5 text-left !text-[10.5px] text-ink-3">Colaborador</th>
              {GRID_CODES.map((c) => (
                <th key={c} scope="col" className="eyebrow border-b border-line px-1.5 py-2.5 text-right !text-[10px] whitespace-nowrap text-ink-3">{GRID_SHORT_LABELS[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((e, r) => (
              <tr key={e.id} className="border-b border-line last:border-b-0">
                <th scope="row" className="sticky left-0 z-[5] bg-surface px-3 py-1.5 text-left font-normal whitespace-nowrap">
                  <span className="block text-ink">{e.full_name}</span>
                  <span className="text-[11.5px] text-ink-3">{e.registration_number} · {e.unit_code}</span>
                </th>
                {GRID_CODES.map((code, c) => {
                  const k = key(e.id, code);
                  const sug = ponto[e.id]?.[code];
                  return (
                    <td key={code} className="px-1 py-1">
                      <input
                        id={`cell-${r}-${c}`}
                        inputMode="decimal"
                        aria-label={`${GRID_SHORT_LABELS[code]} de ${e.full_name}`}
                        value={cellText(e.id, code)}
                        placeholder={sug ? `${fmt(sug)} ponto` : ""}
                        onChange={(ev) => setText({ ...text, [k]: ev.target.value })}
                        onKeyDown={(ev) => onKey(ev, r, c)}
                        onPaste={(ev) => onPaste(ev, r, c)}
                        className={cn(
                          "h-8 w-[5.5rem] rounded-[6px] border bg-surface/70 px-2 text-right font-mono text-[12.5px] text-ink placeholder:text-[10.5px] placeholder:text-ink-3/70 focus:border-accent focus:outline-none",
                          invalid.has(k) ? "border-danger" : changedKeys.has(k) ? "border-brass bg-brass-soft/40" : "border-line",
                        )}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-line-strong bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="text-sm">
          {invalid.size ? (
            <span className="text-danger">{invalid.size} célula(s) com valor inválido</span>
          ) : changes.length ? (
            <span className="text-ink"><b className="font-mono">{changes.length}</b> alteração(ões) não salva(s)</span>
          ) : (
            <span className="text-ink-3">Nenhuma alteração pendente</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {changes.length ? <Button type="button" variant="ghost" onClick={() => setText({})} disabled={pending}>Descartar</Button> : null}
          <Button type="button" onClick={submit} disabled={pending || !changes.length || invalid.size > 0}>
            {pending ? "Salvando…" : "Salvar lançamentos"}
          </Button>
        </div>
      </div>
      {state?.message ? <Notice tone={state.ok ? "ok" : "danger"}>{state.message}</Notice> : null}
    </div>
  );
}
