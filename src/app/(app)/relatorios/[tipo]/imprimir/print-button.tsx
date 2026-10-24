"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Abre a janela de impressão do navegador ("Salvar como PDF"). */
export function PrintButton({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="size-4" strokeWidth={1.75} />
      Salvar em PDF
    </Button>
  );
}
