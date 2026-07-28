import { Building2 } from "lucide-react";

export function CompanyMark({ large = false }: { large?: boolean }) {
  return <span className={`company-mark${large ? " company-mark-large" : ""}`} aria-hidden="true"><Building2 /></span>;
}
