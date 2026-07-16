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

Validate the workspace with:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

See [PLAN.md](./PLAN.md), [ARCHITECTURE.md](./ARCHITECTURE.md) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for delivery scope, system boundaries and dependency notices.
