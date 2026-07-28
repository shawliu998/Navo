"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckSquare2, MessageSquareText, Search, X } from "lucide-react";
import type { getConversation, getConversations } from "@navo/db/queries";
import { Badge, StatusBadge } from "@navo/ui";

type ConversationQueue = Awaited<ReturnType<typeof getConversations>>;
type ConversationDetail = NonNullable<Awaited<ReturnType<typeof getConversation>>>;

export function ReplyInboxWorkspace({
  items,
  selected,
}: {
  items: ConversationQueue;
  selected: ConversationDetail | null;
}) {
  const [query, setQuery] = useState("");
  const unread = items.reduce((total, item) => total + item.conversation.unreadCount, 0);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return items;
    return items.filter((item) => [
      item.conversation.subject,
      item.accountName,
      item.contactName,
      item.summary,
      item.intent,
      item.conversation.status,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)));
  }, [items, normalizedQuery]);
  const primaryAction = selected?.actions[0];
  const primaryTask = selected?.tasks[0];
  const lastMessage = selected?.messages.at(-1);
  const commitments = asStrings(selected?.summary?.commitments);
  const questions = asStrings(selected?.summary?.questions);

  return (
    <div className="page page-wide reply-inbox-page">
      <header className="reply-inbox-header">
        <div><h1>Reply Inbox</h1><p>Read the reply, confirm intent, and move the next action forward.</p></div>
        <div><Badge tone="accent">{unread} unread replies</Badge><span>{items.length} open conversations</span></div>
      </header>

      <div className="reply-inbox-toolbar">
        <nav className="reply-inbox-tabs" aria-label="Inbox views">
          <Link className="reply-inbox-tab-active" href="/app/conversations">Replies</Link>
          <Link href="/app/tasks">Tasks</Link>
        </nav>
        <div className="reply-inbox-controls">
          <label>
            <Search size={14} />
            <input
              aria-label="Search conversations"
              placeholder="Search replies"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
            />
            {query ? <button type="button" aria-label="Clear conversation search" onClick={() => setQuery("")}><X size={13} /></button> : null}
          </label>
          <span>{filteredItems.length} of {items.length}</span>
        </div>
      </div>

      {selected ? (
        <div className="reply-inbox-workspace">
          <aside className="reply-queue" aria-label="Conversation queue">
            <header><strong>Replies</strong>{unread > 0 ? <Badge tone="accent">{unread} unread</Badge> : null}</header>
            <div className="reply-queue-list">
              {filteredItems.map((item) => {
                const active = item.conversation.id === selected.conversation.id;
                return <Link className={active ? "reply-queue-row reply-queue-row-active" : "reply-queue-row"} href={`/app/conversations/${item.conversation.id}`} key={item.conversation.id} aria-current={active ? "page" : undefined}>
                  <div><strong>{item.conversation.subject}</strong><time>{formatShortDate(item.conversation.lastMessageAt)}</time></div>
                  <span>{item.accountName} · {item.contactName ?? "Unknown contact"}</span>
                  <p>{item.summary ?? "Awaiting conversation summary"}</p>
                  <footer><StatusBadge status={item.intent ?? item.conversation.status} />{item.conversation.unreadCount > 0 ? <em>{item.conversation.unreadCount} new</em> : null}</footer>
                </Link>;
              })}
              {filteredItems.length === 0 ? <div className="reply-queue-empty" role="status"><strong>No matching replies</strong><span>Try an account, contact, subject, or intent.</span><button type="button" onClick={() => setQuery("")}>Clear search</button></div> : null}
            </div>
            <p className="reply-queue-note">Unread and recent replies appear first.</p>
          </aside>

          <main className="reply-thread">
            <header><div><h2>{selected.conversation.subject}</h2><p>{selected.contact?.name ?? "Unknown contact"} · {selected.account.name} · {selected.contact?.email ?? "No email"}</p></div><StatusBadge status={selected.summary?.intent ?? selected.conversation.status} /></header>
            <div className="reply-thread-meta"><span>{selected.messages.length} messages</span><span>Last reply {formatDateTime(lastMessage?.receivedAt ?? lastMessage?.sentAt ?? lastMessage?.createdAt)}</span></div>
            <div className="reply-message-list">
              {selected.messages.map((message) => <article className={`reply-message reply-message-${message.direction.toLowerCase()}`} key={message.id}>
                <header><strong>{message.direction === "INBOUND" ? selected.contact?.name ?? "Contact" : "Nova Automation"}</strong><time>{formatDateTime(message.receivedAt ?? message.sentAt ?? message.createdAt)}</time></header>
                <p>{message.body}</p>
              </article>)}
            </div>
            <footer className="reply-readonly-note"><MessageSquareText size={13} /><span><strong>Read-only thread</strong> · Persisted reply and follow-up context.</span></footer>
          </main>

          <aside className="reply-context" aria-label="Conversation context">
            <section className="reply-context-overview">
              <h3>Context</h3>
              <div className="reply-context-person"><strong>{selected.account.name}</strong><span>{selected.contact?.name ?? "Unknown contact"} · {selected.contact?.title ?? "Role not specified"}</span></div>
              <div className="reply-context-links"><Link href={`/app/accounts/${selected.account.id}`}>Open account</Link>{selected.contact ? <Link href={`/app/accounts/${selected.account.id}?tab=contacts`}>Open contact</Link> : null}</div>
              <div className="reply-context-summary"><span>Conversation summary</span><strong>{selected.summary?.summary ?? "No summary yet."}</strong></div>
              {commitments.map((item) => <p key={`commitment-${item}`}>Commitment: {item}</p>)}
              {questions.map((item) => <p key={`question-${item}`}>Question: {item}</p>)}
              {questions.length === 0 ? <small>No unanswered question detected.</small> : null}
            </section>
            <section><h3>Next best action</h3>{primaryAction ? <><strong>{primaryAction.title}</strong><p>{primaryAction.rationale}</p><div className="reply-context-meta"><StatusBadge status={primaryAction.priority} /><span>{primaryAction.dueAt ? `Due ${formatShortDate(primaryAction.dueAt)}` : "No due date"}</span></div><Link href="/app/tasks">Open next action</Link></> : <p>No next action has been proposed.</p>}</section>
            <section><h3>Task</h3>{primaryTask ? <><strong>{primaryTask.title}</strong><p>{primaryTask.assigneeName ?? "Unassigned"} · {primaryTask.description ?? "Follow-up task"}</p><div className="reply-context-meta"><StatusBadge status={primaryTask.priority} /><StatusBadge status={primaryTask.status} /></div><Link href="/app/tasks">Open task</Link></> : <p>No task is linked to this conversation.</p>}</section>
            <section className="reply-context-facts"><span>{selected.messages.length} messages</span><span>Last reply {formatShortDate(selected.conversation.lastMessageAt)}</span><span>Owner {primaryTask?.assigneeName ?? "Unassigned"}</span></section>
          </aside>
        </div>
      ) : (
        <div className="reply-inbox-empty"><MessageSquareText /><strong>No conversations yet</strong><p>Inbound replies will appear here with their account context and next action.</p><Link className="button button-secondary" href="/app/tasks"><CheckSquare2 size={13} />Open tasks</Link></div>
      )}
    </div>
  );
}

function asStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formatShortDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
