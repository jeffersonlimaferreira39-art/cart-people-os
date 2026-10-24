"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function DecisionControls({ action }: { action: (s: ActionState, f: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, null);
  const [rejecting, setRejecting] = useState(false);
  if (state?.ok) return <span className="text-sm text-accent">{state.message}</span>;
  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
      {rejecting ? (
        <>
          <label className="w-56">
            <span className="sr-only">Motivo da recusa</span>
            <Input name="note" placeholder="Motivo da recusa" required autoFocus />
          </label>
          <SubmitButton name="decision" value="rejected" variant="danger" size="sm" pendingLabel="Recusando…">
            Confirmar recusa
          </SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>Voltar</Button>
        </>
      ) : (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => setRejecting(true)}>Recusar</Button>
          <SubmitButton name="decision" value="approved" size="sm" pendingLabel="Aprovando…">Aprovar</SubmitButton>
        </>
      )}
      {state && !state.ok ? <p className="w-full text-right text-[13px] text-danger">{state.message}</p> : null}
    </form>
  );
}
