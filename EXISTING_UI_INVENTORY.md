# Navo existing UI inventory and reuse map

This file prevents repeated design and implementation. Read it before creating a page, route, component, Figma component, token, state, or asset.

Status meanings:

- **Freeze / reuse** — already suitable for the active phase; do not redesign or rebuild.
- **Adapt** — the capability exists; preserve its data, actions and content model while aligning layout or navigation.
- **Compose** — the required pieces exist separately; combine them instead of creating a new domain or backend.
- **Deferred** — implemented or designed, but outside the active product priority.

## Shared foundation

| Capability | Existing source | Status | Rule |
| --- | --- | --- | --- |
| Application shell | `apps/web/src/components/app-shell.tsx` | Adapt | Reuse structure and real routes. Align labels to the approved navigation; do not create another shell. |
| Brand assets | `apps/web/public/brand/` | Freeze / reuse | Use the existing app icon, favicon and navy/white wordmarks. Do not redraw logos or create text substitutes. |
| React UI primitives | `packages/ui/src/index.tsx` | Adapt | Button, Badge, StatusBadge, FitScoreBadge, EmptyState, PageHeader and layout classes already exist. Extend only when an approved Figma component cannot be composed from them. |
| Product CSS | `apps/web/src/app/globals.css` | Adapt | Existing light workspace and graphite shell are the implementation base. Do not introduce a second theme. |
| Figma tokens | file `sfKBHHGdO61vHTsA99lWpP` | Freeze / reuse | 3 variable collections, 79 variables, 7 text styles and one elevation style are validated. |
| Figma components | same file | Freeze / reuse | Button, Status label, Search, Filter, Tabs, Table row and Constraint row are complete and validated. Do not recreate them per page. |
| Shared shell assets in Figma | same file | Freeze / reuse | Authentic white wordmark and Lucide Search are fixed across approved boards. Copy only from corrected boards. |

## Core page capability map

| Product capability | Existing React capability | Existing Figma capability | Status and next use |
| --- | --- | --- | --- |
| Accounts directory | `/app/accounts`, `AccountsTable`, CSV import | Approved board `34:3`; table, saved views, filters, bulk selection, columns and preview | **Freeze / reuse.** No new directory design. |
| Account Detail | `/app/accounts/[accountId]` already contains profile rail; Overview, Intelligence, Contacts, Outreach and Activity; Research/Evidence subviews; Memory, Tasks, Runs and CRM subviews; qualification, messages and next actions | Approved normalized Overview board `72:132`; minimum states `79:22` | **Freeze / reuse.** The existing content model is mapped into the shared hierarchy. Do not add parallel Account models or subview galleries. |
| Signals workbench | `/app/signals`, account and mission links | Approved board `46:3` | **Freeze / reuse.** No new signal feed or card view. |
| Missions directory | `/app/missions`, `MissionList`, new Mission wizard | Approved board `49:3` | **Freeze / reuse.** Reuse table and constraint patterns. |
| Mission Detail | `/app/missions/[missionId]`; Summary, Targets, Plan, Results, Activity and Outcomes; live status, actions, completion brief and draft editor | Approved representative board `54:3`, plus 1280/1024 boards | **Freeze / reuse.** Later work may reconcile Figma with React, not redesign the workflow. |
| Message / Approval review | `/app/approvals`, `/app/approvals/[approvalId]`, `ApprovalEditor` | Approved board `57:3`, states and 1280/1024 boards | **Freeze / reuse.** Keep the focused review flow; do not expand into a security console. |
| Reply Inbox | `/app/conversations`, `/app/conversations/[conversationId]`, `/app/tasks` | Approved composed workbench `81:3`; minimum states `86:837` | **Freeze / reuse.** The existing conversation queue, read-only thread, account/contact context, summary, next action and task data are composed into one workspace. Do not add a reply composer, approval model or new backend workflow. |
| Analytics | `/app/analytics`, `FunnelBars`, `QualificationPie`, `OutcomeTrendChart`, `AnalyticsSparkline` | Approved adapted board `89:21` | **Freeze / reuse.** Existing metrics, conversion, qualification mix, outcome trend and source drill-down semantics are mapped into the shared workspace hierarchy; no new metric domain was introduced. |
| Overview | `/app/overview` with metrics, attention items and work queues | Shell pattern exists; no newly approved P0 board | **Adapt later.** Do not block completion of the core account-to-reply loop. |

## React implementation checkpoint — 2026-07-21

The approved Figma review has been mapped into the existing React surfaces without changing backend contracts.

| Implemented surface | Reused React capability | Approved Figma source | Minimal implementation files |
| --- | --- | --- | --- |
| Shared shell | Existing `AppShell`, `NavoBrand`, `CommandMenu`, `AgentStatusControl`, notification center and Lucide icons | Shared shell on `34:3`, `72:132`, `81:3`, `89:21` | `apps/web/src/components/app-shell.tsx`, existing `apps/web/src/app/globals.css` |
| Account Detail | Existing five-tab `/app/accounts/[accountId]` workspace, `CompanyMark`, qualification, evidence, signals, contacts, drafts, tasks, mission context and loading/error boundaries | `72:132`, states `79:22` | Existing account page and existing product CSS only |
| Reply Inbox | Existing `getConversations`, `getConversation`, `/app/conversations`, `/app/conversations/[conversationId]` and `/app/tasks` capability | `81:3`, states `86:837` | Existing conversation routes plus `ReplyInboxWorkspace`, a composition-only view with no new data model or send behavior |
| Analytics | Existing overview/accounts/approvals metrics and `FunnelBars`, `QualificationPie`, `OutcomeTrendChart`, `AnalyticsSparkline` | `89:21` | Existing analytics page, chart component and product CSS only |

`ReplyInboxWorkspace` is the only new component in this checkpoint. No existing component expressed the approved queue + read-only thread + account/contact + summary + next-action + task workspace. It replaces the former duplicated list/detail page composition; it does not replace or extend the conversation domain.

## Existing contextual capabilities

These should be embedded or linked contextually; they do not justify new primary navigation or new backend work:

- Contacts directory and reusable `ContactsTable`
- Playbooks and React Flow `PlayBuilder`
- Sequences and sequence detail timeline
- Account Memory
- Tasks / Next Best Action
- Runs and run detail
- CRM Mirror data inside Account Activity
- Knowledge editor
- CSV import and deduplication
- Command menu and notifications

## Existing but deferred

The following routes or Figma boards already exist. Preserve them, but do not spend active-phase time refining or implementing them:

- Agents / Capabilities (`/app/agents`, Figma `63:37`)
- Tool Status / Integrations (`/app/integrations`)
- Run/provider/token/cost observability
- Settings security and audit content
- EmailSink developer simulator

Existing code is not evidence of current product priority.

## Reuse decision before work

Before creating anything, search this file and the repository. Use this order:

1. Reuse the exact existing component or board.
2. Compose existing components and data into the required workspace.
3. Extend an existing component with the smallest approved variant.
4. Create a new component only when the first three options cannot express an approved P0 interaction.

For every new artifact, record which existing artifact it replaces or why none is reusable. If neither can be stated, stop the task.
