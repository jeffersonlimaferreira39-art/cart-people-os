"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { ask } from "./actions";

type Turn = { role: "user" | "assistant"; content: string; error?: boolean };

export function AssistantChat({ suggestions }: { suggestions: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  function send(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    const history = turns.filter((t) => !t.error).map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: "user", content: q }]);
    setText("");
    start(async () => {
      const r = await ask({ question: q, history });
      setTurns((t) => [...t, r.ok ? { role: "assistant", content: r.answer } : { role: "assistant", content: r.error, error: true }]);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {turns.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-3">Experimente perguntar:</p>
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-sm text-ink-2 hover:border-line-strong hover:text-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-4" aria-live="polite">
        {turns.map((t, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[75ch] rounded-[var(--radius-panel)] px-4 py-3 text-[15px] whitespace-pre-line",
              t.role === "user" ? "self-end bg-accent-soft text-ink" : "border border-line bg-surface text-ink",
              t.error && "border-danger/40 bg-danger-soft",
            )}
          >
            {t.content}
          </div>
        ))}
        {pending ? (
          <div className="flex items-center gap-2 text-sm text-ink-3" role="status">
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            Consultando os dados…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="sticky bottom-4 flex items-end gap-2 rounded-[var(--radius-panel)] border border-line-strong bg-surface p-2 shadow-[0_8px_24px_-12px_rgba(23,32,30,0.25)]"
      >
        <label className="flex-1">
          <span className="sr-only">Pergunta</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={1}
            maxLength={1000}
            placeholder="Pergunte sobre quadro, ausências, movimentações ou ponto"
            className="max-h-40 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent text-accent-ink hover:bg-accent-hover disabled:opacity-40"
          aria-label="Enviar pergunta"
        >
          <ArrowUp className="size-5" />
        </button>
      </form>
    </div>
  );
}
