import { parse, type Node } from "node-html-parser";
import { isSameWebsiteDomain } from "./policy";

export type ExtractedLink = { url: URL; score: number; order: number };
export type ExtractedHtml = {
  title: string | null;
  description: string | null;
  text: string;
  links: ExtractedLink[];
};

const removalSelectors = [
  "script", "style", "noscript", "template", "svg", "iframe", "object", "embed", "canvas", "audio", "video",
  "[hidden]", "[aria-hidden='true']",
];
const companyKeywords = ["about", "company", "products", "product", "solutions", "solution", "industries", "industry"];
const contactKeywords = ["management", "leadership", "executive", "board", "team", "people", "contact", "quality", "production", "engineering", "operations", "procurement", "about", "company"];

function cleanText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function visibleText(node: Node): string {
  const pieces: string[] = [];
  const visit = (current: Node) => {
    if (current.nodeType === 3) {
      pieces.push((current as Node & { text: string }).text);
      return;
    }
    current.childNodes.forEach(visit);
  };
  visit(node);
  return pieces.join(" ");
}

function linkScore(url: URL, anchorText: string, focus: "COMPANY" | "CONTACTS"): number {
  const haystack = `${url.pathname} ${anchorText}`.toLowerCase();
  const keywords = focus === "CONTACTS" ? contactKeywords : companyKeywords;
  return keywords.reduce((score, keyword, index) => score + (haystack.includes(keyword) ? keywords.length - index : 0), 0);
}

export function extractWebsiteHtml(html: string, pageUrl: URL, maxTextLength: number, focus: "COMPANY" | "CONTACTS" = "COMPANY"): ExtractedHtml {
  const root = parse(html, { comment: false });
  const title = root.querySelector("title")?.text.trim() || null;
  const description = root.querySelectorAll("meta")
    .find((meta) => meta.getAttribute("name")?.toLowerCase() === "description")
    ?.getAttribute("content")?.trim() || null;

  removalSelectors.forEach((selector) => root.querySelectorAll(selector).forEach((element) => element.remove()));
  root.querySelectorAll("[style]").forEach((element) => {
    const style = element.getAttribute("style")?.replace(/\s+/g, "").toLowerCase() ?? "";
    if (style.includes("display:none") || style.includes("visibility:hidden")) element.remove();
  });

  const links: ExtractedLink[] = [];
  root.querySelectorAll("a[href]").forEach((anchor, order) => {
    const href = anchor.getAttribute("href");
    if (!href) return;
    try {
      const url = new URL(href, pageUrl);
      url.hash = "";
      if (!isSameWebsiteDomain(pageUrl, url) || url.toString() === pageUrl.toString()) return;
      const score = linkScore(url, visibleText(anchor), focus);
      if (score > 0) links.push({ url, score, order });
    } catch {
      // Malformed and non-URL href values are inert data and are ignored.
    }
  });

  const body = root.querySelector("body");
  if (!body) root.querySelector("head")?.remove();
  return {
    title: title ? cleanText(title, 500) : null,
    description: description ? cleanText(description, 1_000) : null,
    text: cleanText(visibleText(body ?? root), maxTextLength),
    links,
  };
}

export function selectPreferredWebsiteLinks(links: ExtractedLink[], limit: number): URL[] {
  const seen = new Set<string>();
  return [...links]
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .filter(({ url }) => {
      const key = url.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ url }) => url);
}
