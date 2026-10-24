import { Notice } from "@/components/ui/notice";
import { signOut } from "../(app)/shell-actions";
import { Button } from "@/components/ui/button";

export default function NoAccessPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <div className="flex max-w-md flex-col gap-4">
        <h1 className="text-[24px] font-semibold">Seu acesso ainda não foi liberado</h1>
        <Notice tone="attention">
          Sua conta existe, mas não tem papel ativo no People OS. Peça ao RH ou ao administrador para concluir sua
          liberação.
        </Notice>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Sair
          </Button>
        </form>
      </div>
    </div>
  );
}
