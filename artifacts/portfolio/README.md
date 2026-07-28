# Navo · Product Portfolio

This package presents Navo as an industrial B2B account-intelligence and
outbound-orchestration workspace. The recruiter demo path is:

1. `01-account-intelligence.png` — account evidence and qualification workspace
2. `02-mission-workbench.png` — evidence-to-draft mission execution
3. `03-human-checkpoint.png` — read-only record of an approved human checkpoint
4. `04-reply-loop.png` — reply triage and next-best-action loop
5. `05-analytics.png` — truthful current-workspace conversion, qualification, and
   source snapshot
6. `06-cross-screen-montage.png` — final desktop consistency review
7. `07-responsive-montage.png` — 740px Inbox and Analytics evidence

The product loop demonstrated across these screens is:

`Accounts → Signals / Evidence → Research → Qualification → Contacts → Mission / Play → Message / Sequence → Replies → Next Best Action`

The project covers product framing, workflow architecture, system boundaries,
acceptance criteria, interface design, implementation, and validation.

## Verification

- Lint: 7/7 tasks passed
- Typecheck: 7/7 tasks passed
- Tests: 192 passed; 13 configured integration tests skipped
- E2E: 15/15 passed
- Focused Inbox and Analytics browser checks: passed with zero console errors or warnings
- Responsive evidence: 740px Inbox and Analytics layouts have no horizontal overflow

Capture notes:

- Captured from a clean deterministic seed
- Synthetic companies, people, evidence, and replies only
- Deterministic UI state with reviewed outbound drafts
- Real-provider Mission validation completed with DeepSeek
