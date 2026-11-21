import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="font-mono text-sm text-dim">404</div>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <Link href="/" className="mt-6 text-sm text-muted underline underline-offset-2 hover:text-fg">
        Back to StatusReport
      </Link>
    </div>
  );
}
