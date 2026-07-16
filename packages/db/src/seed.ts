import { db, pool } from "./client";
import {
  accounts, approvals, approvedClaims, auditLogs, contacts, conversationSummaries, conversations, crmConnections,
  crmEvents, evidence, icpProfiles, inferences, integrationConnections, memoryFacts, messageClassifications,
  messageEvents, messages, modelUsage, nextActionProposals, nodeRuns, opportunityMirrors, personas, playEdges,
  playNodes, playVersions, plays, products, qualificationResults, runs, sequenceSteps, sequenceVersions, sequences,
  signals, suppressionEntries, tasks, users, workspaceMembers, workspaces,
} from "./schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-07-16T08:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
export const DEMO_WORKSPACE_ID = id(1);
export const DEMO_USER_ID = id(2);

const accountSeed = [
  ["Demo Rheinwerk Automation GmbH", "rheinwerk-demo.example", "Germany", "Automotive Components", "500–1000", 92, "STRONG_FIT"],
  ["Demo Horizon Packaging Systems Inc.", "horizonpack-demo.example", "United States", "Packaging", "1000–5000", 87, "STRONG_FIT"],
  ["Demo Vistula Electronics Sp. z o.o.", "vistula-demo.example", "Poland", "Electronics Manufacturing", "500–1000", 83, "STRONG_FIT"],
  ["Demo Delta Motion Works B.V.", "deltamotion-demo.example", "Netherlands", "Industrial Equipment", "200–500", 74, "POTENTIAL_FIT"],
  ["Demo Morava Precision s.r.o.", "morava-demo.example", "Czech Republic", "Automotive Components", "100–200", 68, "POTENTIAL_FIT"],
  ["Demo Summit Assembly LLC", "summitassembly-demo.example", "United States", "Industrial Equipment", "200–500", 63, "POTENTIAL_FIT"],
  ["Demo Nordlicht Components AG", "nordlicht-demo.example", "Germany", "Electronics Manufacturing", "50–100", 55, "REVIEW"],
  ["Demo Tulip Process Machines B.V.", "tulipprocess-demo.example", "Netherlands", "Packaging", "100–200", 46, "REVIEW"],
  ["Demo Baltic Handcraft Sp. z o.o.", "baltichandcraft-demo.example", "Poland", "Consumer Goods", "20–50", 32, "LOW_FIT"],
  ["Demo Alpine Services GmbH", "alpineservices-demo.example", "Germany", "Professional Services", "20–50", 18, "LOW_FIT"],
  ["Demo Bohemia Factory Lab s.r.o.", "bohemialab-demo.example", "Czech Republic", "Industrial Equipment", "100–200", null, "NOT_RESEARCHED"],
  ["Demo Prairie Robotics Inc.", "prairierobotics-demo.example", "United States", "Industrial Equipment", "200–500", null, "NOT_RESEARCHED"],
] as const;

const nodeGraph = {
  nodes: [
    { id: "trigger", type: "csvImportTrigger", label: "CSV Import Trigger", position: { x: 0, y: 160 }, config: {} },
    { id: "research", type: "researchCompany", label: "Research Company", position: { x: 300, y: 160 }, config: { maxPages: 8, language: "en" } },
    { id: "signals", type: "extractSignals", label: "Extract Signals", position: { x: 600, y: 160 }, config: {} },
    { id: "qualify", type: "qualifyAccount", label: "Qualify Account", position: { x: 900, y: 160 }, config: { minimumScore: 60 } },
    { id: "contacts", type: "findContacts", label: "Find Contacts", position: { x: 1200, y: 40 }, config: { maxContacts: 3 } },
    { id: "manual", type: "manualTask", label: "Manual Review", position: { x: 1200, y: 280 }, config: { assignee: "Sales Ops" } },
    { id: "persona", type: "selectPersona", label: "Select Persona", position: { x: 1500, y: 40 }, config: {} },
    { id: "message", type: "generateMessage", label: "Generate Message", position: { x: 1800, y: 40 }, config: { tone: "concise", approvedClaimsOnly: true } },
    { id: "approval", type: "humanApproval", label: "Human Approval", position: { x: 2100, y: 40 }, config: { reviewerRole: "REVIEWER" } },
    { id: "enroll", type: "enrollSequence", label: "Enroll In Sequence", position: { x: 2400, y: 0 }, config: { testMode: true } },
    { id: "stop", type: "stop", label: "Stop", position: { x: 2400, y: 160 }, config: {} },
    { id: "crm", type: "syncCrm", label: "Sync CRM", position: { x: 2700, y: 0 }, config: {} },
  ],
  edges: [
    ["trigger", "research"], ["research", "signals"], ["signals", "qualify"], ["qualify", "contacts", "Qualified"], ["qualify", "manual", "Review"], ["qualify", "stop", "Not qualified"], ["contacts", "persona"], ["persona", "message"], ["message", "approval"], ["approval", "enroll", "Approved"], ["approval", "stop", "Rejected"], ["enroll", "crm"], ["manual", "stop"],
  ].map(([source, target, branch], index) => ({ id: `edge-${index}`, source, target, branch })),
};

const replyGraph = {
  nodes: [
    { id: "reply-trigger", type: "replyReceivedTrigger", label: "Reply Received Trigger", position: { x: 0, y: 160 }, config: {} },
    { id: "load-memory", type: "loadAccountMemory", label: "Load Account Memory", position: { x: 300, y: 160 }, config: {} },
    { id: "classify", type: "classifyReply", label: "Classify Reply", position: { x: 600, y: 160 }, config: { deterministicFallback: true } },
    { id: "summarize", type: "summarizeConversation", label: "Summarize Conversation", position: { x: 900, y: 160 }, config: {} },
    { id: "memory", type: "updateMemory", label: "Update Memory", position: { x: 1200, y: 160 }, config: { sourceRequired: true } },
    { id: "next-action", type: "proposeNextAction", label: "Propose Next Action", position: { x: 1500, y: 160 }, config: {} },
    { id: "reply-draft", type: "generateReplyDraft", label: "Generate Reply Draft", position: { x: 1800, y: 40 }, config: { approvedClaimsOnly: true } },
    { id: "task", type: "manualTask", label: "Create Manual Task", position: { x: 1800, y: 200 }, config: { assignee: "Account Owner" } },
    { id: "policy", type: "policyCheck", label: "Policy Check", position: { x: 2100, y: 40 }, config: {} },
    { id: "stop", type: "stop", label: "Stop", position: { x: 2100, y: 280 }, config: {} },
    { id: "crm", type: "syncCrm", label: "Sync CRM Mirror", position: { x: 2400, y: 120 }, config: {} },
  ],
  edges: [
    ["reply-trigger", "load-memory"], ["load-memory", "classify"], ["classify", "summarize"], ["summarize", "memory"],
    ["memory", "next-action"], ["next-action", "reply-draft", "Reply needed"], ["next-action", "task", "Human follow-up"],
    ["next-action", "stop", "Suppress"], ["reply-draft", "policy"], ["policy", "task", "Review"], ["policy", "stop", "Blocked"],
    ["task", "crm"],
  ].map(([source, target, branch], index) => ({ id: `reply-edge-${index}`, source, target, branch })),
};

await db.transaction(async (tx) => {
  for (const table of [crmEvents, opportunityMirrors, crmConnections, tasks, nextActionProposals, memoryFacts, conversationSummaries, messageClassifications, messageEvents, modelUsage, auditLogs, approvals, messages, conversations, nodeRuns, runs, playEdges, playNodes, playVersions, plays, sequenceSteps, sequenceVersions, sequences, suppressionEntries, qualificationResults, inferences, evidence, signals, contacts, accounts, approvedClaims, personas, icpProfiles, products, integrationConnections, workspaceMembers, users, workspaces]) await tx.delete(table);

  await tx.insert(workspaces).values({ id: DEMO_WORKSPACE_ID, name: "Nova Automation", slug: "nova-automation", plan: "DEMO" });
  await tx.insert(users).values({ id: DEMO_USER_ID, email: "demo@navo.local", name: "刘晓岚", locale: "zh-CN" });
  await tx.insert(workspaceMembers).values({ id: id(3), workspaceId: DEMO_WORKSPACE_ID, userId: DEMO_USER_ID, role: "OWNER", createdBy: DEMO_USER_ID });
  await tx.insert(products).values({ id: id(10), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, nameZh: "AI 视觉检测系统", nameEn: "AI Vision Inspection System", category: "Machine Vision", descriptionZh: "面向工业产线的视觉缺陷、尺寸和表面质量检测系统。", descriptionEn: "Vision inspection for defects, dimensions and surface quality with line and MES integration.", capabilities: ["视觉缺陷检测", "尺寸检测", "表面质量检测", "产线集成", "MES 对接", "非标自动化集成"], prohibitedClaims: ["未经验证的 ROI 数字", "未经证实的客户名称"] });
  await tx.insert(approvedClaims).values([
    { id: id(11), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, productId: id(10), claim: "Supports inspection speeds up to the configured validated line rate.", evidence: "Internal validation protocol NV-VIS-2026", approvedBy: DEMO_USER_ID, approvedAt: now, allowedRegions: ["EU", "US"] },
    { id: id(12), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, productId: id(10), claim: "Compatible with common industrial camera interfaces.", evidence: "Product interface specification", approvedBy: DEMO_USER_ID, approvedAt: now, allowedRegions: ["GLOBAL"] },
    { id: id(13), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, productId: id(10), claim: "Custom integration is subject to technical evaluation.", evidence: "Standard commercial terms", approvedBy: DEMO_USER_ID, approvedAt: now, allowedRegions: ["GLOBAL"] },
  ]);
  await tx.insert(icpProfiles).values({ id: id(20), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, name: "欧美工业制造 ICP", countries: ["Germany", "United States", "Netherlands", "Poland", "Czech Republic"], industries: ["Automotive Components", "Electronics Manufacturing", "Packaging", "Industrial Equipment"], employeeMin: 100, employeeMax: 5000, minimumScore: 60, hardExclusions: ["Consumer-only", "Services-only", "Sanctioned region"], scoringWeights: { hardRules: 40, businessSignals: 25, productMatch: 20, similarCaseMatch: 10, semanticJudgment: 5 } });
  await tx.insert(personas).values([
    { id: id(21), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, name: "Quality Director", department: "Quality", titles: ["Quality Director", "Head of Quality", "VP Quality"], seniority: "DIRECTOR", painPoints: ["Manual inspection variance", "Traceability", "False rejects"], decisionRole: "CHAMPION", recommendedCta: "Compare one inspection station" },
    { id: id(22), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, name: "Automation Manager", department: "Engineering", titles: ["Automation Manager", "Engineering Director", "Plant Manager"], seniority: "MANAGER", painPoints: ["Line integration", "Changeover time", "MES connectivity"], decisionRole: "TECHNICAL_BUYER", recommendedCta: "Share line requirements" },
  ]);

  const accountRows = accountSeed.map((row, index) => ({ id: id(100 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, name: row[0], domain: row[1], website: `https://${row[1]}`, country: row[2], industry: row[3], employeeRange: row[4], fitScore: row[5], qualification: row[6], playStatus: index < 8 ? ["COMPLETED", "WAITING_APPROVAL", "RUNNING", "COMPLETED"][index % 4] : "NOT_STARTED", source: index % 3 === 0 ? "CSV_IMPORT" : "DEMO", ownerName: index % 2 ? "陈薇" : "刘晓岚", lastResearchedAt: row[5] === null ? null : daysAgo(index + 1), summary: `${row[0]} is a fictional demo account used to showcase evidence-backed industrial GTM workflows.`, riskSummary: index === 7 ? "Evidence is older than 30 days." : null }));
  await tx.insert(accounts).values(accountRows);

  const contactRows = Array.from({ length: 10 }, (_, index) => ({ id: id(200 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, accountId: id(100 + index), name: ["Anna Keller", "Michael Reed", "Zofia Nowak", "Pieter de Vries", "Jana Novák", "Daniel Brooks", "Lena Vogt", "Sophie Bakker", "Marek Kowalski", "Julia Weber"][index]!, title: index % 2 ? "Automation Manager" : "Quality Director", persona: index % 2 ? "Automation Manager" : "Quality Director", email: `demo.contact${index + 1}@navo.local`, emailVerification: index === 7 ? "UNVERIFIED" : "VERIFIED", status: index < 5 ? "CONTACTED" : "NEW", source: "DEMO_PROVIDER", suppressed: index === 7 }));
  await tx.insert(contacts).values(contactRows);

  const evidenceRows = Array.from({ length: 20 }, (_, index) => ({ id: id(300 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, accountId: id(100 + (index % 10)), type: ["PRODUCT_PAGE", "CAREERS", "WEBSITE", "NEWS"][index % 4]!, title: ["Production capability", "Automation hiring", "Factory footprint", "Expansion update"][index % 4]!, summary: ["The demo product page describes automated inline quality inspection.", "The careers page lists controls and machine-vision engineering roles.", "The company page describes multi-line manufacturing operations.", "A fictional demo announcement describes a planned production expansion."][index % 4]!, quote: ["Inline inspection is used on the final assembly line.", "Hiring: Controls Engineer — machine vision experience preferred.", "Operations include three manufacturing halls.", "A new production cell is planned for Q4."][index % 4]!, sourceUrl: `https://${accountSeed[index % 10]![1]}/demo-source-${index + 1}`, pageTitle: "Fictional demo source", observedAt: daysAgo(index + 1), fetchedAt: daysAgo(Math.max(0, index)), confidence: ["0.94", "0.86", "0.91", "0.78"][index % 4]!, accessible: index !== 17, contentHash: `demo-hash-${index + 1}`, metadata: { fictional: true, provider: "mock-research" } }));
  await tx.insert(evidence).values(evidenceRows);
  await tx.insert(inferences).values(Array.from({ length: 10 }, (_, index) => ({ id: id(400 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, accountId: id(100 + index), statement: index < 6 ? "The account may benefit from inline visual quality inspection." : "Available evidence is insufficient to confirm near-term demand.", evidenceIds: [id(300 + index), id(300 + ((index + 10) % 20))], confidence: index < 6 ? "0.82" : "0.55", agentVersion: "persona-match-v1" })));
  await tx.insert(qualificationResults).values(accountRows.filter((row) => row.fitScore !== null).map((row, index) => ({ id: id(500 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, accountId: row.id, score: row.fitScore!, status: row.qualification, scoreBreakdown: { hardRules: Math.round(row.fitScore! * .4), businessSignals: Math.round(row.fitScore! * .25), productMatch: Math.round(row.fitScore! * .2), similarCaseMatch: Math.round(row.fitScore! * .1), semanticJudgment: Math.round(row.fitScore! * .05) }, reasons: ["Target industry match", "Manufacturing footprint evidence"], risks: row.fitScore! < 60 ? ["Weak buying signal"] : [], evidenceIds: [id(300 + index)], inferenceIds: [id(400 + index)], confidence: "0.84" })));
  await tx.insert(signals).values(Array.from({ length: 10 }, (_, index) => ({ id: id(600 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, accountId: id(100 + index), type: ["HIRING", "EXPANSION", "NEW_FACTORY", "NEW_PRODUCT", "TRADE_SHOW"][index % 5]!, summary: ["Hiring controls engineers", "Production capacity expansion", "New demonstration factory", "New automated product line", "Exhibiting at a fictional industry event"][index % 5]!, confidence: ["0.88", "0.82", "0.91", "0.76", "0.80"][index % 5]!, detectedAt: daysAgo(index), status: index < 4 ? "ACTIONED" : "NEW", ownerName: index % 2 ? "陈薇" : "刘晓岚" })));

  const playRows = [
    { id: id(700), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, name: "Target Account Outreach with Policy Check", description: "Evidence-backed qualification, policy checks and controlled outbound orchestration.", status: "ACTIVE", activeVersionId: id(710), draftVersionId: null, ownerName: "刘晓岚", lastRunAt: daysAgo(0), successRate: "83.30" },
    { id: id(701), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, name: "Reply Follow-up", description: "Classify replies, summarize conversations, update memory and propose the next best action.", status: "ACTIVE", activeVersionId: id(711), draftVersionId: null, ownerName: "陈薇", lastRunAt: daysAgo(0), successRate: "88.00" },
  ];
  await tx.insert(plays).values(playRows);
  await tx.insert(playVersions).values([
    { id: id(710), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, playId: id(700), versionNumber: 3, status: "PUBLISHED", graphHash: "seed-target-account-v3", publishedAt: daysAgo(5), graph: nodeGraph },
    { id: id(711), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, playId: id(701), versionNumber: 1, status: "PUBLISHED", graphHash: "seed-reply-followup-v1", publishedAt: daysAgo(2), graph: replyGraph },
  ]);
  await tx.insert(playNodes).values([
    ...nodeGraph.nodes.map((node, index) => ({ id: id(720 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, playVersionId: id(710), logicalNodeId: node.id, type: node.type, label: node.label, position: node.position, config: node.config })),
    ...replyGraph.nodes.map((node, index) => ({ id: id(780 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, playVersionId: id(711), logicalNodeId: node.id, type: node.type, label: node.label, position: node.position, config: node.config })),
  ]);
  await tx.insert(playEdges).values([
    ...nodeGraph.edges.map((edge, index) => ({ id: id(750 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, playVersionId: id(710), edgeKey: edge.id, sourceNodeId: edge.source!, targetNodeId: edge.target!, branch: edge.branch })),
    ...replyGraph.edges.map((edge, index) => ({ id: id(830 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, playVersionId: id(711), edgeKey: edge.id, sourceNodeId: edge.source!, targetNodeId: edge.target!, branch: edge.branch })),
  ]);

  await tx.insert(sequences).values([
    { id: id(800), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, name: "Quality Leaders — Evidence First", status: "ACTIVE", activeVersionId: id(810), stepsCount: 4, enrolled: 12, sent: 9, replyRate: "33.30", positiveReplyRate: "22.20", meetings: 1, ownerName: "刘晓岚" },
    { id: id(801), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, name: "Automation Managers — Technical Intro", status: "DRAFT", activeVersionId: id(811), stepsCount: 3, enrolled: 4, sent: 2, replyRate: "50.00", positiveReplyRate: "0.00", meetings: 0, ownerName: "陈薇" },
  ]);
  await tx.insert(sequenceVersions).values([{ id: id(810), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, name: "v2", status: "PUBLISHED", data: { testMode: true } }, { id: id(811), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, name: "v1", status: "DRAFT", data: { testMode: true } }]);
  await tx.insert(sequenceSteps).values([
    { id: id(820), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, sequenceVersionId: id(810), position: 1, type: "AUTOMATED_EMAIL", config: { subject: "A question about {{account.name}} quality inspection", stopOnReply: true } },
    { id: id(821), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, sequenceVersionId: id(810), position: 2, type: "WAIT", config: { amount: 3, unit: "business_days" } },
    { id: id(822), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, sequenceVersionId: id(810), position: 3, type: "MANUAL_TASK", config: { instructions: "Review new evidence before follow-up." } },
    { id: id(823), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, sequenceVersionId: id(810), position: 4, type: "END", config: {} },
  ]);

  const runRows = Array.from({ length: 15 }, (_, index) => {
    const status = index < 9 ? "COMPLETED" : index < 11 ? "WAITING" : index < 13 ? "FAILED" : "RUNNING";
    const accountId = id(100 + (index % 12));
    const replyRun = index >= 7;
    return { id: id(900 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, playId: id(replyRun ? 701 : 700), playVersionId: id(replyRun ? 711 : 710), accountId, runNumber: 2026071601 + index, trigger: replyRun ? "REPLY_RECEIVED" : index % 2 ? "CSV_IMPORT" : "TEST_RUN", status, currentNode: status === "WAITING" ? (replyRun ? "Create Manual Task" : "Human Approval") : status === "FAILED" ? (replyRun ? "Summarize Conversation" : "Research Company") : status === "RUNNING" ? (replyRun ? "Propose Next Action" : "Qualify Account") : "Sync CRM Mirror", startedAt: daysAgo(index), completedAt: status === "COMPLETED" || status === "FAILED" ? new Date(daysAgo(index).getTime() + 82_000 + index * 3_000) : null, durationMs: status === "COMPLETED" || status === "FAILED" ? 82_000 + index * 3_000 : null, estimatedCost: (0.018 + index * .004).toFixed(5), errorCount: status === "FAILED" ? 1 : 0, ownerName: index % 2 ? "陈薇" : "刘晓岚", context: { testMode: true, accountId, replyPlay: replyRun } };
  });
  await tx.insert(runs).values(runRows);
  await tx.insert(nodeRuns).values(Array.from({ length: 30 }, (_, index) => { const runIndex = index % 15; const replyRun = runIndex >= 7; const failed = runIndex === 11 || runIndex === 12; const waiting = runIndex === 9 || runIndex === 10; const nodeIndex = index % 5; const logicalNodeId = replyRun ? ["reply-trigger", "classify", "summarize", "memory", "next-action"][nodeIndex]! : ["research", "qualify", "message", "approval", "crm"][nodeIndex]!; const nodeLabel = replyRun ? ["Reply Received Trigger", "Classify Reply", "Summarize Conversation", "Update Memory", "Propose Next Action"][nodeIndex]! : ["Research Company", "Qualify Account", "Generate Message", "Human Approval", "Sync CRM"][nodeIndex]!; return { id: id(950 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, runId: id(900 + runIndex), logicalNodeId, nodeLabel, attempt: Math.floor(index / 15) + 1, status: failed && nodeIndex === 2 ? "FAILED" : waiting && nodeIndex === 4 ? "WAITING" : "COMPLETED", input: { accountId: id(100 + (runIndex % 12)), workspaceId: DEMO_WORKSPACE_ID }, output: failed && nodeIndex === 2 ? {} : { evidenceIds: [id(300 + (index % 20))], summary: "Deterministic Navo demo output" }, startedAt: daysAgo(runIndex), completedAt: waiting && nodeIndex === 4 ? null : new Date(daysAgo(runIndex).getTime() + 12_000), durationMs: waiting && nodeIndex === 4 ? null : 12_000, provider: nodeIndex > 0 && nodeIndex < 4 ? "mock-ai" : replyRun ? "email-sink" : "mock-research", model: nodeIndex > 0 && nodeIndex < 4 ? "deterministic-v1" : null, promptVersion: nodeIndex > 0 && nodeIndex < 4 ? "v1.2" : null, inputTokens: 420 + index * 5, outputTokens: 180 + index * 2, estimatedCost: (0.001 + index * .0002).toFixed(5), errorCode: failed && nodeIndex === 2 ? "SUMMARY_VALIDATION_FAILED" : null, errorMessage: failed && nodeIndex === 2 ? "Demo summary failed schema validation." : null, logs: [{ at: now.toISOString(), level: failed && nodeIndex === 2 ? "error" : "info", message: failed && nodeIndex === 2 ? "Failed safely; no unvalidated memory persisted." : "Schema validation passed." }] }; }));

  const conversationRows = Array.from({ length: 5 }, (_, index) => ({ id: id(1050 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, accountId: id(100 + index), contactId: id(200 + index), subject: `Re: ${accountSeed[index]![0]} quality inspection`, status: index === 4 ? "CLOSED" : "OPEN", lastMessageAt: daysAgo(index), unreadCount: index < 2 ? 1 : 0 }));
  await tx.insert(conversations).values(conversationRows);
  const messageRows = Array.from({ length: 12 }, (_, index) => ({ id: id(1100 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, conversationId: index < 5 ? id(1050 + index) : null, accountId: id(100 + index), contactId: index < 10 ? id(200 + index) : null, sequenceId: id(800), runId: id(900 + (index % 15)), direction: "OUTBOUND", channel: "EMAIL", providerMessageId: index < 8 ? `email-sink-out-${index + 1}` : null, subject: `A question about ${accountSeed[index]![0]} quality inspection`, body: `Hi ${index < 10 ? contactRows[index]!.name : "there"},\n\nI noticed your fictional demo site describes manufacturing operations. Would it be useful to compare how inline vision inspection could fit one station?\n\nBest,\nNova Automation`, originalSubject: `A question about quality inspection`, originalBody: "Original deterministic draft", status: index < 8 ? "SENT" : index < 10 ? "PENDING_APPROVAL" : "DRAFT", sentAt: index < 8 ? daysAgo(index + 1) : null, replyClassification: index < 5 ? ["POSITIVE", "QUESTION", "REFERRAL", "NOT_NOW", "UNSUBSCRIBE"][index] : null, evidenceIds: [id(300 + index)], claimsUsed: ["Compatible with common industrial camera interfaces."], idempotencyKey: `${DEMO_WORKSPACE_ID}:${id(810)}:${id(1200 + index)}:${id(820)}:1` }));
  await tx.insert(messages).values(messageRows);
  const replyBodies = ["Yes, this is relevant. Can we meet next Tuesday?", "What line speed and camera interfaces do you support?", "Please contact our Quality Director, Lena Vogt.", "The timing is not right. Follow up in Q4.", "Please unsubscribe me from future emails."];
  await tx.insert(messages).values(replyBodies.map((body, index) => ({ id: id(1150 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, conversationId: id(1050 + index), accountId: id(100 + index), contactId: id(200 + index), runId: id(907 + index), inReplyToMessageId: id(1100 + index), direction: "INBOUND", channel: "EMAIL", providerMessageId: `email-sink-reply-${index + 1}`, subject: `Re: ${messageRows[index]!.subject}`, body, status: "RECEIVED", receivedAt: daysAgo(index), replyClassification: ["POSITIVE", "QUESTION", "REFERRAL", "NOT_NOW", "UNSUBSCRIBE"][index], evidenceIds: [], claimsUsed: [], idempotencyKey: `email-sink-reply-${index + 1}` })));
  await tx.insert(messageEvents).values(Array.from({ length: 5 }, (_, index) => ({ id: id(1300 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, messageId: id(1100 + index), eventType: "REPLIED", eventAt: daysAgo(index), providerEventId: `demo-reply-${index + 1}`, metadata: { classification: ["POSITIVE", "QUESTION", "REFERRAL", "NOT_NOW", "UNSUBSCRIBE"][index], meeting: index === 0 } })));
  const classifications = ["POSITIVE", "QUESTION", "REFERRAL", "NOT_NOW", "UNSUBSCRIBE"];
  await tx.insert(messageClassifications).values(classifications.map((label, index) => ({ id: id(1350 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, conversationId: id(1050 + index), messageId: id(1150 + index), label, confidence: "0.990", rationale: "Deterministic EmailSink demo classification.", provider: "MOCK_AI", model: "deterministic-v1" })));
  await tx.insert(conversationSummaries).values(replyBodies.map((body, index) => ({ id: id(1360 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, conversationId: id(1050 + index), accountId: id(100 + index), summary: body, intent: classifications[index], objections: index === 3 ? ["Timing is not right"] : [], questions: index === 1 ? ["Supported line speed and camera interfaces"] : [], commitments: index === 0 ? ["Open to a meeting next Tuesday"] : [], updatedThroughMessageId: id(1150 + index) })));
  const memoryRows = [
    { category: "BUYING_SIGNAL", fact: "Open to a meeting next Tuesday", confidence: "0.990" },
    { category: "TECHNICAL_QUESTION", fact: "Needs supported line speed and camera interface details", confidence: "0.970" },
    { category: "STAKEHOLDER", fact: "Quality Director Lena Vogt is the recommended contact", confidence: "0.980" },
    { category: "TIMING", fact: "Requested follow-up in Q4", confidence: "0.990" },
    { category: "COMPLIANCE", fact: "Contact requested unsubscribe", confidence: "1.000" },
  ];
  await tx.insert(memoryFacts).values(memoryRows.map((memory, index) => ({ id: id(1370 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, accountId: id(100 + index), contactId: id(200 + index), conversationId: id(1050 + index), ...memory, sourceMessageId: id(1150 + index), validFrom: daysAgo(index) })));
  const actionRows = [
    { type: "SCHEDULE_MEETING", title: "Schedule discovery meeting", rationale: "The contact expressed positive intent and proposed a time.", priority: "HIGH" },
    { type: "ANSWER_QUESTION", title: "Prepare technical answer", rationale: "The contact asked for validated technical specifications.", priority: "HIGH" },
    { type: "CONTACT_REFERRAL", title: "Reach out to referred Quality Director", rationale: "The contact named the appropriate stakeholder.", priority: "MEDIUM" },
    { type: "FOLLOW_UP_LATER", title: "Follow up in Q4", rationale: "The contact explicitly requested a later timing.", priority: "LOW" },
    { type: "SUPPRESS_CONTACT", title: "Confirm suppression", rationale: "The contact requested unsubscribe; no further outbound is allowed.", priority: "URGENT" },
  ];
  await tx.insert(nextActionProposals).values(actionRows.map((action, index) => ({ id: id(1380 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, accountId: id(100 + index), contactId: id(200 + index), conversationId: id(1050 + index), sourceMessageId: id(1150 + index), ...action, status: "ACCEPTED", dueAt: index === 3 ? new Date("2026-10-01T08:00:00.000Z") : daysAgo(-1 - index), acceptedTaskId: id(1390 + index) })));
  await tx.insert(tasks).values([
    ...actionRows.map((action, index) => ({ id: id(1390 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, accountId: id(100 + index), contactId: id(200 + index), conversationId: id(1050 + index), nextActionProposalId: id(1380 + index), title: action.title, description: action.rationale, type: action.type, priority: action.priority, status: index === 4 ? "COMPLETED" : "OPEN", dueAt: index === 3 ? new Date("2026-10-01T08:00:00.000Z") : daysAgo(-1 - index), assigneeName: index % 2 ? "陈薇" : "刘晓岚", completedAt: index === 4 ? now : null })),
    { id: id(1395), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, accountId: id(105), contactId: id(205), title: "Review new evidence before follow-up", description: "Validate the newest automation hiring evidence.", type: "RESEARCH_REVIEW", priority: "MEDIUM", status: "OPEN", dueAt: daysAgo(-2), assigneeName: "陈薇" },
  ]);

  await tx.insert(approvals).values(Array.from({ length: 8 }, (_, index) => ({ id: id(1400 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, runId: id(900 + (index % 12)), nodeRunId: id(950 + ((index * 4 + 3) % 20)), accountId: id(100 + index), contactId: id(200 + index), messageId: id(1100 + index), status: index < 4 ? "PENDING" : index < 6 ? "APPROVED" : index === 6 ? "CHANGES_REQUESTED" : "REJECTED", risk: index === 3 ? "MEDIUM" : "LOW", originalSubject: messageRows[index]!.subject, originalBody: messageRows[index]!.body, editedSubject: index === 5 ? `${messageRows[index]!.subject} — technical fit` : null, editedBody: index === 5 ? `${messageRows[index]!.body}\n\nTechnical note available on request.` : null, diff: index === 5 ? { added: "Technical note available on request." } : {}, reviewerName: index >= 4 ? "王静" : null, reviewedAt: index >= 4 ? daysAgo(index - 3) : null, reason: index === 7 ? "Contact history requires manual review." : null, persona: contactRows[index]!.persona, country: accountSeed[index]![2] })));
  await tx.insert(suppressionEntries).values([
    { id: id(1500), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, email: "demo.contact8@navo.local", reason: "Demo opt-out", active: true },
    { id: id(1501), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, email: "demo.contact5@navo.local", reason: "EmailSink unsubscribe", active: true },
  ]);
  await tx.insert(integrationConnections).values([
    { id: id(1600), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, provider: "EmailSink", category: "EMAIL", status: "CONNECTED", lastSyncAt: now, permissions: ["test:send"], config: { testMode: true } },
    { id: id(1601), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, provider: "DeepSeek", category: "AI", status: process.env.DEEPSEEK_API_KEY ? "CONFIGURED" : "NOT_CONNECTED", permissions: ["structured:generate"], config: { serverOnly: true } },
    { id: id(1602), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, provider: "Mock Research", category: "RESEARCH", status: "CONNECTED", permissions: ["demo:research"], config: { deterministic: true } },
  ]);
  await tx.insert(crmConnections).values({ id: id(1650), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, provider: "CRM Mirror", status: "CONNECTED", externalWorkspaceId: "demo-crm-workspace", lastSyncAt: now, config: { mode: "mirror", writable: false } });
  await tx.insert(opportunityMirrors).values(actionRows.slice(0, 4).map((action, index) => ({ id: id(1660 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, connectionId: id(1650), accountId: id(100 + index), externalId: `demo-opp-${index + 1}`, name: `${accountSeed[index]![0]} — Vision Inspection`, stage: ["MEETING", "QUALIFICATION", "CONTACTING", "NURTURE"][index]!, amount: ["85000.00", "65000.00", "42000.00", "50000.00"][index]!, currency: "USD", ownerName: index % 2 ? "陈薇" : "刘晓岚", nextStep: action.title, lastSyncedAt: daysAgo(index), data: { demo: true, source: "navo" } })));
  await tx.insert(crmEvents).values(actionRows.map((action, index) => ({ id: id(1670 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, connectionId: id(1650), accountId: id(100 + index), opportunityMirrorId: index < 4 ? id(1660 + index) : null, eventType: index === 4 ? "CONTACT_SUPPRESSED" : "NEXT_ACTION_SYNCED", direction: "OUTBOUND", status: "SUCCEEDED", payload: { title: action.title }, occurredAt: daysAgo(index) })));
  await tx.insert(modelUsage).values(runRows.slice(0, 8).map((run, index) => ({ id: id(1700 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, runId: run.id, provider: "mock-ai", model: "deterministic-v1", inputTokens: 800 + index * 45, outputTokens: 320 + index * 20, estimatedCost: (0.004 + index * .001).toFixed(5) })));
  await tx.insert(auditLogs).values(Array.from({ length: 8 }, (_, index) => ({ id: id(1800 + index), workspaceId: DEMO_WORKSPACE_ID, createdBy: DEMO_USER_ID, actorId: DEMO_USER_ID, actorName: index % 2 ? "陈薇" : "刘晓岚", action: ["ACCOUNT_IMPORTED", "PLAY_PUBLISHED", "RUN_STARTED", "APPROVAL_REVIEWED"][index % 4]!, resourceType: ["ACCOUNT", "PLAY", "RUN", "APPROVAL"][index % 4]!, resourceId: id(100 + index), requestId: `demo-request-${index + 1}`, summary: "Fictional demo audit event", metadata: { demo: true } })));
});

console.log("Seeded Navo demo workspace: 12 accounts, 20 evidence, 10 signals, 10 contacts, 2 plays, 2 sequences, 15 runs, 30 node runs, 8 approvals, 12 outbound messages, 5 replies, 5 memory facts, 5 next actions and 6 tasks.");
await pool.end();
