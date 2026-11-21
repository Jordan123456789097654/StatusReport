// A real screenshot of the running product, framed like a browser window.
// Files live in /public/screenshots as <name>-light.webp and <name>-dark.webp (see scripts/capture-screenshots.mjs).
import Image from "next/image";

export function Screenshot({ name, alt, priority = false, className = "" }: { name: string; alt: string; priority?: boolean; className?: string }) {
  const common = { alt, width: 1440, height: 900, sizes: "(min-width: 1024px) 560px, 92vw", priority, className: "h-auto w-full" };
  return (
    <div className={`overflow-hidden rounded-xl border border-line-strong bg-card shadow-pop ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-line bg-card-2 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-fg/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-fg/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-fg/15" />
        <span className="ml-3 truncate font-mono text-[11px] text-dim">statusreport.roleflow.site</span>
      </div>
      <Image src={`/screenshots/${name}-light.webp`} {...common} className={`${common.className} dark:hidden`} />
      <Image src={`/screenshots/${name}-dark.webp`} {...common} className={`${common.className} hidden dark:block`} />
    </div>
  );
}
