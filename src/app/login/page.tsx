import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative hidden overflow-hidden bg-brand p-12 text-brand-ink lg:flex lg:flex-col lg:justify-between">
        {/* Planta baixa estilizada: referência ao ofício da C'Art */}
        <svg aria-hidden viewBox="0 0 400 400" className="absolute -top-28 -right-28 size-[520px] opacity-[0.13]">
          <g fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="20" y="20" width="360" height="360" />
            <path d="M20 170h150v210M170 20v90M260 170h120M260 170v80m0 60v70M90 170v-40" />
            <path d="M170 110a60 60 0 0 1 60 60M260 250a60 60 0 0 1 60 60" strokeDasharray="4 6" />
            <rect x="40" y="200" width="100" height="60" rx="6" />
            <rect x="290" y="40" width="70" height="110" rx="4" />
            <circle cx="215" cy="300" r="34" />
          </g>
        </svg>
        <p className="text-[17px] font-semibold">C&apos;Art People OS</p>
        <div className="relative max-w-md">
          <p className="text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">
            Quem faz cada ambiente acontecer, num só lugar.
          </p>
          <p className="mt-4 text-brand-ink-2">
            Cadastro, férias, movimentações do DP e ponto das unidades da C&apos;Art Ambientações.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <p className="mb-8 text-[17px] font-semibold text-ink lg:hidden">C&apos;Art People OS</p>
          <h1 className="text-[26px] font-semibold tracking-[-0.015em]">Entrar</h1>
          <p className="mt-1 mb-7 text-ink-2">Acesso restrito a colaboradores convidados.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
