"use client";

/* eslint-disable react-hooks/incompatible-library -- TanStack Table helpers intentionally return non-memoizable functions. */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  useReactTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { ArrowDownUp, ExternalLink, Filter, Play, Search, X } from "lucide-react";
import { FitScoreBadge, StatusBadge } from "@navo/ui";
import { CompanyMark } from "./company-mark";

export type AccountRow = {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  country: string | null;
  industry: string | null;
  employeeRange: string | null;
  fitScore: number | null;
  qualification: string;
  playStatus: string;
  source: string;
  ownerName: string | null;
  lastResearchedAt: Date | null;
  updatedAt: Date;
  agentContext: {
    priority: string;
    whySelected: string | null;
    currentStep: string | null;
    suggestedAction: string | null;
    targetStatus: string;
    missionId: string;
    missionName: string;
    missionStatus: string;
  } | null;
};

type QualificationFilter = "ALL" | "STRONG_FIT" | "POTENTIAL_FIT" | "REVIEW";
type PreviewTab = "overview" | "activity" | "tasks";

export function AccountsTable({ data }: { data: AccountRow[] }) {
  const params = useSearchParams();
  const [globalFilter, setGlobalFilter] = useState(params.get("q") ?? "");
  const [qualificationFilter, setQualificationFilter] = useState<QualificationFilter>("ALL");
  const [countryFilter, setCountryFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [previewAccountId, setPreviewAccountId] = useState<string | null>(data[0]?.id ?? null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("overview");
  const countries = useMemo(() => [...new Set(data.map((account) => account.country).filter((country): country is string => Boolean(country)))].sort(), [data]);
  const priorities = useMemo(() => [...new Set(data.map((account) => account.agentContext?.priority ?? "UNASSIGNED"))].sort(), [data]);
  const filteredData = useMemo(
    () => data.filter((account) => (
      (qualificationFilter === "ALL" || account.qualification === qualificationFilter)
      && (countryFilter === "ALL" || account.country === countryFilter)
      && (priorityFilter === "ALL" || (account.agentContext?.priority ?? "UNASSIGNED") === priorityFilter)
    )),
    [countryFilter, data, priorityFilter, qualificationFilter],
  );
  const columns = useMemo<ColumnDef<AccountRow>[]>(() => [
    {
      accessorKey: "name",
      header: "Company",
      cell: ({ row }) => <div className="company-cell"><CompanyMark /><span className="company-meta"><Link href={`/app/accounts/${row.original.id}`} onClick={(event) => event.stopPropagation()} title={`Open ${row.original.name}`}><strong>{row.original.name}</strong></Link><small>{row.original.domain}</small></span></div>,
    },
    { accessorKey: "fitScore", header: "Fit", cell: ({ row }) => <FitScoreBadge score={row.original.fitScore} status={row.original.qualification} /> },
    { id: "agentPriority", header: "Priority", cell: ({ row }) => <StatusBadge status={row.original.agentContext?.priority ?? "UNASSIGNED"} /> },
    {
      id: "currentStep",
      header: "Current step",
      cell: ({ row }) => row.original.agentContext ? <div className="company-meta"><strong>{row.original.agentContext.suggestedAction ?? row.original.agentContext.currentStep}</strong><small>{row.original.agentContext.missionStatus === "ACTIVE" ? "Mission active" : row.original.agentContext.currentStep}</small></div> : <div className="company-meta"><strong>Not in a mission</strong><small>Next best action</small></div>,
    },
  ], []);
  const table = useReactTable({
    data: filteredData,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const previewAccount = data.find((account) => account.id === previewAccountId) ?? null;
  const activeFilterCount = [qualificationFilter !== "ALL", countryFilter !== "ALL", priorityFilter !== "ALL"].filter(Boolean).length;

  useEffect(() => {
    if (!previewAccount) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewAccountId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewAccount]);

  function openPreview(accountId: string) {
    if (accountId !== previewAccountId) setPreviewTab("overview");
    setPreviewAccountId(accountId);
  }

  return <div className={`account-directory-layout${previewAccount ? " account-directory-preview-open" : ""}`}>
    <div className="account-directory-main">
      <div className="toolbar">
      <div className="toolbar-group">
        <div className="input-wrap"><Search size={15} /><input className="input input-search" value={globalFilter} onChange={(event) => {
          setGlobalFilter(event.target.value);
          const next = new URLSearchParams(params);
          if (event.target.value) next.set("q", event.target.value);
          else next.delete("q");
          window.history.replaceState(null, "", `?${next}`);
        }} placeholder="Search companies or domains…" /></div>
        <button className={`button button-secondary${showFilters ? " button-active" : ""}`} type="button" aria-expanded={showFilters} aria-controls="account-filter-panel" onClick={() => setShowFilters((value) => !value)}><Filter size={15} />Filters{activeFilterCount > 0 ? <span className="toolbar-count">{activeFilterCount}</span> : null}</button>
      </div>
      </div>
      {showFilters ? <div className="account-control-panel" id="account-filter-panel">
        <label><span>Qualification</span><select className="input" value={qualificationFilter} onChange={(event) => setQualificationFilter(event.target.value as QualificationFilter)}><option value="ALL">All qualification</option><option value="STRONG_FIT">Strong Fit</option><option value="POTENTIAL_FIT">Potential Fit</option><option value="REVIEW">Review</option></select></label>
        <label><span>Country</span><select className="input" value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}><option value="ALL">All countries</option>{countries.map((country) => <option key={country} value={country}>{country}</option>)}</select></label>
        <label><span>Agent priority</span><select className="input" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="ALL">All priorities</option>{priorities.map((priority) => <option key={priority} value={priority}>{priority.replaceAll("_", " ")}</option>)}</select></label>
        <button className="button button-ghost" type="button" disabled={activeFilterCount === 0} onClick={() => { setQualificationFilter("ALL"); setCountryFilter("ALL"); setPriorityFilter("ALL"); }}>Clear filters</button>
      </div> : null}
      <div className="table-shell">
        <table className="data-table account-directory-table">
        <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th className={`table-column-${header.column.id}`} key={header.id} onClick={header.column.getToggleSortingHandler()} style={{ cursor: header.column.getCanSort() ? "pointer" : "default" }}>{header.isPlaceholder ? null : <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getCanSort() && <ArrowDownUp size={11} />}</span>}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map((row) => <tr
            key={row.id}
            className={previewAccountId === row.original.id ? "data-row-active" : undefined}
            onClick={() => openPreview(row.original.id)}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                openPreview(row.original.id);
              }
            }}
            tabIndex={0}
            aria-label={`Preview ${row.original.name}`}
            aria-selected={previewAccountId === row.original.id}
            style={{ cursor: "pointer" }}
          >{row.getVisibleCells().map((cell) => <td className={`table-column-${cell.column.id}`} key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
        <div className="table-footer"><span>Showing {table.getRowModel().rows.length} of {filteredData.length} matching accounts · Select a row to preview</span><span>{data.length} total · Page 1</span></div>
      </div>
    </div>

    {previewAccount ? <>
      <button className="account-preview-backdrop" type="button" tabIndex={-1} onClick={() => setPreviewAccountId(null)} aria-label="Close account preview" />
      <aside className="account-preview" aria-label={`${previewAccount.name} preview`}>
        <div className="account-preview-header">
          <div className="company-cell">
            <CompanyMark large />
            <span className="company-meta">
              <strong title={previewAccount.name}>{previewAccount.name}</strong>
              <small>{previewAccount.domain ?? "No domain"}</small>
            </span>
          </div>
          <button className="icon-button" type="button" onClick={() => setPreviewAccountId(null)} aria-label="Close account preview"><X size={15} /></button>
        </div>

        <div className="account-preview-summary" aria-label="Account status">
          <span><span>Fit</span><FitScoreBadge score={previewAccount.fitScore} status={previewAccount.qualification} /></span>
          <span><span>Priority</span><StatusBadge status={previewAccount.agentContext?.priority ?? "UNASSIGNED"} /></span>
        </div>

        <div className="account-preview-tabs" role="tablist" aria-label="Account preview sections">
          {(["overview", "activity", "tasks"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={previewTab === tab} className={previewTab === tab ? "account-preview-tab-active" : undefined} onClick={() => setPreviewTab(tab)}>{tab === "overview" ? "Overview" : tab === "activity" ? "Activity" : "Tasks"}</button>)}
        </div>

        {previewTab === "overview" ? <div className="account-preview-pane" role="tabpanel">
          <dl className="account-preview-facts">
            <div><dt>Country</dt><dd>{previewAccount.country ?? "Unknown"}</dd></div>
            <div><dt>Industry</dt><dd title={previewAccount.industry ?? undefined}>{previewAccount.industry ?? "Unknown"}</dd></div>
            <div><dt>Employees</dt><dd>{previewAccount.employeeRange ?? "Unknown"}</dd></div>
            <div><dt>Owner</dt><dd>{previewAccount.ownerName ?? "Unassigned"}</dd></div>
          </dl>
          <section className="account-preview-section"><span className="account-preview-kicker">Why this account</span><p>{previewAccount.agentContext?.whySelected ?? "Review fit and available evidence before adding this account to a mission."}</p></section>
          <section className="account-preview-section account-preview-next"><span className="account-preview-kicker">Next best action</span><strong>{previewAccount.agentContext?.suggestedAction ?? "Review account fit"}</strong></section>
        </div> : null}

        {previewTab === "activity" ? <div className="account-preview-pane account-preview-timeline" role="tabpanel">
          <article><span className="account-timeline-marker" /><div><strong>Account updated</strong><p>Profile and qualification data were refreshed.</p><small>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(previewAccount.updatedAt))}</small></div></article>
          <article><span className="account-timeline-marker" /><div><strong>Research {previewAccount.lastResearchedAt ? "completed" : "pending"}</strong><p>{previewAccount.lastResearchedAt ? "Latest account evidence is available for review." : "No completed research run is recorded yet."}</p><small>{previewAccount.lastResearchedAt ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(previewAccount.lastResearchedAt)) : "Not yet"}</small></div></article>
          <article><span className="account-timeline-marker" /><div><strong>Account created</strong><p>Source: {previewAccount.source.replaceAll("_", " ").toLowerCase()}</p></div></article>
        </div> : null}

        {previewTab === "tasks" ? <div className="account-preview-pane" role="tabpanel">
          <section className="account-preview-task"><span className="account-preview-kicker">Current mission</span>{previewAccount.agentContext ? <><Link href={`/app/missions/${previewAccount.agentContext.missionId}`}><strong>{previewAccount.agentContext.missionName}</strong></Link><StatusBadge status={previewAccount.agentContext.missionStatus} /><p>{previewAccount.agentContext.currentStep ?? "Waiting for next step"}</p></> : <p>Not currently in a mission.</p>}</section>
          <section className="account-preview-task"><span className="account-preview-kicker">Recommended task</span><strong>{previewAccount.agentContext?.suggestedAction ?? "Review account fit"}</strong><p>Confirm the available evidence before moving this account forward.</p></section>
        </div> : null}

        <div className="account-preview-actions">
          <Link className="button button-primary" href={`/app/accounts/${previewAccount.id}`}>Open account <ExternalLink size={13} /></Link>
          <Link className="button button-secondary" href={`/app/missions/new?accountId=${encodeURIComponent(previewAccount.id)}`}><Play size={13} />Create mission</Link>
        </div>
      </aside>
    </> : null}
  </div>;
}
