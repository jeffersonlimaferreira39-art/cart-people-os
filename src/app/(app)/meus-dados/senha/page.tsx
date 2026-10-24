import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Definir senha" };

export default function PasswordPage() {
  return (
    <>
      <PageHeader title="Definir senha" description="Com uma senha, você entra sem precisar do link por e-mail." />
      <PasswordForm />
    </>
  );
}
