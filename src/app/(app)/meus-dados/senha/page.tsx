import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Definir senha" };

export default function PasswordPage() {
  return (
    <Suspense fallback={<PageHeader title="Definir senha" description="Com uma senha, você entra sem precisar do link por e-mail." />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const forced = !!(data?.claims?.app_metadata as { must_change_password?: boolean } | undefined)?.must_change_password;
  return (
    <>
      {forced ? (
        <PageHeader title="Crie a sua senha" description="Você entrou com uma senha provisória criada pelo administrador. Para continuar, defina uma senha só sua." />
      ) : (
        <PageHeader title="Definir senha" description="Com uma senha, você entra sem precisar do link por e-mail." />
      )}
      <PasswordForm />
    </>
  );
}
