// Pixel-faithful-ish rendering of a Discord webhook message (dark theme).
import { ExternalLink } from "lucide-react";
import type { DiscordPayload } from "@/lib/notify/discord";

const md = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```([\s\S]*?)```/g, '<pre class="my-1 rounded bg-[#2b2d31] p-2 font-mono text-[12px] whitespace-pre-wrap">$1</pre>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-[#2b2d31] px-1 font-mono text-[12.5px]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<span class="text-[#00a8fc]">$1</span>')
    .replace(/&lt;@&amp;?(\d+)&gt;/g, '<span class="rounded bg-[#5865f2]/30 px-0.5 text-[#c9cdfb]">@role</span>')
    .replace(/\n/g, "<br/>");

export function DiscordPreview({ payload }: { payload: DiscordPayload }) {
  const color = (n?: number) => (n == null ? "#1e1f22" : `#${n.toString(16).padStart(6, "0")}`);
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="rounded-lg bg-[#313338] p-4 font-[system-ui] text-[15px] leading-[1.375] text-[#dbdee1]">
      <div className="flex gap-4">
        {payload.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={payload.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#22C55E]/20">
            <span className="h-3 w-3 rounded-full bg-[#22C55E]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-white">{payload.username || "StatusReport"}</span>
            <span className="rounded bg-[#5865f2] px-1 text-[10px] font-semibold leading-4 text-white">APP</span>
            <span className="text-xs text-[#949ba4]">Today at {time}</span>
          </div>
          {payload.content && <div className="mt-0.5" dangerouslySetInnerHTML={{ __html: md(payload.content) }} />}
          {payload.embeds?.map((e, i) => (
            <div key={i} className="mt-1.5 max-w-[520px] rounded border-l-4 bg-[#2b2d31] py-2 pl-3 pr-4" style={{ borderLeftColor: color(e.color) }}>
              {e.title && <div className="font-semibold text-white" dangerouslySetInnerHTML={{ __html: md(e.title) }} />}
              {e.description && <div className="mt-1 text-sm" dangerouslySetInnerHTML={{ __html: md(e.description) }} />}
              {!!e.fields?.length && (
                <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2">
                  {e.fields.map((f, j) => (
                    <div key={j} className={f.inline ? "col-span-1" : "col-span-3"}>
                      <div className="text-sm font-semibold text-white">{f.name}</div>
                      <div className="text-sm" dangerouslySetInnerHTML={{ __html: md(f.value) }} />
                    </div>
                  ))}
                </div>
              )}
              {(e.footer || e.timestamp) && (
                <div className="mt-2 text-xs text-[#949ba4]">
                  {e.footer?.text}
                  {e.footer && e.timestamp ? " • " : ""}
                  {e.timestamp ? `Today at ${time}` : ""}
                </div>
              )}
            </div>
          ))}
          {payload.components?.map((row, i) => (
            <div key={i} className="mt-2 flex flex-wrap gap-2">
              {row.components.map((b, j) => (
                <span key={j} className="inline-flex items-center gap-1.5 rounded bg-[#4e5058] px-4 py-[5px] text-sm font-medium text-white">
                  {b.label} <ExternalLink size={13} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
