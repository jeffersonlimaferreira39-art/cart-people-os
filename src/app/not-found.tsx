import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <div className="flex max-w-md flex-col gap-3">
        <h1 className="text-[24px] font-semibold">Página não encontrada</h1>
        <Link href="/painel" className="text-accent hover:underline">Ir para o painel</Link>
      </div>
    </div>
  );
}
