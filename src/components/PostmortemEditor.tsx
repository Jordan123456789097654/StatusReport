"use client";

import { useState } from "react";
import { POSTMORTEM_TEMPLATE, renderMarkdown } from "@/lib/markdown";
import { Button, Checkbox, Textarea } from "./ui";

export function PostmortemEditor({ id, initial, published, action }: { id: string; initial: string; published: boolean; action: (fd: FormData) => void }) {
  const [text, setText] = useState(initial);
  const [tab, setTab] = useState<"write" | "preview">("write");
  return (
    <form action={action} className="space-y-3 p-5">
      <input type="hidden" name="id" value={id} />
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-line-strong p-0.5 text-sm">
          {(["write", "preview"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`cursor-pointer rounded-md px-3 py-1 capitalize ${tab === t ? "bg-white/10" : "text-muted"}`}>
              {t}
            </button>
          ))}
        </div>
        {!text && (
          <button type="button" onClick={() => setText(POSTMORTEM_TEMPLATE)} className="cursor-pointer text-sm text-up hover:underline">
            Insert RCA template
          </button>
        )}
      </div>
      {tab === "write" ? (
        <Textarea name="postmortem" rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the root-cause analysis…" />
      ) : (
        <>
          <input type="hidden" name="postmortem" value={text} />
          <div className="prose-sr min-h-40 rounded-lg border border-line bg-bg p-4 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) || "<p>Nothing to preview</p>" }} />
        </>
      )}
      <div className="flex items-center justify-between">
        <Checkbox name="publish" defaultChecked={published} label="Publish on the status page" />
        <Button variant="primary">Save post-mortem</Button>
      </div>
    </form>
  );
}
