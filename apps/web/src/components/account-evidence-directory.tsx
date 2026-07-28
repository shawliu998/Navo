"use client";

import Link from "next/link";
import {
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FileCheck2,
  Mail,
  MoreHorizontal,
  Play,
  Radar,
  Search,
  Sparkles,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

export type EvidenceDirectoryKind = "fact" | "signal" | "inference" | "decision" | "confirm";

export type EvidenceDirectoryItem = {
  id: string;
  kind: EvidenceDirectoryKind;
  title: string;
  summary: string;
  source: string;
  sourceUrl?: string;
  confidence: number;
  updatedAt: string;
  excerpt?: string;
  accessible: boolean;
  linkedContact?: { name: string; title: string; initials: string };
};

const kindConfig = {
  fact: { label: "Verified fact", icon: FileCheck2 },
  signal: { label: "Sales signal", icon: Radar },
  inference: { label: "AI inference", icon: Sparkles },
  decision: { label: "Human decision", icon: UserRoundCheck },
  confirm: { label: "Needs confirmation", icon: CircleHelp },
} satisfies Record<EvidenceDirectoryKind, { label: string; icon: typeof FileCheck2 }>;

export function AccountEvidenceDirectory({
  accountId,
  items,
  nextAction,
}: {
  accountId: string;
  items: EvidenceDirectoryItem[];
  nextAction: { title: string; proposedDate: string };
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | EvidenceDirectoryKind>("all");
  const [confidence, setConfidence] = useState("all");
  const [sourceStatus, setSourceStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? null);
  const [verifiedIds, setVerifiedIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !normalizedQuery || `${item.title} ${item.summary} ${item.source}`.toLowerCase().includes(normalizedQuery);
      const matchesKind = kind === "all" || item.kind === kind;
      const matchesConfidence = confidence === "all" || (confidence === "high" ? item.confidence >= 80 : item.confidence < 80);
      const matchesSource = sourceStatus === "all" || (sourceStatus === "available" ? item.accessible : !item.accessible);
      return matchesQuery && matchesKind && matchesConfidence && matchesSource;
    });
  }, [confidence, items, kind, query, sourceStatus]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / 8));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * 8;
  const visibleItems = filteredItems.slice(pageStart, pageStart + 8);
  const selectedIsVerified = selectedItem ? selectedItem.kind === "fact" || verifiedIds.includes(selectedItem.id) : false;
  const selectedIsSaved = selectedItem ? savedIds.includes(selectedItem.id) : false;

  return (
    <div className={`evidence-directory-layout${selectedItem ? " evidence-directory-has-drawer" : ""}`}>
      <div className="evidence-directory-content">
        <section className="account-next-action-strip" aria-label="Next best action">
          <div className="account-next-action-copy">
            <span className="account-next-action-icon"><Bot size={16} /></span>
            <span><small>Next Best Action</small><strong>{nextAction.title}</strong></span>
          </div>
          <div className="account-next-action-date">
            <span><small>Proposed date</small><strong>{nextAction.proposedDate}</strong></span>
            <CalendarDays size={14} />
          </div>
          <Link className="button button-secondary" href="/app/tasks">
            <CalendarDays size={14} />
            View in tasks
          </Link>
        </section>

        <section className="evidence-directory-panel">
          <header className="evidence-directory-header">
            <div>
              <h2>Evidence directory</h2>
              <p>Source-linked facts and insights about this account.</p>
            </div>
            <span>{items.length} source-linked items</span>
          </header>

          <div className="evidence-directory-filters" aria-label="Evidence filters">
            <label className="evidence-search-field">
              <span className="sr-only">Search evidence</span>
              <Search size={14} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by keyword or phrase..." />
            </label>
            <FilterSelect label="Type" value={kind} onChange={(value) => setKind(value as typeof kind)}>
              <option value="all">All Types</option>
              <option value="fact">Verified facts</option>
              <option value="signal">Sales signals</option>
              <option value="inference">AI inferences</option>
              <option value="decision">Human decisions</option>
              <option value="confirm">Needs confirmation</option>
            </FilterSelect>
            <FilterSelect label="Confidence" value={confidence} onChange={setConfidence}>
              <option value="all">All Confidence</option>
              <option value="high">80% and above</option>
              <option value="review">Below 80%</option>
            </FilterSelect>
            <FilterSelect label="Source status" value={sourceStatus} onChange={setSourceStatus}>
              <option value="all">All Source status</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </FilterSelect>
          </div>

          <div className="evidence-directory-table-wrap">
            <table className="evidence-directory-table">
              <thead>
                <tr><th>Evidence</th><th>Type</th><th>Source</th><th>Confidence</th><th>Updated</th><th><span className="sr-only">Action</span></th></tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const config = kindConfig[item.kind];
                  const Icon = config.icon;
                  const isSelected = item.id === selectedId;
                  return (
                    <tr key={item.id} className={isSelected ? "evidence-directory-row-selected" : undefined}>
                      <td>
                        <button type="button" className="evidence-row-select" onClick={() => setSelectedId(item.id)} aria-pressed={isSelected}>
                          <span className={`evidence-kind-icon evidence-kind-${item.kind}`}><Icon size={15} /></span>
                          <span>{item.title}<small>{item.summary}</small></span>
                        </button>
                      </td>
                      <td><span className={`evidence-kind-label evidence-kind-${item.kind}`}>{config.label}</span></td>
                      <td>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.source}<ExternalLink size={10} /></a> : <span>{item.source}</span>}</td>
                      <td><span className={`evidence-confidence ${item.confidence >= 80 ? "evidence-confidence-high" : ""}`}>{item.confidence}%</span></td>
                      <td>{item.updatedAt}</td>
                      <td><button type="button" className="evidence-row-more" onClick={() => setSelectedId(item.id)} aria-label={`Open details for ${item.title}`}><MoreHorizontal size={15} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredItems.length ? (
              <div className="evidence-directory-empty">
                <Search size={18} />
                <strong>No evidence matches these filters</strong>
                <span>Clear or adjust the filters to return to the full directory.</span>
                <button type="button" className="button button-secondary" onClick={() => { setQuery(""); setKind("all"); setConfidence("all"); setSourceStatus("all"); }}>Clear filters</button>
              </div>
            ) : null}
            {filteredItems.length ? (
              <footer className="evidence-directory-footer">
                <span>Showing {pageStart + 1}–{Math.min(pageStart + 8, filteredItems.length)} of {filteredItems.length} items</span>
                <span aria-label="Pagination">{Array.from({ length: Math.min(pageCount, 3) }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === safePage ? "page" : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}</span>
              </footer>
            ) : null}
          </div>
        </section>
      </div>

      {selectedItem ? (
        <aside className="evidence-detail-drawer" aria-label="Selected evidence details">
          <header>
            <h2>{selectedItem.title}</h2>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Close evidence details"><X size={16} /></button>
          </header>

          <div className="evidence-detail-status">
            <span className={`evidence-kind-label evidence-kind-${selectedItem.kind}`}>{kindConfig[selectedItem.kind].label}</span>
            <span>{selectedItem.confidence}% confidence</span>
          </div>

          <dl className="evidence-detail-meta">
            <div><dt>Source</dt><dd>{selectedItem.sourceUrl ? <a href={selectedItem.sourceUrl} target="_blank" rel="noreferrer">{selectedItem.source}<ExternalLink size={11} /></a> : selectedItem.source}</dd></div>
            <div><dt>Updated</dt><dd>{selectedItem.updatedAt}</dd></div>
          </dl>

          <section className="evidence-detail-section">
            <h3>Excerpt</h3>
            <p>{selectedItem.excerpt ?? selectedItem.summary}</p>
            {selectedItem.sourceUrl ? <a className="evidence-source-link" href={selectedItem.sourceUrl} target="_blank" rel="noreferrer">View full source <ExternalLink size={11} /></a> : null}
          </section>

          <section className="evidence-detail-section">
            <h3>Verification</h3>
            <div className={`evidence-verification${selectedIsVerified ? " evidence-verification-complete" : ""}`}>
              {selectedIsVerified ? <CheckCircle2 size={16} /> : <CircleHelp size={16} />}
              <span><strong>{selectedIsVerified ? "Verified" : "Needs review"}</strong><small>{selectedIsVerified ? "Verified by Navo and linked to its source." : "A human reviewer should confirm this item."}</small></span>
            </div>
          </section>

          {selectedItem.linkedContact ? (
            <section className="evidence-detail-section">
              <h3>Linked contact</h3>
              <div className="evidence-linked-contact">
                <span>{selectedItem.linkedContact.initials}</span>
                <div><strong>{selectedItem.linkedContact.name}</strong><small>{selectedItem.linkedContact.title}</small></div>
                <Mail size={14} />
              </div>
            </section>
          ) : null}

          <section className="evidence-detail-section">
            <h3>Notes</h3>
            <p>Core capability statement aligned with the account profile and current outbound hypothesis.</p>
          </section>

          <section className="evidence-detail-actions">
            <h3>Actions</h3>
            <div>
              <button type="button" className="button button-primary" onClick={() => setVerifiedIds((current) => current.includes(selectedItem.id) ? current : [...current, selectedItem.id])}>
                <Check size={14} />{selectedIsVerified ? "Verified" : "Verify"}
              </button>
              <Link className="button button-secondary" href={`/app/missions/new?accountId=${encodeURIComponent(accountId)}`}><Play size={14} />Use in play</Link>
            </div>
            <button type="button" className={`button button-secondary evidence-memory-button${selectedIsSaved ? " evidence-memory-button-saved" : ""}`} onClick={() => setSavedIds((current) => current.includes(selectedItem.id) ? current.filter((id) => id !== selectedItem.id) : [...current, selectedItem.id])}>
              <Bot size={14} />{selectedIsSaved ? "Added to memory" : "Add to memory"}<ChevronDown size={13} />
            </button>
          </section>
        </aside>
      ) : null}
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="evidence-filter-select">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
      <ChevronDown size={13} aria-hidden="true" />
    </label>
  );
}
