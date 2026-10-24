import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmSession } from "./confirm-session";

export const metadata: Metadata = { title: "Entrando" };

export default function ConfirmPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <p className="text-ink-2">Entrando…</p>
      <Suspense>
        <ConfirmSession />
      </Suspense>
    </div>
  );
}
