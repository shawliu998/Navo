# Navo

Navo is an AI Sales Agent Workspace for industrial exporters. It connects seller knowledge, evidence-backed account research, deterministic qualification and approval-ready outreach drafts with reply intelligence, account memory, next-best-action tasks and a lightweight CRM Mirror.

## MVP flow

```text
Knowledge → Mission → Account target → Bounded website research
→ Literal Evidence + Signals → Deterministic Qualification
→ DRAFT Outreach → Operator review (no sending Approval) → EmailSink simulation
→ Reply Classification → Conversation Summary → Account Memory
→ Next Best Action → Manual Task → CRM Mirror → Analytics
```

A Mission is planned by the web layer and consumed by the BullMQ worker. The worker loads
seller knowledge and ICP constraints, researches a bounded account website, persists literal
source evidence, extracts evidence-linked signals, applies deterministic qualification rules,
and saves an outreach message with `DRAFT` status.

## Mission follow-through

A completed Mission presents a persisted-data-only Completion Brief: qualification, the
strongest findings, evidence links, risks and the DRAFT subject. `REVIEW` is explicitly a
needs-review outcome, not a qualified account. Operators may edit an `OUTBOUND` `DRAFT`
with a revision token; the first edit preserves the original subject/body and no edit sends
mail or creates an Approval. The notification center surfaces durable Mission/task updates.

Completion Brief actions can create one workspace-scoped manual follow-up task per Mission
target. A FAILED Mock Mission can be retried only by creating a new linked Mission; the
failed history remains intact and PostgreSQL allows only one non-terminal retry for an original
Mission. Queue jobs still contain IDs only. The current Mission runner does not accumulate
provider usage, so actual Mission cost is shown as **Not measured**; plan cost is an estimate.

The MVP deliberately stops short of becoming a complete CRM, customer-support product, WebChat platform or unrestricted automated sender.

## Stack

- pnpm workspace and Turborepo
- Next.js App Router and TypeScript
- PostgreSQL with Drizzle ORM
- Redis and BullMQ
- Vitest and Playwright

## AI and email safety

`MockAIProvider` is the default and recommended deterministic mode for local development,
seeded data and tests. The local demo does not need a network call, paid credential or
DeepSeek account. `DeepSeekAIProvider` is enabled only when `AI_PROVIDER=deepseek` is set
explicitly and a server-only `DEEPSEEK_API_KEY` is configured. The repository does not claim
that paid DeepSeek calls have been verified.

Website content is untrusted input. Research applies SSRF, response-size, page-size,
redirect and bounded-page limits; evidence quotes must be literal excerpts from fetched
source text and source URLs must be among the fetched pages. Generated outreach is saved as
`DRAFT` only. The MVP does not create a sending Approval, does not support real email
sending, and is not production-ready. EmailSink reply, bounce, unsubscribe and complaint
events are simulations for exercising downstream workflows.

## Local setup

The following commands target a disposable local demo PostgreSQL database. `db:migrate` and
`db:seed` modify that database; do not run them against data that must be preserved.

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
```

Then run the web app and worker in separate terminals:

```bash
pnpm dev
```

```bash
pnpm --filter @navo/worker dev
```

Use `AI_PROVIDER=mock`,
`EMAIL_PROVIDER=sink` and `EMAIL_TEST_MODE=true` from `.env.example` for the local demo.

### Existing ExportPlay development databases

Sprint 0.2 renames the Compose project, PostgreSQL database/user and named volumes from
`exportplay` to `navo`. Docker does not rename volumes in place. The previous
`exportplay_exportplay-postgres` and `exportplay_exportplay-redis` volumes are therefore
left untouched, while `docker compose up -d` creates the new `navo_navo-postgres` and
`navo_navo-redis` volumes. This prevents an automatic, destructive conversion, but the
new stack initially appears empty until it is seeded or restored.

Before updating a development checkout that contains data worth retaining, create a dump
while the old stack is running:

```bash
docker compose exec -T postgres pg_dump -U exportplay -d exportplay -Fc > navo-pre-0.2.dump
```

After updating, start the renamed stack, run its migrations, then restore without carrying
the old database owner across:

```bash
docker compose up -d postgres redis
pnpm db:migrate
docker compose exec -T postgres pg_restore -U navo -d navo --clean --if-exists --no-owner --no-privileges < navo-pre-0.2.dump
```

For disposable demo data, skip the restore and run `pnpm db:seed`. If the old stack is no
longer running, locate its retained volume with `docker volume ls` and temporarily start
the prior repository revision to produce the dump. Do not run `docker compose down -v`
until the backup has been verified. A local `.env.local` that deliberately targets the old
database may be retained temporarily; the checked-in default now uses
`postgresql://navo:navo@localhost:54322/navo`.

Validate the workspace with:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

The full validation sequence assumes PostgreSQL and Redis are running, the database has
been migrated and seeded, the web server is available on port 3100, and the worker is
running for Mission execution. Playwright writes ignored reports/screenshots on failure;
review `git status` before committing.

See [PLAN.md](./PLAN.md), [ARCHITECTURE.md](./ARCHITECTURE.md) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for delivery scope, system boundaries and dependency notices.
