import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const tenantColumns = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
  revision: integer("revision").default(1).notNull(),
});
const simpleTenantTable = (name: string) => pgTable(name, { ...tenantColumns(), name: text("name"), status: text("status").default("ACTIVE").notNull(), data: jsonb("data").default({}).notNull() });

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(), email: text("email").notNull().unique(), name: text("name").notNull(), passwordHash: text("password_hash"), locale: text("locale").default("zh-CN").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), slug: text("slug").notNull().unique(), plan: text("plan").default("DEMO").notNull(), website: text("website"), descriptionZh: text("description_zh"), descriptionEn: text("description_en"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(), revision: integer("revision").default(1).notNull(),
});
export const workspaceMembers = pgTable("workspace_members", { ...tenantColumns(), userId: uuid("user_id").notNull(), role: text("role").notNull() }, (table) => [uniqueIndex("workspace_member_unique").on(table.workspaceId, table.userId)]);
export const sessions = pgTable("sessions", { id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull(), tokenHash: text("token_hash").notNull().unique(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() });
export const invitations = simpleTenantTable("invitations");

export const products = pgTable("products", { ...tenantColumns(), nameZh: text("name_zh").notNull(), nameEn: text("name_en").notNull(), category: text("category"), descriptionZh: text("description_zh"), descriptionEn: text("description_en"), capabilities: jsonb("capabilities").default([]).notNull(), prohibitedClaims: jsonb("prohibited_claims").default([]).notNull(), status: text("status").default("ACTIVE").notNull() });
export const productDocuments = simpleTenantTable("product_documents");
export const documentChunks = simpleTenantTable("document_chunks");
export const approvedClaims = pgTable("approved_claims", { ...tenantColumns(), productId: uuid("product_id"), claim: text("claim").notNull(), evidence: text("evidence"), approvedBy: uuid("approved_by"), approvedAt: timestamp("approved_at", { withTimezone: true }), expiresAt: timestamp("expires_at", { withTimezone: true }), allowedRegions: jsonb("allowed_regions").default([]).notNull(), status: text("status").default("APPROVED").notNull() });
export const icpProfiles = pgTable("icp_profiles", { ...tenantColumns(), name: text("name").notNull(), countries: jsonb("countries").default([]).notNull(), industries: jsonb("industries").default([]).notNull(), employeeMin: integer("employee_min"), employeeMax: integer("employee_max"), minimumScore: integer("minimum_score").default(60).notNull(), hardExclusions: jsonb("hard_exclusions").default([]).notNull(), scoringWeights: jsonb("scoring_weights").default({}).notNull() });
export const personas = pgTable("personas", { ...tenantColumns(), name: text("name").notNull(), department: text("department"), titles: jsonb("titles").default([]).notNull(), seniority: text("seniority"), painPoints: jsonb("pain_points").default([]).notNull(), decisionRole: text("decision_role"), recommendedCta: text("recommended_cta") });
export const caseStudies = simpleTenantTable("case_studies");
export const brandRules = simpleTenantTable("brand_rules");

export const accounts = pgTable("accounts", { ...tenantColumns(), name: text("name").notNull(), domain: text("domain"), website: text("website"), country: text("country"), industry: text("industry"), employeeRange: text("employee_range"), fitScore: integer("fit_score"), qualification: text("qualification").default("NOT_RESEARCHED").notNull(), playStatus: text("play_status").default("NOT_STARTED").notNull(), source: text("source").default("DEMO").notNull(), ownerName: text("owner_name"), lastResearchedAt: timestamp("last_researched_at", { withTimezone: true }), summary: text("summary"), riskSummary: text("risk_summary"), suppressed: boolean("suppressed").default(false).notNull() }, (table) => [uniqueIndex("accounts_workspace_domain_unique").on(table.workspaceId, table.domain), index("accounts_workspace_qualification_idx").on(table.workspaceId, table.qualification, table.updatedAt)]);
export const tags = simpleTenantTable("tags");
export const accountTags = simpleTenantTable("account_tags");
export const contacts = pgTable("contacts", {
  ...tenantColumns(),
  accountId: uuid("account_id").notNull(),
  missionId: uuid("mission_id"),
  name: text("name").notNull(),
  title: text("title"),
  persona: text("persona"),
  email: text("email"),
  emailVerification: text("email_verification").default("UNKNOWN").notNull(),
  status: text("status").default("NEW").notNull(),
  source: text("source").default("DEMO").notNull(),
  sourceUrl: text("source_url"),
  sourceQuote: text("source_quote"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  suppressed: boolean("suppressed").default(false).notNull(),
}, (table) => [index("contacts_workspace_mission_idx").on(table.workspaceId, table.missionId, table.accountId)]);
export const signals = pgTable("signals", { ...tenantColumns(), accountId: uuid("account_id").notNull(), missionId: uuid("mission_id"), type: text("type").notNull(), summary: text("summary").notNull(), rationale: text("rationale"), evidenceUrls: jsonb("evidence_urls").default([]).notNull(), confidence: numeric("confidence", { precision: 4, scale: 3 }), priority: text("priority").default("MEDIUM").notNull(), detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(), status: text("status").default("NEW").notNull(), triggeredPlayId: uuid("triggered_play_id"), ownerName: text("owner_name") });
export const evidence = pgTable("evidence", { ...tenantColumns(), accountId: uuid("account_id").notNull(), type: text("type").notNull(), title: text("title").notNull(), summary: text("summary").notNull(), quote: text("quote"), sourceUrl: text("source_url"), pageTitle: text("page_title"), observedAt: timestamp("observed_at", { withTimezone: true }).notNull(), fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(), confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(), accessible: boolean("accessible").default(true).notNull(), contentHash: text("content_hash"), metadata: jsonb("metadata").default({}).notNull() }, (table) => [index("evidence_workspace_account_idx").on(table.workspaceId, table.accountId, table.observedAt)]);
export const inferences = pgTable("inferences", { ...tenantColumns(), accountId: uuid("account_id").notNull(), statement: text("statement").notNull(), evidenceIds: jsonb("evidence_ids").default([]).notNull(), confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(), agentVersion: text("agent_version").notNull() });
export const qualificationResults = pgTable("qualification_results", { ...tenantColumns(), accountId: uuid("account_id").notNull(), missionId: uuid("mission_id"), score: integer("score").notNull(), status: text("status").notNull(), scoreBreakdown: jsonb("score_breakdown").notNull(), reasons: jsonb("reasons").default([]).notNull(), risks: jsonb("risks").default([]).notNull(), evidenceIds: jsonb("evidence_ids").default([]).notNull(), inferenceIds: jsonb("inference_ids").default([]).notNull(), recommendedAction: text("recommended_action"), confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull() });
export const accountOwners = simpleTenantTable("account_owners");
export const importJobs = simpleTenantTable("import_jobs");
export const importRows = simpleTenantTable("import_rows");
export const savedViews = simpleTenantTable("saved_views");

export const plays = pgTable("plays", { ...tenantColumns(), name: text("name").notNull(), description: text("description"), status: text("status").default("DRAFT").notNull(), activeVersionId: uuid("active_version_id"), draftVersionId: uuid("draft_version_id"), ownerName: text("owner_name"), lastRunAt: timestamp("last_run_at", { withTimezone: true }), successRate: numeric("success_rate", { precision: 5, scale: 2 }) });
export const playVersions = pgTable("play_versions", { ...tenantColumns(), playId: uuid("play_id").notNull(), versionNumber: integer("version_number").notNull(), status: text("status").default("DRAFT").notNull(), basedOnVersionId: uuid("based_on_version_id"), graphHash: text("graph_hash"), publishedAt: timestamp("published_at", { withTimezone: true }), graph: jsonb("graph").default({ nodes: [], edges: [] }).notNull() }, (table) => [uniqueIndex("play_version_unique").on(table.workspaceId, table.playId, table.versionNumber)]);
export const playNodes = pgTable("play_nodes", { ...tenantColumns(), playVersionId: uuid("play_version_id").notNull(), logicalNodeId: text("logical_node_id").notNull(), type: text("type").notNull(), label: text("label").notNull(), position: jsonb("position").notNull(), config: jsonb("config").default({}).notNull() });
export const playEdges = pgTable("play_edges", { ...tenantColumns(), playVersionId: uuid("play_version_id").notNull(), edgeKey: text("edge_key").notNull(), sourceNodeId: text("source_node_id").notNull(), targetNodeId: text("target_node_id").notNull(), branch: text("branch") });
export const playPublications = simpleTenantTable("play_publications");
export const runs = pgTable("runs", { ...tenantColumns(), playId: uuid("play_id").notNull(), playVersionId: uuid("play_version_id").notNull(), accountId: uuid("account_id"), runNumber: integer("run_number").notNull(), trigger: text("trigger").notNull(), status: text("status").notNull(), currentNode: text("current_node"), startedAt: timestamp("started_at", { withTimezone: true }).notNull(), completedAt: timestamp("completed_at", { withTimezone: true }), durationMs: integer("duration_ms"), estimatedCost: numeric("estimated_cost", { precision: 10, scale: 5 }).default("0").notNull(), errorCount: integer("error_count").default(0).notNull(), ownerName: text("owner_name"), context: jsonb("context").default({}).notNull() }, (table) => [index("runs_workspace_status_idx").on(table.workspaceId, table.status, table.startedAt)]);
export const nodeRuns = pgTable("node_runs", { ...tenantColumns(), runId: uuid("run_id").notNull(), logicalNodeId: text("logical_node_id").notNull(), nodeLabel: text("node_label").notNull(), attempt: integer("attempt").default(1).notNull(), status: text("status").notNull(), input: jsonb("input").default({}).notNull(), output: jsonb("output").default({}).notNull(), startedAt: timestamp("started_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }), durationMs: integer("duration_ms"), provider: text("provider"), model: text("model"), promptVersion: text("prompt_version"), inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"), estimatedCost: numeric("estimated_cost", { precision: 10, scale: 5 }), errorCode: text("error_code"), errorMessage: text("error_message"), logs: jsonb("logs").default([]).notNull() }, (table) => [uniqueIndex("node_run_attempt_unique").on(table.workspaceId, table.runId, table.logicalNodeId, table.attempt)]);
export const agentOutputs = simpleTenantTable("agent_outputs");
export const toolCalls = simpleTenantTable("tool_calls");
export const runScopes = simpleTenantTable("run_scopes");

export const agentProfiles = pgTable("agent_profiles", {
  ...tenantColumns(),
  name: text("name").default("Navo Growth Agent").notNull(),
  purpose: text("purpose").notNull(),
  status: text("status").default("IDLE").notNull(),
  operatingMode: text("operating_mode").default("AUTONOMOUS").notNull(),
  knowledgeHealth: integer("knowledge_health").default(0).notNull(),
  connectedTools: jsonb("connected_tools").default([]).notNull(),
  capabilities: jsonb("capabilities").default([]).notNull(),
  currentActivity: text("current_activity"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  directorEnabled: boolean("director_enabled").default(false).notNull(),
  directorIntervalMinutes: integer("director_interval_minutes").default(15).notNull(),
  directorCooldownMinutes: integer("director_cooldown_minutes").default(60).notNull(),
  directorMaxActiveMissions: integer("director_max_active_missions").default(1).notNull(),
  directorDailyMissionLimit: integer("director_daily_mission_limit").default(3).notNull(),
  lastDirectorDecisionAt: timestamp("last_director_decision_at", { withTimezone: true }),
  nextDirectorTickAt: timestamp("next_director_tick_at", { withTimezone: true }),
  lastDirectorDecision: jsonb("last_director_decision").default({}).notNull(),
}, (table) => [uniqueIndex("agent_profile_workspace_unique").on(table.workspaceId)]);

export const agentMissions = pgTable("agent_missions", {
  ...tenantColumns(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  objective: text("objective").notNull(),
  desiredOutcome: text("desired_outcome"),
  status: text("status").default("DRAFT").notNull(),
  operatingMode: text("operating_mode").default("APPROVAL_CONTROLLED").notNull(),
  playId: uuid("play_id"),
  inputSource: text("input_source").default("DEMO_ACCOUNTS").notNull(),
  approvalPolicy: text("approval_policy").default("REQUIRED_FOR_OUTBOUND").notNull(),
  targetCount: integer("target_count").default(0).notNull(),
  processedCount: integer("processed_count").default(0).notNull(),
  qualifiedCount: integer("qualified_count").default(0).notNull(),
  pendingApprovalCount: integer("pending_approval_count").default(0).notNull(),
  progress: integer("progress").default(0).notNull(),
  currentStep: text("current_step"),
  agentSummary: text("agent_summary"),
  maximumAccounts: integer("maximum_accounts"),
  estimatedCostLimit: numeric("estimated_cost_limit", { precision: 10, scale: 2 }),
  actualCost: numeric("actual_cost", { precision: 10, scale: 5 }).default("0").notNull(),
  testMode: boolean("test_mode").default(true).notNull(),
  stopConditions: jsonb("stop_conditions").default([]).notNull(),
  targetCriteria: jsonb("target_criteria").default({}).notNull(),
  plan: jsonb("plan").default({}).notNull(),
  workingMemory: jsonb("working_memory").default({}).notNull(),
  result: jsonb("result").default({}).notNull(),
  error: text("error"),
  iteration: integer("iteration").default(0).notNull(),
  maximumIterations: integer("maximum_iterations").default(20).notNull(),
  replanCount: integer("replan_count").default(0).notNull(),
  retryOfMissionId: uuid("retry_of_mission_id"),
  parentMissionId: uuid("parent_mission_id"),
  rootMissionId: uuid("root_mission_id"),
  continuationDepth: integer("continuation_depth").default(0).notNull(),
  maximumContinuations: integer("maximum_continuations").default(0).notNull(),
  autoContinue: boolean("auto_continue").default(false).notNull(),
  directorTickId: uuid("director_tick_id"),
  targetAccountId: uuid("target_account_id"),
  provider: text("provider"),
  model: text("model"),
  plannerMode: text("planner_mode").default("AI").notNull(),
  plannerFallbackReason: text("planner_fallback_reason"),
  queuedAt: timestamp("queued_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  index("agent_missions_workspace_status_idx").on(table.workspaceId, table.status, table.updatedAt),
  index("agent_missions_workspace_retry_of_idx").on(table.workspaceId, table.retryOfMissionId, table.updatedAt),
  index("agent_missions_workspace_root_idx").on(table.workspaceId, table.rootMissionId, table.continuationDepth),
  uniqueIndex("agent_missions_parent_unique").on(table.workspaceId, table.parentMissionId).where(sql`"parent_mission_id" IS NOT NULL`),
  uniqueIndex("agent_missions_director_tick_unique").on(table.workspaceId, table.directorTickId).where(sql`"director_tick_id" IS NOT NULL`),
  uniqueIndex("agent_missions_active_retry_unique").on(table.workspaceId, table.retryOfMissionId).where(sql`"retry_of_mission_id" IS NOT NULL AND "status" NOT IN ('COMPLETED', 'FAILED', 'CANCELLED')`),
]);

export const agentMissionTargets = pgTable("agent_mission_targets", {
  ...tenantColumns(),
  missionId: uuid("mission_id").notNull(),
  accountId: uuid("account_id").notNull(),
  runId: uuid("run_id"),
  approvalId: uuid("approval_id"),
  messageId: uuid("message_id"),
  taskId: uuid("task_id"),
  status: text("status").default("PENDING").notNull(),
  priority: text("priority").default("MEDIUM").notNull(),
  keySignal: text("key_signal"),
  whySelected: text("why_selected"),
  currentStep: text("current_step"),
  suggestedAction: text("suggested_action"),
  findingConfidence: numeric("finding_confidence", { precision: 4, scale: 3 }),
  metadata: jsonb("metadata").default({}).notNull(),
}, (table) => [
  uniqueIndex("agent_mission_target_unique").on(table.workspaceId, table.missionId, table.accountId),
  index("agent_mission_targets_status_idx").on(table.workspaceId, table.missionId, table.status),
]);

export const agentPlans = pgTable("agent_plans", {
  ...tenantColumns(),
  missionId: uuid("mission_id").notNull(),
  title: text("title").notNull(),
  status: text("status").default("DRAFT").notNull(),
  version: integer("version").default(1).notNull(),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  estimatedCost: numeric("estimated_cost", { precision: 10, scale: 5 }).default("0").notNull(),
  summary: text("summary"),
}, (table) => [uniqueIndex("agent_plan_mission_version_unique").on(table.workspaceId, table.missionId, table.version)]);

export const agentPlanSteps = pgTable("agent_plan_steps", {
  ...tenantColumns(),
  missionId: uuid("mission_id").notNull(),
  planId: uuid("plan_id").notNull(),
  order: integer("order").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("PENDING").notNull(),
  relatedRunId: uuid("related_run_id"),
  relatedPlayNodeId: text("related_play_node_id"),
  input: jsonb("input").default({}).notNull(),
  output: jsonb("output").default({}).notNull(),
  evidence: jsonb("evidence").default([]).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  estimatedCost: numeric("estimated_cost", { precision: 10, scale: 5 }).default("0").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
}, (table) => [uniqueIndex("agent_plan_step_order_unique").on(table.workspaceId, table.planId, table.order)]);

export const agentEvents = pgTable("agent_events", {
  ...tenantColumns(),
  missionId: uuid("mission_id"),
  accountId: uuid("account_id"),
  runId: uuid("run_id"),
  approvalId: uuid("approval_id"),
  messageId: uuid("message_id"),
  taskId: uuid("task_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity").default("INFO").notNull(),
  status: text("status").default("COMPLETED").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
}, (table) => [index("agent_events_workspace_occurred_idx").on(table.workspaceId, table.occurredAt)]);

export const agentPreferences = pgTable("agent_preferences", {
  ...tenantColumns(),
  profileId: uuid("profile_id").notNull(),
  operatingMode: text("operating_mode").default("APPROVAL_CONTROLLED").notNull(),
  approvalPolicy: text("approval_policy").default("REQUIRED_FOR_OUTBOUND").notNull(),
  dailySchedule: jsonb("daily_schedule").default({ timezone: "Asia/Shanghai", enabled: true }).notNull(),
  testMode: boolean("test_mode").default(true).notNull(),
  emailSinkEnabled: boolean("email_sink_enabled").default(true).notNull(),
  maxDailyActions: integer("max_daily_actions").default(50).notNull(),
}, (table) => [uniqueIndex("agent_preferences_workspace_unique").on(table.workspaceId)]);

export const sequences = pgTable("sequences", { ...tenantColumns(), name: text("name").notNull(), status: text("status").default("DRAFT").notNull(), activeVersionId: uuid("active_version_id"), stepsCount: integer("steps_count").default(0).notNull(), enrolled: integer("enrolled").default(0).notNull(), sent: integer("sent").default(0).notNull(), replyRate: numeric("reply_rate", { precision: 5, scale: 2 }).default("0").notNull(), positiveReplyRate: numeric("positive_reply_rate", { precision: 5, scale: 2 }).default("0").notNull(), meetings: integer("meetings").default(0).notNull(), ownerName: text("owner_name") });
export const sequenceVersions = simpleTenantTable("sequence_versions");
export const sequenceSteps = pgTable("sequence_steps", { ...tenantColumns(), sequenceVersionId: uuid("sequence_version_id").notNull(), position: integer("position").notNull(), type: text("type").notNull(), config: jsonb("config").default({}).notNull() });
export const enrollments = pgTable("enrollments", { ...tenantColumns(), sequenceId: uuid("sequence_id").notNull(), sequenceVersionId: uuid("sequence_version_id").notNull(), accountId: uuid("account_id"), contactId: uuid("contact_id"), status: text("status").default("ACTIVE").notNull(), currentStep: integer("current_step").default(0).notNull() });
export const conversations = pgTable("conversations", {
  ...tenantColumns(),
  accountId: uuid("account_id").notNull(),
  contactId: uuid("contact_id"),
  subject: text("subject").notNull(),
  status: text("status").default("OPEN").notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  unreadCount: integer("unread_count").default(0).notNull(),
}, (table) => [index("conversations_workspace_account_idx").on(table.workspaceId, table.accountId, table.lastMessageAt)]);
export const messages = pgTable("messages", { ...tenantColumns(), conversationId: uuid("conversation_id"), accountId: uuid("account_id").notNull(), missionId: uuid("mission_id"), contactId: uuid("contact_id"), sequenceId: uuid("sequence_id"), runId: uuid("run_id"), approvalId: uuid("approval_id"), inReplyToMessageId: uuid("in_reply_to_message_id"), direction: text("direction").default("OUTBOUND").notNull(), channel: text("channel").default("EMAIL").notNull(), providerMessageId: text("provider_message_id"), subject: text("subject").notNull(), body: text("body").notNull(), originalSubject: text("original_subject"), originalBody: text("original_body"), status: text("status").default("DRAFT").notNull(), sentAt: timestamp("sent_at", { withTimezone: true }), receivedAt: timestamp("received_at", { withTimezone: true }), replyClassification: text("reply_classification"), evidenceIds: jsonb("evidence_ids").default([]).notNull(), claimsUsed: jsonb("claims_used").default([]).notNull(), idempotencyKey: text("idempotency_key") }, (table) => [uniqueIndex("message_idempotency_unique").on(table.workspaceId, table.idempotencyKey), index("messages_conversation_idx").on(table.workspaceId, table.conversationId, table.createdAt)]);
export const messageEvents = pgTable("message_events", { ...tenantColumns(), messageId: uuid("message_id").notNull(), eventType: text("event_type").notNull(), eventAt: timestamp("event_at", { withTimezone: true }).defaultNow().notNull(), providerEventId: text("provider_event_id"), metadata: jsonb("metadata").default({}).notNull() });
export const messageClassifications = pgTable("message_classifications", {
  ...tenantColumns(),
  conversationId: uuid("conversation_id").notNull(),
  messageId: uuid("message_id").notNull(),
  label: text("label").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  rationale: text("rationale").notNull(),
  provider: text("provider").default("DETERMINISTIC").notNull(),
  model: text("model"),
}, (table) => [uniqueIndex("message_classification_unique").on(table.workspaceId, table.messageId)]);
export const conversationSummaries = pgTable("conversation_summaries", {
  ...tenantColumns(),
  conversationId: uuid("conversation_id").notNull(),
  accountId: uuid("account_id").notNull(),
  summary: text("summary").notNull(),
  intent: text("intent"),
  objections: jsonb("objections").default([]).notNull(),
  questions: jsonb("questions").default([]).notNull(),
  commitments: jsonb("commitments").default([]).notNull(),
  updatedThroughMessageId: uuid("updated_through_message_id").notNull(),
}, (table) => [uniqueIndex("conversation_summary_unique").on(table.workspaceId, table.conversationId)]);
export const mailboxes = simpleTenantTable("mailboxes");
export const suppressionEntries = pgTable("suppression_entries", { ...tenantColumns(), email: text("email"), domain: text("domain"), reason: text("reason").notNull(), active: boolean("active").default(true).notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }) }, (table) => [index("suppression_lookup_idx").on(table.workspaceId, table.email, table.domain)]);

export const actionProposals = simpleTenantTable("action_proposals");
export const approvals = pgTable("approvals", { ...tenantColumns(), runId: uuid("run_id").notNull(), nodeRunId: uuid("node_run_id"), accountId: uuid("account_id").notNull(), contactId: uuid("contact_id"), messageId: uuid("message_id"), status: text("status").default("PENDING").notNull(), risk: text("risk").default("LOW").notNull(), originalSubject: text("original_subject").notNull(), originalBody: text("original_body").notNull(), editedSubject: text("edited_subject"), editedBody: text("edited_body"), diff: jsonb("diff").default({}).notNull(), reviewerName: text("reviewer_name"), reviewedAt: timestamp("reviewed_at", { withTimezone: true }), reason: text("reason"), persona: text("persona"), country: text("country") }, (table) => [index("approvals_workspace_status_idx").on(table.workspaceId, table.status, table.createdAt)]);
export const approvalComments = simpleTenantTable("approval_comments");
export const manualTasks = simpleTenantTable("manual_tasks");
export const memoryFacts = pgTable("memory_facts", {
  ...tenantColumns(),
  accountId: uuid("account_id").notNull(),
  missionId: uuid("mission_id"),
  contactId: uuid("contact_id"),
  conversationId: uuid("conversation_id"),
  category: text("category").notNull(),
  fact: text("fact").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  sourceType: text("source_type").default("MESSAGE").notNull(),
  sourceId: uuid("source_id"),
  evidenceIds: jsonb("evidence_ids").default([]).notNull(),
  sourceMessageId: uuid("source_message_id"),
  status: text("status").default("ACTIVE").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).defaultNow().notNull(),
  supersededBy: uuid("superseded_by"),
}, (table) => [index("memory_facts_account_idx").on(table.workspaceId, table.accountId, table.status)]);
export const nextActionProposals = pgTable("next_action_proposals", {
  ...tenantColumns(),
  accountId: uuid("account_id").notNull(),
  contactId: uuid("contact_id"),
  conversationId: uuid("conversation_id"),
  sourceMessageId: uuid("source_message_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  rationale: text("rationale").notNull(),
  priority: text("priority").default("MEDIUM").notNull(),
  status: text("status").default("PROPOSED").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  acceptedTaskId: uuid("accepted_task_id"),
}, (table) => [index("next_action_account_idx").on(table.workspaceId, table.accountId, table.status)]);
export const tasks = pgTable("tasks", {
  ...tenantColumns(),
  accountId: uuid("account_id"),
  missionId: uuid("mission_id"),
  contactId: uuid("contact_id"),
  conversationId: uuid("conversation_id"),
  nextActionProposalId: uuid("next_action_proposal_id"),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").default("FOLLOW_UP").notNull(),
  priority: text("priority").default("MEDIUM").notNull(),
  status: text("status").default("OPEN").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  assigneeName: text("assignee_name"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("tasks_workspace_status_due_idx").on(table.workspaceId, table.status, table.dueAt)]);

export const integrationConnections = pgTable("integration_connections", { ...tenantColumns(), provider: text("provider").notNull(), category: text("category").notNull(), status: text("status").default("NOT_CONNECTED").notNull(), lastSyncAt: timestamp("last_sync_at", { withTimezone: true }), permissions: jsonb("permissions").default([]).notNull(), config: jsonb("config").default({}).notNull() });
export const integrationSyncs = simpleTenantTable("integration_syncs");
export const webhookEvents = simpleTenantTable("webhook_events");
export const crmMappings = simpleTenantTable("crm_mappings");
export const crmConnections = pgTable("crm_connections", { ...tenantColumns(), provider: text("provider").notNull(), status: text("status").default("CONNECTED").notNull(), externalWorkspaceId: text("external_workspace_id"), lastSyncAt: timestamp("last_sync_at", { withTimezone: true }), config: jsonb("config").default({}).notNull() });
export const crmEvents = pgTable("crm_events", { ...tenantColumns(), connectionId: uuid("connection_id").notNull(), accountId: uuid("account_id"), opportunityMirrorId: uuid("opportunity_mirror_id"), eventType: text("event_type").notNull(), direction: text("direction").default("OUTBOUND").notNull(), status: text("status").default("SUCCEEDED").notNull(), payload: jsonb("payload").default({}).notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull() });
export const opportunityMirrors = pgTable("opportunity_mirrors", { ...tenantColumns(), connectionId: uuid("connection_id").notNull(), accountId: uuid("account_id").notNull(), externalId: text("external_id").notNull(), name: text("name").notNull(), stage: text("stage").default("PROSPECTING").notNull(), amount: numeric("amount", { precision: 12, scale: 2 }), currency: text("currency").default("USD").notNull(), ownerName: text("owner_name"), nextStep: text("next_step"), lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(), data: jsonb("data").default({}).notNull() }, (table) => [uniqueIndex("opportunity_mirror_external_unique").on(table.workspaceId, table.connectionId, table.externalId)]);

export const promptVersions = simpleTenantTable("prompt_versions");
export const modelUsage = pgTable("model_usage", { ...tenantColumns(), runId: uuid("run_id"), nodeRunId: uuid("node_run_id"), provider: text("provider").notNull(), model: text("model").notNull(), inputTokens: integer("input_tokens").default(0).notNull(), outputTokens: integer("output_tokens").default(0).notNull(), estimatedCost: numeric("estimated_cost", { precision: 10, scale: 5 }).default("0").notNull() });
export const auditLogs = pgTable("audit_logs", { ...tenantColumns(), actorId: uuid("actor_id"), actorName: text("actor_name"), action: text("action").notNull(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id"), requestId: text("request_id"), summary: text("summary"), metadata: jsonb("metadata").default({}).notNull() });
export const featureFlags = simpleTenantTable("feature_flags");
