import Link from "next/link";
import { FadeUp } from "@/components/motion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Link href="/" className="relative mb-8">
        <Logo className="text-lg" size={30} />
      </Link>
      <FadeUp className="relative w-full max-w-sm" y={10}>
        {children}
      </FadeUp>
      <p className="relative mt-8 text-xs text-dim">Know before your users do.</p>
    </div>
  );
}
