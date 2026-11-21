import { Button, Card, Field, Flash, Input } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createWorkspace } from "../actions";

export const metadata = { title: "Create a workspace" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  return (
    <Card className="p-7">
      <h1 className="text-xl font-semibold">Create a workspace</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Workspaces hold your monitors, status pages and team.</p>
      <Flash error={sp.error} />
      <form action={createWorkspace} className="space-y-4">
        <Field label="Workspace name">
          <Input name="name" required placeholder="Acme Inc" autoFocus />
        </Field>
        <Button variant="primary" className="w-full">
          Continue
        </Button>
      </form>
    </Card>
  );
}
