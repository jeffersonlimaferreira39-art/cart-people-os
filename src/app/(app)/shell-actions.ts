"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ALL_UNITS, UNIT_COOKIE, getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { recordAccess } from "@/lib/auth/access-log";

export async function selectUnit(unitId: string) {
  const viewer = await getViewer();
  const valid = unitId === ALL_UNITS || viewer.units.some((u) => u.id === unitId);
  if (!valid) return;
  (await cookies()).set(UNIT_COOKIE, unitId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  refresh();
}

export async function signOut() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  await supabase.auth.signOut();
  await recordAccess(data?.claims.email as string | undefined, "logout");
  redirect("/login");
}
