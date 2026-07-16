# Navo Architecture

## Shape

Navo is a TypeScript monorepo with a Next.js application, a separately runnable worker, PostgreSQL as the source of truth, Redis/BullMQ for queue transport, and small domain packages that do not depend on third-party SDK types.

The web layer handles authentication, workspace-scoped resource APIs, interactive product screens and short transactions. Long-running research and workflow execution belong to the worker. The MVP can execute the same domain services synchronously for deterministic test runs while preserving the queue boundary used by production-style execution.

## Product flow

The primary outbound flow is:

```text
Knowledge + ICP
→ Account import and deduplication
→ Research
→ Evidence + Inference
→ Qualification
→ Contact and Persona
→ Play and Message Generation
→ Policy Check
→ Human Approval
→ Sequence
→ EmailSink
```

The reply intelligence flow is:

```text
EmailSink event
→ Conversation
→ Reply Classification
→ Conversation Summary
→ Account Memory
→ Next Best Action
→ Manual Task
→ CRM Mirror
→ Analytics + Audit
```

Reply handling is deterministic and idempotent for the same simulated event. A reply Play pins its published version and records each step as a Node Run, so operators can inspect inputs, outputs, retries, duration and errors.

## Trust boundaries

- Every domain record carries `workspaceId`; repository methods require it as an explicit argument.
- Server routes derive workspace membership and role from the server session and never trust a client-supplied workspace alone.
- AI providers only return schema-validated structured output. They cannot publish Plays, approve actions, send messages, modify CRM state directly or bypass policy.
- Evidence, inference, decisions, conversation summaries and memory facts remain distinct records with source references and provenance.
- Sending passes RBAC, suppression, historical-send, approved-claim, evidence, approval, idempotency, recipient and test-mode policies.
- Unsubscribe, bounce and spam-complaint events update suppression state and prevent later sends.
- Secrets remain server-only. Run inputs/outputs are recursively redacted before persistence, and API keys are never sent to the browser, logs, traces or database.

## Workflow model

`Play` is the mutable product identity. `PlayVersion` is an immutable graph snapshot after publication. `PlayNode` and `PlayEdge` belong to a version. `Run` pins a version; each `NodeRun` stores status, attempt, sanitized input/output, duration, provider/model usage and errors. Human approval moves an outbound run into `WAITING`; its recorded decision resumes deterministic routing.

The fixed node registry covers outbound and reply workflows. Reply-oriented nodes include Reply Received Trigger, Load Account Memory, Reply Classification, Summarize Conversation, Update Memory, Propose Next Action, Create Manual Task and CRM Mirror. Arbitrary code execution nodes and a plugin marketplace are outside the MVP.

## Engagement, memory and CRM Mirror

A `Conversation` groups ordered inbound and outbound messages for an account/contact. Classifications use a constrained taxonomy: positive, question, referral, not now, not interested, out of office, unsubscribe, bounce, spam complaint and unknown. Summaries and memory facts record provenance instead of silently replacing source messages.

Next-action proposals are recommendations, not autonomous customer-facing actions. They may create an assigned manual task with due date and rationale. CRM Mirror records normalized connection, contact/account/opportunity and event projections for demo and adapter testing; it is not a complete CRM or deal pipeline.

## AI provider boundary

Domain code consumes an `AIProvider.generateStructured()` contract. `DeepSeekAIProvider` is the default real provider, uses DeepSeek's OpenAI-compatible server-side API, validates output through Zod and performs bounded retries. `MockAIProvider` is deterministic and powers seed/demo/tests, ensuring every main workflow remains usable without a network call or paid credential. Provider SDK and HTTP shapes never escape the adapter.

Real DeepSeek calls require a server-only `DEEPSEEK_API_KEY`; the key must never be printed, persisted or exposed through client environment variables. Automated tests do not make real DeepSeek requests.

## Local infrastructure and delivery safety

Docker Compose exposes PostgreSQL on `54322` and Redis on `56379` to avoid common local port collisions. Outbound email always uses an in-memory/database EmailSink in the MVP. Reply, bounce, unsubscribe and complaint endpoints simulate provider webhooks and exercise the full domain flow; they do not send real email or call a real mailbox provider.

External Gmail, Outlook, HubSpot, Resend, Firecrawl and contact-data integrations remain adapters or placeholders behind explicit interfaces.
