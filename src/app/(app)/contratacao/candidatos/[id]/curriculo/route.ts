import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Currículo do candidato por URL assinada de 60 s; a RLS decide se o registro é visível. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/contratacao/candidatos/[id]/curriculo">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("candidates").select("resume_path, resume_name").eq("id", id).maybeSingle();
  if (!c?.resume_path) return new NextResponse("Currículo não encontrado.", { status: 404 });
  const { data, error } = await supabase.storage.from("recruitment").createSignedUrl(c.resume_path, 60, { download: c.resume_name ?? "curriculo" });
  if (error || !data) return new NextResponse("Não foi possível gerar o link.", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
