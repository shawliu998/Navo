# Navo MVP Implementation Plan

## Goal

Deliver a runnable, database-backed account intelligence and outbound orchestration workspace for industrial exporters. Navo must demonstrate one controlled, observable loop from account intake and evidence-backed qualification through approval and sandboxed outreach, then from a simulated reply to classification, conversation summary, account memory, next best action, a manual follow-up task, CRM Mirror and analytics.

## Product boundary

The MVP is an account intelligence and outbound orchestration product, not a general-purpose CRM, customer-support suite, WebChat platform or WhatsApp marketing system. It does not perform unrestricted automatic outreach or autonomous technical, pricing or contractual commitments.

All outbound delivery remains in EmailSink test mode. DeepSeek is the default production AI provider through a server-only adapter. `MockAIProvider` is deterministic and powers tests, seed data and a complete local demo without external API calls.

## Phases

1. **Foundation and brand** — pnpm/Turborepo, Next.js web, worker, PostgreSQL, Redis, demo authentication, workspace isolation, Navo application shell and design tokens.
2. **Account intelligence** — product knowledge, ICP, personas, approved claims, CSV mapping and deduplication, accounts, mock research, signals, evidence, inference, qualification and contacts.
3. **Outbound orchestration** — fixed node registry, React Flow Play Builder, graph validation, immutable play versions, message generation, policy checks and human approval.
4. **Controlled engagement** — sequence enrollment, suppression and idempotency policies, EmailSink-only sending, deterministic run/node-run logs and retry behavior.
5. **Reply intelligence** — simulated positive, question, referral, not-now, not-interested, out-of-office, unsubscribe, bounce and complaint events; reply classification; conversation summaries; account memory; next best action; manual tasks; CRM Mirror events.
6. **Observability and quality** — analytics, audit trail, provider/token/cost/error visibility, unit/integration/component/E2E coverage, accessibility, screenshots and clean-room notices.

## Main deliverables

- `apps/web`: Navo UI, workspace-scoped resource APIs, EmailSink simulation endpoints, conversations, tasks, CRM Mirror views and server queries/actions.
- `apps/worker`: Redis/BullMQ entrypoint for long-running research and workflow execution.
- `packages/db`: Drizzle schema, migrations and a complete deterministic demo seed.
- `packages/domain`: schemas, RBAC, policies, scoring, reply taxonomy, memory/action rules and graph validation.
- `packages/agents`: provider-neutral structured generation with DeepSeek and MockAI adapters.
- `packages/workflows`: deterministic outbound and reply workflow runtime plus the fixed node registry.
- `packages/ui`: Navo design tokens and reusable accessible components.

## MVP acceptance scenarios

1. Import or seed an account, research it, persist evidence and inference, qualify it and select a contact.
2. Generate an English message from approved claims and cited evidence, require human approval, enroll it and send only to EmailSink.
3. Simulate a reply, bounce, unsubscribe or complaint against an EmailSink message.
4. For a reply, deterministically create or update the conversation, classification, summary, account memory, next action proposal, manual task, CRM Mirror event and analytics/audit records.
5. Inspect Play versions, Runs and Node Runs without exposing secrets or unredacted sensitive inputs.

## Acceptance commands

```bash
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```
