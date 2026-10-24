"use client";

import { useActionState, useRef, useEffect } from "react";
import type { ActionState } from "@/lib/actions";
import { DOCUMENT_CATEGORY_LABELS } from "@/lib/format";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

export function DocumentUpload({ action }: { action: (s: ActionState, f: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3 border-t border-line p-4">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_160px_auto] sm:items-end">
        <Field label="Arquivo (PDF, JPG ou PNG até 4 MB)" name="file">
          <Input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required className="h-auto py-1.5" />
        </Field>
        <Field label="Categoria" name="category">
          <Select name="category" defaultValue="documento_pessoal">
            {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Vencimento" name="expires_at">
          <Input type="date" name="expires_at" />
        </Field>
        <SubmitButton variant="secondary" pendingLabel="Enviando…">Enviar documento</SubmitButton>
      </div>
    </form>
  );
}
