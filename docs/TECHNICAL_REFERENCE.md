# Navo

Navo is an autonomous AI growth agent for industrial B2B sales. A user gives Navo a natural-language objective; Navo plans the work, selects and researches accounts, extracts evidence-backed opportunities, qualifies and ranks them, saves an English outreach draft, creates the next task, updates account memory and completes the Mission.

> **作品定位 / Portfolio positioning**
>
> 这不是一个套壳聊天机器人，而是一个可规划、可调用工具、可持久化执行、可人工审批、可回放评测的 bounded agent。它展示的是如何把不稳定的模型能力封装进有证据、有边界、有后置校验的业务系统。

## What this demonstrates

- **Structured planning:** a natural-language outcome becomes a schema-validated `MissionPlan`, with one repair attempt and an observable deterministic fallback.
- **Agent execution:** the worker selects tools and advances durable steps under account, iteration, cost and continuation bounds.
- **Evidence grounding:** facts, signals, qualifications and messages retain source URLs and literal excerpts; website content is treated as untrusted input.
- **Human control:** outbound work remains DRAFT-only until a reviewer decision is recorded; completed checkpoints become read-only.
- **Postcondition enforcement:** persisted account IDs, names, evidence and workflow outputs override unsupported model narration before the result is saved.
- **Evaluation discipline:** deterministic tests cover failures and idempotency; Playwright covers the product loop; a paid DeepSeek V4 smoke test covers the real structured-model path.

The portfolio story is the following single loop:

```text
Rheinwerk account → source evidence → explainable qualification
→ bounded Mission → human approval → EmailSink reply
→ one next-best action → one owner-assigned task
```

![Account intelligence workspace](../artifacts/portfolio/01-account-intelligence.png)

![Bounded mission workbench](../artifacts/portfolio/02-mission-workbench.png)

![Evidence-backed human checkpoint](../artifacts/portfolio/03-human-checkpoint.png)

![Reply intelligence and next best action](../artifacts/portfolio/04-reply-loop.png)

### Verified package status

| Check | Result |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` | Passed across all 7 workspace packages |
| `pnpm test` | Passed across domain, agent, workflow, worker, web and database packages |
| Database integration | 13/13 passed against local PostgreSQL |
| `pnpm build` | Next.js production build passed |
| `pnpm e2e` | 15/15 Playwright scenarios passed from a clean seed |
| `pnpm smoke:ai` | Workspace-selected real provider, `plannerMode: AI`, no fallback, grounded account/evidence result |

The live V4 validation covers entity consistency across the selected account, generated fixtures,
persistence, and the final narrative. Navo renders fixtures for the selected account and treats
persisted IDs, names, and artifacts as authoritative. A regression test injects a mismatched
company name and verifies that persistence retains the selected account identity.

For the concise review path, read the [3–5 minute demo script](DEMO_SCRIPT.md) and the
[project story](PROJECT_STORY.zh-CN.md).

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
suppresses Director work; resuming schedules an immediate evaluation. Operators can edit the
interval, cooldown, active-Mission limit, daily-root limit and enabled state on the Capabilities
page. Account imports, inbound replies, new follow-up tasks and settled Missions persist a wake
request and advance the next Director tick; the one-minute scheduler remains the fallback if the
immediate Redis enqueue is unavailable.

Inbound EmailSink replies enter a dedicated event-driven loop instead of a generic discovery
Mission. A unique `(workspace, inbound message)` key creates at most one `REPLY_FOLLOW_UP`
Mission. Its fixed bounded plan loads only that persisted reply, asks the configured provider for
one approval-required reply DRAFT, reuses or creates the internal next-action task, links
source-message memory and writes a deterministic completion summary. It never re-runs website
research and never sends the draft. Queue submission failures leave the same Mission `READY` for
Director retry rather than creating a duplicate.

Resend inbound webhooks are supported at `POST /api/webhooks/resend/inbound`. The route verifies
the Svix signature using `RESEND_WEBHOOK_SECRET`, ignores non-`email.received` events, and queues
a worker job that fetches the full email from Resend with `RESEND_API_KEY`. The worker matches
the original outbound Navo message via `in-reply-to`, `references`, or `x-navo-message-id`,
persists the reply idempotently through the same reply loop as EmailSink, and creates exactly
one `REPLY_FOLLOW_UP` mission. Duplicate webhook deliveries do not create duplicate inbound
messages, tasks, or missions.

For real reply matching, the outbound sender must persist the email `Message-ID` that recipients
will return in `In-Reply-To`/`References` as `messages.providerMessageId`, or arrange for the reply
to carry Navo's internal message UUID in `X-Navo-Message-Id`. The current MVP still sends no real
outbound email; this inbound path activates once a compatible sender or Reply-To token is wired.

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

## Mock and workspace AI modes

`AI_PROVIDER=mock` is the default deterministic mode. It needs no API key or model call, and
seeded `.example` websites are read from repository-local HTML fixtures. It is used by tests.

For normal use, open **Settings → AI connection**, save and test either DeepSeek or an
OpenAI-compatible Chat Completions endpoint. Mission planning and worker execution resolve that
tested workspace connection. `AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` and
`DEEPSEEK_MODEL` remain a server-only fallback for existing local environments. The default live model is `deepseek-v4-flash`;
structured operations explicitly use non-thinking mode for predictable JSON contracts. Planner, checkpoint, research, signal,
qualification, ranking, draft and summary outputs all pass through Zod, and the adapter sends
the requested JSON Schema with every structured call. Planner, company-research and outreach
contracts and a complete opportunity-discovery Mission have live provider smoke coverage; this
paid, non-deterministic check is intentionally outside the deterministic test suite. Linear
next-step selection is handled in code to avoid an unnecessary model call for every mission step.
After seeding local demo data and testing the workspace connection, run `pnpm smoke:ai`; it creates
and executes one Mission and prints its ID, provider, model, planner mode, outcome and summary.
`pnpm smoke:deepseek` remains as a compatibility alias. Set `DEEPSEEK_SMOKE_CHAIN=1` to also exercise
the real continuation decision, successor planning and successor execution. The release smoke
verified both the discovery and outreach-preparation Missions at 100% with `plannerMode: AI`, no
planner fallback, and exactly one persisted `DRAFT`; no email was sent.

Website content is untrusted input. Research applies SSRF, response-size, page-size,
redirect and bounded-page limits; evidence quotes must be literal excerpts from fetched
source text and source URLs must be among the fetched pages. Generated outreach is saved as
`DRAFT` only. Human approvals authorize only the controlled demo delivery step; the MVP does
not support real email sending and is not production-ready. EmailSink reply, bounce, unsubscribe and complaint
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
`postgresql://navo:navo@localhost:55432/navo`.

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

See [ARCHITECTURE.md](../ARCHITECTURE.md) and
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for system boundaries and dependency notices.
