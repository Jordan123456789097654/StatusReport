import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, Card, Field, Flash, Input } from "@/components/ui";
import { OAuthButtons } from "@/components/OAuthButtons";
import { getSession } from "@/lib/auth";
import { login } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const s = await getSession();
  if (s && !s.pending2fa) redirect("/dashboard");
  const sp = await searchParams;
  return (
    <Card className="p-7">
      <h1 className="text-xl font-semibold">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Sign in to your StatusReport workspace.</p>
      <Flash error={sp.error} ok={sp.ok} />
      <OAuthButtons />
      <form action={login} className="space-y-4">
        <Field label="Email">
          <Input name="email" type="email" required autoComplete="email" autoFocus />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" required autoComplete="current-password" />
        </Field>
        <Button variant="primary" className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        No account?{" "}
        <Link href="/register" className="text-fg underline underline-offset-2">
          Create one, it&apos;s free
        </Link>
      </p>
    </Card>
  );
}
