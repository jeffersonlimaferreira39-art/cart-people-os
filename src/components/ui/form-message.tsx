"use client";

import type { ActionState } from "@/lib/actions";
import { Notice } from "./notice";

export function FormMessage({ state }: { state: ActionState }) {
  if (!state?.message) return null;
  return <Notice tone={state.ok ? "ok" : "danger"}>{state.message}</Notice>;
}
