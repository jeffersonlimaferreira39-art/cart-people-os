import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { BrandLogo } from "@/components/shell/brand-logo";
import { MobileMenu, OrgName, SidebarNav, UnitPicker, UserBlock } from "./shell";

function NavFallback() {
  return (
    <div className="flex flex-col gap-2 px-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-7 animate-pulse rounded bg-white/8" />
      ))}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[252px_minmax(0,1fr)] lg:bg-[linear-gradient(90deg,var(--brand)_252px,var(--bg)_252px)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto bg-brand px-3 py-5 lg:flex">
        <div className="px-3">
          <BrandLogo variant="brand" className="h-10" />
          <p className="mt-2 text-[13px] font-semibold text-brand-ink">People OS</p>
          <p className="mt-0.5 text-[12.5px] text-brand-ink-2">
            <Suspense fallback="Carregando…">
              <OrgName />
            </Suspense>
          </p>
        </div>
        <div className="flex-1">
          <Suspense fallback={<NavFallback />}>
            <SidebarNav />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <UserBlock />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
          <Suspense fallback={<div className="size-9 lg:hidden" />}>
            <MobileMenu />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-5 w-40" />}>
            <UnitPicker />
          </Suspense>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
