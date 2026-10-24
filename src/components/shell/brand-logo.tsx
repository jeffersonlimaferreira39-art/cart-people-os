import Image from "next/image";
import { cn } from "@/components/ui/cn";

/**
 * Logo da C'Art. "brand": sobre o fundo verde (texto branco); "auto": segue o tema
 * da página (texto escuro no claro, branco no escuro).
 */
export function BrandLogo({ variant, className }: { variant: "brand" | "auto"; className?: string }) {
  const size = "w-auto";
  if (variant === "brand") {
    return (
      <Image src="/logo-cart-clara.png" alt="C'Art Ambientações" width={384} height={177} priority className={cn(size, className)} />
    );
  }
  return (
    <>
      <Image src="/logo-cart-escura.png" alt="C'Art Ambientações" width={384} height={177} priority className={cn(size, "dark:hidden", className)} />
      <Image src="/logo-cart-clara.png" alt="" width={384} height={177} className={cn(size, "hidden dark:block", className)} />
    </>
  );
}
