import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { PASSWORD_PATH, PATHNAME_HEADER } from "@/lib/auth/password-gate";

const PUBLIC_PATHS = ["/login", "/auth"];

/** Renova a sessão do Supabase e faz o redirecionamento otimista para o login. */
export async function updateSession(request: NextRequest) {
  request.headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims valida o JWT; não insira código entre a criação do cliente e esta chamada.
  const { data } = await supabase.auth.getClaims();
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!data?.claims && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    if (request.nextUrl.pathname !== "/") login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  // Senha provisória: na abertura de página pelo navegador, leva direto para "Definir senha".
  // Navegação interna (RSC) e Server Actions são barradas pelo getViewer com redirect()
  // do próprio Next: redirecionar essas requisições aqui entregaria o conteúdo de uma
  // página no lugar de outra.
  const appMeta = data?.claims?.app_metadata as { must_change_password?: boolean } | undefined;
  const isDocument = request.method === "GET" && !request.headers.has("rsc") && !request.headers.has("next-action");
  if (appMeta?.must_change_password && isDocument && !isPublic && request.nextUrl.pathname !== PASSWORD_PATH) {
    const target = request.nextUrl.clone();
    target.pathname = PASSWORD_PATH;
    target.search = "";
    // Leva junto os cookies da sessão eventualmente renovada acima.
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
