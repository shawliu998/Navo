# Navo product UI capability map

## Positioning

Navo is an industrial B2B account-intelligence and outbound-orchestration workspace. It helps an export sales team identify the right accounts, understand why they matter, prepare evidence-backed outreach, handle replies, and decide the next action.

The product is not defined by its agent runtime, security controls, local deployment, or database architecture. Those systems support the experience but do not determine the main navigation or page hierarchy.

## Primary user outcome

An operator should be able to move from a target company to a justified next sales action without assembling context across spreadsheets, CRM records, research tabs, and isolated AI chats.

## Core operational loop

`Accounts → Signals / Evidence → Research → Qualification → Contacts → Mission / Play → Message / Sequence → Replies → Next Best Action`

## Core objects

| Object | Operator question |
| --- | --- |
| Account | Which company is this, why does it matter, and what should we do next? |
| Signal / Evidence | What changed, where did it come from, and how reliable or fresh is it? |
| Contact | Who is relevant to the opportunity and what role do they play? |
| Mission / Play | What outcome are we pursuing and what work is underway? |
| Message / Sequence | What will we say, through which steps, and what needs review? |
| Reply / Conversation | What happened, what does it mean, and who owns the response? |
| Task / Next action | What is the next concrete action, by whom, and by when? |

Agents, tools, provider status, audit events, and infrastructure settings are administrative objects, not primary product objects.

## Navigation

1. Overview
2. Accounts
3. Signals
4. Missions
5. Approvals
6. Inbox
7. Analytics

Settings and administrative tools stay in the sidebar footer. Research, Qualification, Contacts, Outreach, Activity, Memory, and CRM Mirror appear contextually inside Account or Mission workspaces.

## Page capability priority

Implementation and Figma status are tracked in `EXISTING_UI_INVENTORY.md`. A P0 label does not mean “build from scratch”; approved or already-capable surfaces must be reused.

### P0 — reproduce now

- **Accounts directory** — saved views, filters, columns, bulk selection, table and preview detail. Figma foundation exists.
- **Account Detail workspace** — React already contains Overview, Intelligence, Contacts, Outreach and Activity plus the required contextual data. Preserve that model; the current Figma task only normalizes its hierarchy and interaction language.
- **Signals workbench** — triage, source, freshness, confidence, account linkage and review state. Figma foundation exists.
- **Missions directory** — status, progress, owner, targets and attention state. Figma foundation exists.
- **Mission Detail** — React and approved Figma boards already exist. Reconcile later; do not redesign.
- **Message / Approval review** — React and approved Figma boards already exist. Keep the focused review flow; do not expand it.
- **Reply Inbox** — conversation list/detail and tasks already exist. Compose them into one discoverable Inbox rather than creating new backend capability.

### P1 — after the core loop reads clearly

- Analytics overview and drill-down
- global Contacts directory
- CRM mirror and integration status needed by the sales workflow
- sequence management beyond the focused Mission flow

### P2 — deferred

- Agents
- Tool Status
- Audit and permissions consoles
- provider/token/cost observability
- local deployment surfaces
- exhaustive edge-state galleries

## Reference-pattern map

Use multiple products as pattern sources instead of cloning one product boundary wholesale:

- Twenty / Attio: application shell, object tables, saved views, detail panels and account workspaces
- Clay: enrichment and research table behavior, column operations and batch progress
- Common Room / Unify: signal triage and account activity context
- Apollo / Outreach / Salesloft: sequences, message review and reply handling
- Linear: low-noise interaction, keyboard efficiency, command access and restrained state transitions

Reuse information architecture and interaction mechanics that fit Navo. Do not import unrelated CRM administration, decorative branding, or capabilities unsupported by the core loop.

## Active execution order

1. Account Detail workspace
2. Mission Detail refinement
3. Message / Approval review refinement
4. Reply Inbox
5. Analytics overview
6. Figma cross-screen review
7. React implementation after user approval

## Definition of done for the current phase

The phase is ready for review when a user can visually follow one realistic account from signal and evidence through qualification, contact selection, mission work, reviewed message, reply, and next action. Administrative completeness is not required.
