"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Notice tone="danger" title="Esta página não carregou.">
        Pode ter sido uma falha de conexão com o banco de dados. Tente novamente; se continuar, informe o código abaixo ao
        suporte.
      </Notice>
      {error.digest ? <p className="tnum text-[13px] text-ink-3">Código: {error.digest}</p> : null}
      <div>
        <Button onClick={reset}>Tentar novamente</Button>
      </div>
    </div>
  );
}
