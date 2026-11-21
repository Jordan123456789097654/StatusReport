// StatusReport's own public status page, served at /status.
// It renders the status page whose slug is PLATFORM_STATUS_SLUG (default "statusreport"),
// created by `npm run db:seed-status`.
import type { Metadata } from "next";
import PublicStatusPage, { generateMetadata as pageMetadata } from "../s/[slug]/page";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;
const slug = () => Promise.resolve({ slug: process.env.PLATFORM_STATUS_SLUG || "statusreport" });

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return pageMetadata({ params: slug(), searchParams });
}

export default async function StatusPage({ searchParams }: { searchParams: SearchParams }) {
  return PublicStatusPage({ params: slug(), searchParams });
}
