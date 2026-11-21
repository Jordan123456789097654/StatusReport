import { redirect } from "next/navigation";
import { Button, Card, Field, Flash, Input } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { logout, verify2fa } from "../../actions";

export const metadata = { title: "Two-factor authentication" };

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.pending2fa) redirect("/dashboard");
  const sp = await searchParams;
  return (
    <Card className="p-7">
      <h1 className="text-xl font-semibold">Two-factor authentication</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Enter the 6-digit code from your authenticator app.</p>
      <Flash error={sp.error} />
      <form action={verify2fa} className="space-y-4">
        <Field label="Authentication code">
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus className="text-center font-mono text-lg tracking-[0.4em]" />
        </Field>
        <Button variant="primary" className="w-full">
          Verify
        </Button>
      </form>
      <form action={logout} className="mt-4 text-center">
        <button className="cursor-pointer text-sm text-muted hover:text-fg">Use a different account</button>
      </form>
    </Card>
  );
}
