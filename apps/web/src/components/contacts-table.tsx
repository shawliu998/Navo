"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { StatusBadge } from "@navo/ui";

export type ContactRow = {
  id: string;
  accountId: string;
  accountName: string;
  name: string;
  title: string | null;
  persona: string | null;
  email: string | null;
  emailVerification: string;
  status: string;
  source: string;
  suppressed: boolean;
};

type ContactFilter = "ALL" | "VERIFIED" | "NEEDS_VERIFICATION" | "SUPPRESSED";

export function ContactsTable({ rows }: { rows: ContactRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ContactFilter>("ALL");
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !needle || [row.name, row.accountName, row.title, row.persona, row.email]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(needle));
      const matchesFilter = filter === "ALL"
        || (filter === "VERIFIED" && row.emailVerification === "VERIFIED" && !row.suppressed)
        || (filter === "NEEDS_VERIFICATION" && ["UNVERIFIED", "UNKNOWN"].includes(row.emailVerification) && !row.suppressed)
        || (filter === "SUPPRESSED" && row.suppressed);
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, rows]);

  return <>
    <div className="toolbar">
      <div className="toolbar-group">
        <label className="input-wrap">
          <Search size={15} />
          <input className="input input-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts, accounts or roles…" aria-label="Search contacts" />
        </label>
        <select className="input" value={filter} onChange={(event) => setFilter(event.target.value as ContactFilter)} aria-label="Contact verification filter">
          <option value="ALL">All contacts</option>
          <option value="VERIFIED">Verified</option>
          <option value="NEEDS_VERIFICATION">Needs verification</option>
          <option value="SUPPRESSED">Suppressed</option>
        </select>
      </div>
      <span className="muted" role="status">{filteredRows.length} of {rows.length} contacts</span>
    </div>
    <div className="table-shell">
      <table className="data-table">
        <thead><tr><th>Name</th><th>Account</th><th>Title</th><th>Persona</th><th>Email</th><th>Verification</th><th>Status</th><th>Source</th></tr></thead>
        <tbody>{filteredRows.length > 0 ? filteredRows.map((row) => <tr key={row.id}>
          <td><strong>{row.name}</strong></td>
          <td><Link href={`/app/accounts/${row.accountId}`}><strong>{row.accountName}</strong></Link></td>
          <td>{row.title ?? "—"}</td>
          <td>{row.persona ?? "—"}</td>
          <td>{row.email ?? <span className="muted">Not available</span>}</td>
          <td><StatusBadge status={row.emailVerification} /></td>
          <td><StatusBadge status={row.suppressed ? "SUPPRESSED" : row.status} /></td>
          <td>{row.source}</td>
        </tr>) : <tr><td colSpan={8}><div className="empty-state"><strong>No matching contacts</strong><span>Try a broader search or another verification filter.</span></div></td></tr>}</tbody>
      </table>
    </div>
  </>;
}
