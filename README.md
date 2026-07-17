# Navo

Navo is an AI account intelligence and outbound orchestration workspace for industrial exporters. It connects evidence-backed account research, qualification, controlled outreach and human approval with reply intelligence, account memory, next-best-action tasks and a lightweight CRM Mirror.

## MVP flow

```text
Accounts → Signals → Research → Qualification → Contacts → Plays
→ Message Generation → Approval → Sequence → EmailSink
→ Reply Classification → Conversation Summary → Account Memory
→ Next Best Action → Manual Task → CRM Mirror → Analytics
```

The MVP deliberately stops short of becoming a complete CRM, customer-support product, WebChat platform or unrestricted automated sender.

## Stack

- pnpm workspace and Turborepo
- Next.js App Router and TypeScript
- PostgreSQL with Drizzle ORM
- Redis and BullMQ
- Vitest and Playwright

## AI and email safety

DeepSeek is the default real AI provider. Configure `DEEPSEEK_API_KEY` only in a server-side local environment file; never commit it or expose it to browser code. Tests and the seeded demo use deterministic `MockAIProvider` behavior and do not call a paid API.

Outbound email is EmailSink-only in this MVP. Simulated reply, bounce, unsubscribe and complaint events exercise the downstream workflow without sending real mail.

## Local setup

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

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

See [PLAN.md](./PLAN.md), [ARCHITECTURE.md](./ARCHITECTURE.md) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for delivery scope, system boundaries and dependency notices.
