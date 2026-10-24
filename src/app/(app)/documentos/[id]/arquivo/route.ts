import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Baixa um documento do RH/DP com URL assinada de 60 segundos. A RLS decide se o
 * usuário enxerga o registro; sem registro visível, não há URL.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/documentos/[id]/arquivo">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("org_documents").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Documento não encontrado.", { status: 404 });
  const { data, error } = await supabase.storage.from("org-documents").createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (error || !data) return new NextResponse("Não foi possível gerar o link.", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
