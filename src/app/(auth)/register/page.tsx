import Link from "next/link";
import { Button, Card, Field, Flash, Input } from "@/components/ui";
import { OAuthButtons } from "@/components/OAuthButtons";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { register } from "../actions";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; invite?: string }> }) {
  const sp = await searchParams;
  const invite = sp.invite ? await db.invite.findUnique({ where: { token: sp.invite }, include: { workspace: true } }) : null;
  const closed = !env.saasMode && (await db.user.count()) > 0 && !invite;
  return (
    <Card className="p-7">
      <h1 className="text-xl font-semibold">{invite ? `Join ${invite.workspace.name}` : "Create your free account"}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Unlimited monitors, status pages and team members. Free forever.</p>
      <Flash error={sp.error} />
      {closed ? (
        <p className="text-sm text-muted">Registration is closed on this self-hosted instance. Ask an administrator for an invite link.</p>
      ) : (
        <>
          {!invite && <OAuthButtons />}
          <form action={register} className="space-y-4">
            <input type="hidden" name="invite" value={sp.invite || ""} />
            <Field label="Name">
              <Input name="name" autoComplete="name" />
            </Field>
            <Field label="Work email">
              <Input name="email" type="email" required autoComplete="email" defaultValue={invite?.email} />
            </Field>
            <Field label="Password" hint="At least 8 characters">
              <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            {!invite && (
              <Field label="Workspace name" hint="Your company or project">
                <Input name="workspace" placeholder="Acme Inc" />
              </Field>
            )}
            <Button variant="primary" className="w-full">
              Create account
            </Button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-fg underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
