"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/*
 * Gráficos em SVG próprio. Regras: um eixo só, marcas finas, grade recessiva,
 * cor por série (--series-*), legenda + rótulo direto, tooltip ao passar o mouse
 * e tabela equivalente para leitores de tela.
 */

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const fmt = (n: number) => nf.format(n);

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Escala "bonita" do zero até um teto arredondado, com até 4 marcas. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export type Series = { key: string; label: string; color: string; values: number[] };

const PAD = { top: 16, right: 12, bottom: 26, left: 36 };

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-32 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-surface/95 px-3 py-2 text-[12.5px] shadow-[0_8px_30px_-8px_rgb(0_0_0/0.5)] backdrop-blur"
      style={{ left, top: y - 10 }}
    >
      {children}
    </div>
  );
}

function SwatchRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-ink-2">
        <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-mono font-medium text-ink">{value}</span>
    </div>
  );
}

export function Legend({ series }: { series: Pick<Series, "key" | "label" | "color">[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-3 rounded-[2px]" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Linha com área (evolução no tempo). Crosshair + tooltip no mês sob o cursor. */
export function LineChart({
  labels,
  series,
  height = 220,
  unit = "",
}: {
  labels: string[];
  series: Series[];
  height?: number;
  unit?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const w = Math.max(width - PAD.left - PAD.right, 1);
  const h = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (labels.length <= 1 ? w / 2 : (i / (labels.length - 1)) * w);
  const y = (v: number) => PAD.top + h - (v / top) * h;
  const every = Math.ceil(labels.length / Math.max(1, Math.floor(w / 56)));

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 ? (
        <svg width={width} height={height} aria-hidden className="block overflow-visible">
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`area-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + w} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 font-mono text-[10.5px]">
                {fmt(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % every === 0 || i === labels.length - 1 ? (
              <text key={l + i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-ink-3 font-mono text-[10.5px]">
                {l}
              </text>
            ) : null,
          )}
          {series.map((s) => {
            const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
            return (
              <g key={s.key}>
                <path d={`M${pts.join("L")}L${x(s.values.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#area-${s.key})`} />
                <path
                  d={`M${pts.join("L")}`}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 6px ${s.color})` }}
                />
                <circle cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1] ?? 0)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              </g>
            );
          })}
          {hover !== null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + h} stroke="var(--line-strong)" strokeDasharray="3 3" />
              {series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          ) : null}
          {labels.map((l, i) => (
            <rect
              key={`hit-${l}-${i}`}
              x={x(i) - w / Math.max(labels.length - 1, 1) / 2}
              y={PAD.top}
              width={w / Math.max(labels.length - 1, 1)}
              height={h}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {hover !== null && width > 0 ? (
        <Tooltip x={x(hover)} y={Math.min(...series.map((s) => y(s.values[hover])))} width={width}>
          <p className="mb-1 font-mono text-[11px] text-ink-3 uppercase">{labels[hover]}</p>
          {series.map((s) => (
            <SwatchRow key={s.key} color={s.color} label={s.label} value={`${fmt(s.values[hover])}${unit}`} />
          ))}
        </Tooltip>
      ) : null}
    </div>
  );
}

/** Colunas agrupadas (ex.: admissões × desligamentos por mês). */
export function ColumnChart({ labels, series, height = 220 }: { labels: string[]; series: Series[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const w = Math.max(width - PAD.left - PAD.right, 1);
  const h = height - PAD.top - PAD.bottom;
  const band = w / Math.max(labels.length, 1);
  const gap = 2;
  const barW = Math.max(3, Math.min(18, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);
  const y = (v: number) => PAD.top + h - (v / top) * h;
  const every = Math.ceil(labels.length / Math.max(1, Math.floor(w / 44)));

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 ? (
        <svg width={width} height={height} aria-hidden className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + w} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 font-mono text-[10.5px]">
                {fmt(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            const gx = PAD.left + i * band + (band - groupW) / 2;
            return (
              <g key={l + i} opacity={hover === null || hover === i ? 1 : 0.45}>
                {hover === i ? <rect x={PAD.left + i * band} y={PAD.top} width={band} height={h} fill="var(--accent)" opacity={0.06} /> : null}
                {series.map((s, si) => {
                  const v = s.values[i];
                  const bh = Math.max(0, y(0) - y(v));
                  const bx = gx + si * (barW + gap);
                  const r = Math.min(4, barW / 2, bh);
                  return v > 0 ? (
                    <path
                      key={s.key}
                      d={`M${bx},${y(0)}V${y(v) + r}Q${bx},${y(v)} ${bx + r},${y(v)}H${bx + barW - r}Q${bx + barW},${y(v)} ${bx + barW},${y(v) + r}V${y(0)}Z`}
                      fill={s.color}
                    />
                  ) : (
                    <rect key={s.key} x={bx} y={y(0) - 1} width={barW} height={1} fill={s.color} opacity={0.5} />
                  );
                })}
                {i % every === 0 || i === labels.length - 1 ? (
                  <text x={PAD.left + i * band + band / 2} y={height - 6} textAnchor="middle" className="fill-ink-3 font-mono text-[10.5px]">
                    {l}
                  </text>
                ) : null}
                <rect x={PAD.left + i * band} y={PAD.top} width={band} height={h + 20} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {hover !== null && width > 0 ? (
        <Tooltip x={PAD.left + hover * band + band / 2} y={y(Math.max(...series.map((s) => s.values[hover])))} width={width}>
          <p className="mb-1 font-mono text-[11px] text-ink-3 uppercase">{labels[hover]}</p>
          {series.map((s) => (
            <SwatchRow key={s.key} color={s.color} label={s.label} value={fmt(s.values[hover])} />
          ))}
        </Tooltip>
      ) : null}
    </div>
  );
}

/** Barras horizontais de magnitude, com valor e participação em rótulo direto. */
export function BarList({
  items,
  color = "var(--series-1)",
  unit = "",
  limit = 8,
}: {
  items: { label: string; value: number }[];
  color?: string;
  unit?: string;
  limit?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const shown = items.length > limit
    ? [...items.slice(0, limit - 1), { label: `Outros (${items.length - limit + 1})`, value: items.slice(limit - 1).reduce((a, b) => a + b.value, 0) }]
    : items;
  const max = Math.max(1, ...shown.map((i) => i.value));
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <ul className="flex flex-col gap-2.5" onMouseLeave={() => setHover(null)}>
      {shown.map((item) => (
        <li
          key={item.label}
          className={cn("grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3 text-[13px] transition-opacity", hover && hover !== item.label && "opacity-50")}
          onMouseEnter={() => setHover(item.label)}
          title={`${item.label}: ${fmt(item.value)}${unit}`}
        >
          <span className="truncate text-ink-2">{item.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span
              className="block h-full rounded-full transition-[width] duration-500 dark:shadow-[0_0_10px_currentColor]"
              style={{ width: `${(item.value / max) * 100}%`, background: color, color }}
            />
          </span>
          <span className="min-w-16 text-right font-mono text-[12.5px] text-ink">
            {fmt(item.value)}
            {unit}
            <span className="ml-1.5 text-ink-3">{Math.round((item.value / total) * 100)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Tabela equivalente ao gráfico (acessibilidade e conferência dos números). */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="group mt-3 text-[12.5px]">
      <summary className="eyebrow w-fit cursor-pointer list-none text-ink-3 hover:text-accent">
        <span className="group-open:hidden">Ver tabela</span>
        <span className="hidden group-open:inline">Ocultar tabela</span>
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className="border-b border-line px-2 py-1.5 text-left font-medium text-ink-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-b-0">
                {r.map((c, j) => (
                  <td key={j} className={cn("px-2 py-1.5 text-ink", j > 0 && "font-mono")}>
                    {typeof c === "number" ? fmt(c) : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
