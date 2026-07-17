# Navo MVP Implementation Plan

## Goal

Deliver a runnable, database-backed account intelligence and outbound orchestration workspace for industrial exporters. Navo must demonstrate one controlled, observable loop from account intake and evidence-backed qualification through approval and sandboxed outreach, then from a simulated reply to classification, conversation summary, account memory, next best action, a manual follow-up task, CRM Mirror and analytics.

## Product boundary

The MVP is an account intelligence and outbound orchestration product, not a general-purpose CRM, customer-support suite, WebChat platform or WhatsApp marketing system. It does not perform unrestricted automatic outreach or autonomous technical, pricing or contractual commitments.

All outbound activity remains draft-only or EmailSink test-mode simulation. `MockAIProvider`
is the default deterministic provider for tests, seed data and the local demo. DeepSeek is an
optional server-only adapter enabled only with explicit `AI_PROVIDER=deepseek` and a configured
`DEEPSEEK_API_KEY`; no paid call is required or claimed as verified. The repository is not
production-ready for real email sending.

## Phases

1. **Foundation and brand — completed** — pnpm/Turborepo, Next.js web, worker, PostgreSQL, Redis, demo authentication, workspace isolation, Navo application shell and design tokens.
2. **Knowledge and account intelligence — completed for the demo path** — seller knowledge editor/API, product knowledge, ICP, personas, approved claims, CSV mapping and deduplication, accounts, bounded website research, literal evidence, signals, inference, deterministic qualification and contacts.
3. **Mission execution — completed for the single-account demo path** — Mission planning, BullMQ worker dispatch, IDs-only queue payloads, persisted plan steps/events, Mock/DeepSeek provider boundary, research validation, safe DRAFT generation and operator follow-through. Completion Briefs are persisted-data-only; DRAFT edits preserve the original revision; one manual follow-up task is idempotent per Mission target; and a FAILED Mock Mission creates a linked new retry with one non-terminal retry enforced in PostgreSQL.
4. **Outbound orchestration — completed in the existing Play path; Mission handoff remains limited** — fixed node registry, React Flow Play Builder, graph validation, immutable play versions, message generation, policy checks and human approval.
5. **Controlled engagement — partially completed** — suppression and idempotency policies, EmailSink simulation, deterministic run/node-run logs and retry behavior exist; real email delivery is intentionally unsupported.
6. **Reply intelligence — completed for simulated events** — simulated reply, bounce, unsubscribe and complaint events; reply classification; conversation summaries; account memory; next best action; manual tasks; CRM Mirror events.
7. **Observability and quality — partially completed** — analytics, audit trail, notification center and provider/token/cost/error visibility exist; Mission actual cost remains unmeasured in the current Mock runner, and broader API/component/accessibility/E2E coverage and production hardening remain unfinished.

## Main deliverables

- `apps/web`: Navo UI, workspace-scoped resource APIs, EmailSink simulation endpoints, conversations, tasks, CRM Mirror views and server queries/actions.
- `apps/worker`: Redis/BullMQ entrypoint for long-running research and workflow execution.
- `packages/db`: Drizzle schema, migrations and a complete deterministic demo seed.
- `packages/domain`: schemas, RBAC, policies, scoring, reply taxonomy, memory/action rules and graph validation.
- `packages/agents`: provider-neutral structured generation with DeepSeek and MockAI adapters.
- `packages/workflows`: deterministic outbound and reply workflow runtime plus the fixed node registry.
- `packages/ui`: Navo design tokens and reusable accessible components.

## MVP acceptance scenarios

1. Edit or seed seller Knowledge and ICP, create a Mission, select a bounded account target, research its website, persist literal Evidence and Signals, qualify it deterministically and save an outreach message as `DRAFT`.
2. Review the persisted Completion Brief and saved DRAFT in the workspace; edit only an OUTBOUND DRAFT with revision/original preservation, optionally create one manual follow-up task, or retry a FAILED Mock Mission as a linked new Mission. The Mission runner creates no sending Approval, and any outbound behavior remains EmailSink simulation only and does not send real mail.
3. Simulate a reply, bounce, unsubscribe or complaint against an EmailSink message.
4. For a reply, deterministically create or update the conversation, classification, summary, account memory, next action proposal, manual task, CRM Mirror event and analytics/audit records.
5. Inspect Mission plan steps, events, Play versions, Runs and Node Runs without exposing secrets or unredacted sensitive inputs.

## Remaining work and explicit non-goals

- Browser E2E coverage does not yet prove the complete Knowledge → Mission → Research → Evidence → Qualification → DRAFT execution loop. DB integration coverage exercises draft revision/original preservation, follow-up idempotency and retry lineage/queue-failure handling; broader route, accessibility and E2E coverage remain unfinished.
- Multi-account Mission scheduling, richer target selection, production observability, accessibility hardening and real integration adapters remain unfinished.
- Real mailbox sending, unrestricted autonomous outreach, production deployment readiness and a complete CRM are outside this MVP.

## Acceptance commands

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

Run `pnpm dev` and `pnpm --filter @navo/worker dev` in separate terminals before exercising
Mission execution. `db:migrate` and `db:seed` mutate the local disposable PostgreSQL
database. Use `AI_PROVIDER=mock`, `EMAIL_PROVIDER=sink` and `EMAIL_TEST_MODE=true` for the
local demo.
