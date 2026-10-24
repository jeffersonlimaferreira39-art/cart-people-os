"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { NavLinks, type NavGroup } from "./nav-links";
import { BrandLogo } from "./brand-logo";

export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);

  // Fecha com Esc e trava a rolagem do fundo enquanto aberto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-ink-2 hover:bg-surface-2"
        aria-label="Abrir menu"
        aria-expanded={open}
      >
        <Menu className="size-5" strokeWidth={1.75} />
      </button>
      {open
        ? createPortal(
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex w-[280px] max-w-[85vw] flex-col gap-6 overflow-y-auto bg-brand p-4">
            <div className="flex items-center justify-between">
              <BrandLogo variant="brand" className="h-8" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-brand-ink hover:bg-white/10"
                aria-label="Fechar menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
          </div>
          <button type="button" aria-label="Fechar menu" className="flex-1 bg-black/40" onClick={() => setOpen(false)} />
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}
