import { readFile } from "node:fs/promises";
import { extractWebsiteHtml } from "./extract";
import type { WebsiteResearchData } from "./schemas";

export function isLocalDemoWebsite(websiteUrl: string) {
  try {
    const hostname = new URL(websiteUrl).hostname.toLowerCase();
    return hostname.endsWith("-demo.example") || hostname === "demo.example";
  } catch {
    return false;
  }
}
export async function loadLocalWebsiteResearchFixture(accountId: string, websiteUrl: string, now = new Date(), options: { allowAnyBase?: boolean; accountName?: string } = {}): Promise<WebsiteResearchData> {
  if (!options.allowAnyBase && !isLocalDemoWebsite(websiteUrl)) throw new Error("LOCAL_WEBSITE_FIXTURE_NOT_AVAILABLE: This URL is not a seeded demo website.");
  const base = new URL(websiteUrl);
  const homeUrl = new URL("/", base);
  const aboutUrl = new URL("/about", base);
  const [homeTemplate, aboutTemplate] = await Promise.all([
    readFile(new URL("./fixtures/atlas-industrial.html", import.meta.url), "utf8"),
    readFile(new URL("./fixtures/atlas-about.html", import.meta.url), "utf8"),
  ]);
  const accountName = options.accountName?.trim();
  const escapedName = accountName?.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const renderAccount = (html: string) => escapedName ? html.replaceAll("Atlas Industrial Systems", escapedName).replace(/\bAtlas\b/g, escapedName) : html;
  const homeHtml = renderAccount(homeTemplate);
  const aboutHtml = renderAccount(aboutTemplate);
  const fetchedAt = now.toISOString();
  const pages = [[homeHtml, homeUrl], [aboutHtml, aboutUrl]].map(([html, url]) => {
    const extracted = extractWebsiteHtml(html as string, url as URL, 20_000);
    return { url: (url as URL).toString(), title: extracted.title, description: extracted.description, text: extracted.text, fetchedAt, contentTrust: "untrusted" as const };
  });
  return { accountId, inputUrl: websiteUrl, finalUrl: homeUrl.toString(), fetchedAt, pages };
}
