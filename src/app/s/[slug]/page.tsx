import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { StatusPage } from "@prisma/client";
import { CustomHtml, StatusPageView } from "@/components/StatusPageView";
import { customHtmlAllowed, getPublicPage, type Access } from "@/lib/publicpage";
import { loadViewData, pageConfig, readSnapshot, type ViewData } from "@/lib/statuspage";
import { googleFontHref } from "@/lib/themes";
import { statusPageBase } from "@/lib/urls";
import { Gate } from "./gate";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const r = await getPublicPage(slug);
    if (!r) return { title: "Status page not found" };
    const base = statusPageBase(r.page);
    return {
      title: { absolute: `${r.page.name} Status` },
      description: r.page.description || `Live status and incident history for ${r.page.name}.`,
      icons: r.page.faviconUrl ? [{ url: r.page.faviconUrl }] : undefined,
      openGraph: { title: `${r.page.name} Status`, images: r.access === "ok" ? [`${base}/og-image`] : [] },
      twitter: { card: "summary_large_image" },
      alternates: { types: { "application/rss+xml": `${base}/feed.rss`, "application/atom+xml": `${base}/feed.atom` } },
    };
  } catch {
    return { title: "Status" };
  }
}

export default async function PublicStatusPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  let page: StatusPage | null = null;
  let access: Access = "ok";
  let data: ViewData | null = null;
  try {
    const r = await getPublicPage(slug);
    if (r) {
      page = r.page;
      access = r.access;
      if (access === "ok") data = await loadViewData(page);
    }
  } catch (e) {
    // Disaster mode: the database is unavailable → serve the worker's last static snapshot.
    const snap = await readSnapshot(slug);
    if (!snap) throw e;
    page = snap.page;
    data = snap.data;
    access = "ok";
  }
  if (!page) notFound();
  if (access !== "ok") {
    const back = slug.startsWith("@") ? "/" : `/s/${slug}`;
    return <Gate page={page} mode={access} back={back} error={sp.error} />;
  }

  const config = pageConfig(page, sp.lang);
  const allow = await customHtmlAllowed(slug);
  const css = page.customCss.replace(/<\/style/gi, "");
  return (
    <>
      <link rel="stylesheet" href={googleFontHref(config.tokens.font)} precedence="default" />
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {allow && page.customHead && <CustomHtml html={page.customHead} />}
      <StatusPageView data={data!} config={config} allowCustomHtml={allow} />
    </>
  );
}
