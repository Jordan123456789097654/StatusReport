"use client";

import { Button, Card } from "@/components/ui";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto mt-16 max-w-lg p-7 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted">{error.message || "An unexpected error occurred."}</p>
      {error.digest && <p className="mt-1 font-mono text-xs text-dim">ref {error.digest}</p>}
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
