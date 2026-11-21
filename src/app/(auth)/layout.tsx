import Link from "next/link";
import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,197,94,0.10),transparent_60%)]" />
      <Link href="/" className="relative mb-8">
        <Logo className="text-lg" />
      </Link>
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}
