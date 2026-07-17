# Navo

Navo is an autonomous AI growth agent for industrial B2B sales. A user gives Navo a natural-language objective; Navo plans the work, selects and researches accounts, extracts evidence-backed opportunities, qualifies and ranks them, saves an English outreach draft, creates the next task, updates account memory and completes the Mission.

## Autonomous Mission flow

```text
Natural-language objective → Mission Planner → Structured Plan
→ Select target Accounts → Bounded website fetch → Company Research
→ Literal Evidence + Opportunity Signals → Explainable Qualification
→ Account Ranking → English DRAFT → Next-step Task
→ Account Memory → Mission Result
```

A Mission is planned on the server and consumed by the BullMQ worker. The immutable initial
specification stays in `agent_missions.plan`; `agent_plan_steps` is the execution truth. Ordinary
step scheduling is deterministic, while bounded structured decisions are made after website,
qualification and ranking checkpoints. The default bound is 20 iterations.
The planner receives one schema-aware repair attempt before an observable deterministic fallback.
Account selection starts with a small batch: website checkpoints can add replacement candidates,
and qualification checkpoints can add candidates and re-enter Fetch → Research → Signals →
Qualification. Expansion never exceeds the Mission account or iteration bounds.

An explicitly enabled Mission chain adds a second bounded loop across Missions. After a Mission
completes, a structured AI decision either stops or creates exactly one successor. Discovery can
progress into outreach preparation for the strongest qualified account; a no-match result can
continue with unused workspace accounts. Every successor stores its parent, root and depth,
PostgreSQL permits only one child per parent, and the chain stops at `maximumContinuations`.
The workspace pause defers successor creation; resuming Navo requeues eligible deferred decisions.

The Agent Director closes the outermost loop. BullMQ emits a lightweight `agent.tick` every
minute; the persisted profile interval determines when a real evaluation is due. When no active
Mission blocks work, the Director reads eligible accounts, recent signals, open tasks and prepared
Missions, then chooses `WAIT`, `RESUME_MISSION` or `CREATE_MISSION`. New root Missions are linked
to a unique Director tick and enter the same bounded planning and continuation runtime. Persisted
cooldown, active-Mission and daily-root limits prevent duplicate or unbounded starts. Pausing Navo
suppresses Director work; resuming schedules an immediate evaluation.

Registered tools are Load Seller Knowledge, Select Target Accounts, Create Target Account,
Website Fetch, Research Company, Extract Signals, Qualify Account, Rank Accounts, Generate
Outreach, Create Task, Update Memory and Summarize Mission.

Demo objective:

```text
Find high-fit packaging and automotive component manufacturers in DACH,
research their automation and quality-inspection needs,
select the strongest opportunity,
and prepare a concise English outreach draft.
```

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

This is a local demonstration, not a production system. It does not send real email, modify an
external CRM, search LinkedIn or contact databases, produce quotes or contracts, run arbitrary
code, provide multi-agent collaboration or claim production-grade security.

## Stack

- pnpm workspace and Turborepo
- Next.js App Router and TypeScript
- PostgreSQL with Drizzle ORM
- Redis and BullMQ
- Vitest and Playwright

## Mock and DeepSeek modes

`AI_PROVIDER=mock` is the default deterministic mode. It needs no API key or model call, and
seeded `.example` websites are read from repository-local HTML fixtures. It is used by tests.

Set `AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` and `DEEPSEEK_MODEL` to
use the existing server-only DeepSeek adapter. Planner, checkpoint, research, signal,
qualification, ranking, draft and summary outputs all pass through Zod, and the adapter sends
the requested JSON Schema with every structured call. Planner, company-research and outreach
contracts have live DeepSeek smoke coverage; a complete paid-provider end-to-end run is not
part of the deterministic test suite. Linear next-step selection is handled in code to avoid
an unnecessary model call for every mission step. After seeding local demo data, run a paid live
opportunity-discovery smoke test with `pnpm smoke:deepseek`; it creates and executes one Mission
and prints its ID, planner mode, outcome and summary. Set `DEEPSEEK_SMOKE_CHAIN=1` to also exercise
the real continuation decision, successor planning and successor execution.

Website content is untrusted input. Research applies SSRF, response-size, page-size,
redirect and bounded-page limits; evidence quotes must be literal excerpts from fetched
source text and source URLs must be among the fetched pages. Generated outreach is saved as
`DRAFT` only. The MVP does not create a sending Approval, does not support real email
sending, and is not production-ready. EmailSink reply, bounce, unsubscribe and complaint
events are simulations for exercising downstream workflows.

## Local setup

The fastest disposable-demo path is:

```bash
pnpm run bootstrap
pnpm run dev:mock
```

`bootstrap` installs dependencies, starts PostgreSQL and Redis, waits for them, runs
migrations, creates `.env.local` from `.env.example` only when it is missing, and seeds only
an empty workspace. It does not replace an existing environment file or reset existing data.
Open `http://localhost:3100`, choose **DACH industrial outreach**, review the populated
mission, and select **Create & start**.

In another terminal, check the running Web app, database, Redis and BullMQ worker with:

```bash
pnpm run health
```

`pnpm run dev:mock` explicitly forces the deterministic golden path without changing
`.env.local`. Use `pnpm dev` when you want the provider configured in `.env.local`, such as
DeepSeek. `pnpm run doctor` performs environment and dependency checks without starting the
app, and `pnpm run dev:raw` bypasses the preflight when debugging Turbo itself. Local
development also detects synthetic `198.18/15` DNS proxies so real public websites remain
researchable without allowing literal benchmark-IP URLs.

The manual equivalent is `pnpm install`, `docker compose up -d`, `pnpm db:migrate`, and
`pnpm db:seed`. These commands target the local demo PostgreSQL database; `db:seed` changes
that database and should not be run against data that must be preserved.

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
