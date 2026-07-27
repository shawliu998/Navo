# Navo product context

Navo is an operator-first agent-native account-intelligence and outbound-orchestration workspace for industrial B2B teams. Missions are durable work objects that transform evidence into verified decisions, approved actions and next-best actions.

It helps operators turn target accounts, external signals and source-backed research into qualified opportunities, relevant contacts, outbound work, replies and concrete next actions.

Its product identity comes from the operator workflow, not from agent infrastructure, local deployment or security administration. Those are supporting constraints and secondary settings surfaces.

## Agent-native product model

Navo is built around Missions rather than conversations. Operators define outcomes; Navo plans and executes bounded work, verifies results against persisted evidence, and returns decisions and actions to the operating workflow.

```text
Observe → Plan → Execute → Verify → Decide → Learn → Continue
```

The loop maps to existing product objects: Accounts, Signals, Evidence and Memory provide context; `MissionPlan` structures the work; registered tools and worker runs execute it; evidence, rules and persisted results verify it; operator approvals decide external actions; conversations, memory and tasks retain the outcome; and a next-best action or bounded successor Mission continues the work.

## Primary user jobs

1. Understand which accounts deserve attention and why.
2. Verify facts, signals and AI inferences before using them.
3. Move qualified accounts through research, contacts, missions, message preparation and review.
4. Handle replies and turn them into owned next-best actions.
5. Retain account memory while keeping CRM as the source of truth.

## Primary navigation

- Overview
- Accounts
- Signals
- Missions
- Approvals
- Inbox
- Analytics
- Settings, fixed at the bottom of the sidebar

Advanced capabilities such as plays, runs, sequences, knowledge, integrations and CRM mirror remain available through contextual links or Settings. Agents, Tool Status, audit and infrastructure views are secondary administration surfaces. They are not primary navigation destinations.

## Account workspace

Every account uses five stable sections:

- Overview
- Intelligence
- Contacts
- Outreach
- Activity

The application is a dense desktop-first B2B product, not a marketing site and not a chat-first interface. Existing APIs, database structures, workflow states and outbound safety boundaries are product constraints.

The active UI scope and page priority are defined in `PRODUCT_UI_SCOPE.md`.
