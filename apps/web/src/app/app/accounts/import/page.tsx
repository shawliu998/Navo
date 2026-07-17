import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@navo/ui";
import { CsvImporter } from "@/components/csv-importer";

export default function AccountsImportPage() { return <div className="page"><Link href="/app/accounts" className="muted" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 12 }}><ArrowLeft size={14} />Back to Accounts</Link><PageHeader eyebrow="CSV IMPORT" title="Import target accounts" description="Map columns, preview normalized data and deduplicate by domain, external ID or company name + country." /><CsvImporter /></div>; }
