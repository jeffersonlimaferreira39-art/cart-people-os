import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <h1 className="text-[24px] font-semibold">Não encontramos este registro</h1>
      <p className="text-ink-2">Ele pode ter sido removido ou estar fora das unidades que você acessa.</p>
      <Link href="/painel" className="text-accent hover:underline">Voltar ao painel</Link>
    </div>
  );
}
