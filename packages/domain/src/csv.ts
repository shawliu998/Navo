export function normalizeDomain(value: string) {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  try { return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, ""); }
  catch { return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? raw; }
}

export function dedupeAccountKey(input: { website?: string; companyName: string; country?: string; externalId?: string }) {
  const domain = normalizeDomain(input.website ?? "");
  if (domain) return `domain:${domain}`;
  if (input.externalId) return `external:${input.externalId.trim().toLowerCase()}`;
  return `name-country:${input.companyName.trim().toLowerCase()}:${(input.country ?? "").trim().toLowerCase()}`;
}
