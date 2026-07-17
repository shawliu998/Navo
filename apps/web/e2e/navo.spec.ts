import { expect, test } from "@playwright/test";
import path from "node:path";

const shots = path.resolve(process.cwd(), "../../artifacts/screenshots");
const ids = {
  account: "00000000-0000-4000-8000-000000000100",
  suppressedAccount: "00000000-0000-4000-8000-000000000107",
  play: "00000000-0000-4000-8000-000000000700",
  approval: "00000000-0000-4000-8000-000000001400",
  run: "00000000-0000-4000-8000-000000000900",
};

test.describe.serial("Navo account intelligence and reply loop", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /进入 Demo Workspace/ }).click();
    await expect(page).toHaveURL(/\/app\/overview/);
  });

  test("login, overview, accounts and evidence", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Good morning|Command Center/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Navo is active/i })).toBeVisible();
    await page.screenshot({ path: path.join(shots, "overview.png"), fullPage: true });
    await page.goto("/app/accounts");
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
    await expect(page.getByText("Demo Rheinwerk Automation GmbH")).toBeVisible();
    await page.screenshot({ path: path.join(shots, "accounts.png"), fullPage: true });
    await page.goto(`/app/accounts/${ids.account}?tab=evidence`);
    await expect(page.getByText(/Evidence · 可直接证明的事实/)).toBeVisible();
    await expect(page.getByText(/Inference · 受约束推断/)).toBeVisible();
    await expect(page.getByText(/Decision · 业务决策/)).toBeVisible();
    await page.goto(`/app/accounts/${ids.account}?tab=memory`);
    await expect(page.getByText("Account Memory")).toBeVisible();
    await page.screenshot({ path: path.join(shots, "account-detail.png"), fullPage: true });
  });

  test("edit, autosave and publish a play, then start a test run", async ({ page }) => {
    await page.goto(`/app/plays/${ids.play}/builder`);
    await expect(page.getByText("Target Account Outreach with Policy Check")).toBeVisible();
    const researchNode = page.locator(".export-node").filter({ hasText: "Research Company" }).first();
    await expect(researchNode).toBeVisible();
    await page.screenshot({ path: path.join(shots, "play-builder.png"), fullPage: true });
    await researchNode.click();
    const label = page.locator(".dark-field input").first();
    await label.fill("Research Company · QA");
    await page.waitForTimeout(1_300);
    const published = page.waitForResponse((response) => response.url().endsWith(`/api/plays/${ids.play}/publish`));
    await page.locator(".builder-toolbar .primary").click();
    expect((await published).ok()).toBeTruthy();
    await expect(page.getByText(/Published version/)).toBeVisible();
    await page.getByRole("button", { name: /Test Run/ }).click();
    await expect(page).toHaveURL(/\/app\/runs\//);
    await expect(page.getByText(/TEST RUN/)).toBeVisible();
  });

  test("review and approve a message with a human edit", async ({ page }) => {
    await page.goto(`/app/approvals/${ids.approval}`);
    await expect(page.getByText("Email Draft")).toBeVisible();
    await page.screenshot({ path: path.join(shots, "approval.png"), fullPage: true });
    const subject = page.locator(".editor-panel input").first();
    await subject.fill(`${await subject.inputValue()} — QA reviewed`);
    await page.getByRole("button", { name: /Approve With Changes/ }).click();
    await expect(page).toHaveURL(/\/app\/approvals/);
  });

  test("inspect a run and retry without overwriting history", async ({ page }) => {
    await page.goto(`/app/runs/${ids.run}`);
    await expect(page.getByText(/RUN #2026071601/)).toBeVisible();
    await page.screenshot({ path: path.join(shots, "run-detail.png"), fullPage: true });
    await page.getByRole("button", { name: /Retry node/ }).click();
    await expect(page.getByText("Attempt 2").first()).toBeVisible();
  });

  test("suppression is visible and analytics is database-backed", async ({ page }) => {
    await page.goto(`/app/accounts/${ids.suppressedAccount}?tab=contacts`);
    await expect(page.getByText("SUPPRESSED")).toBeVisible();
    await page.goto("/app/analytics");
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByText("Qualification Rate")).toBeVisible();
    await page.screenshot({ path: path.join(shots, "analytics.png"), fullPage: true });
  });

  test("EmailSink reply creates classification, memory, next action, task and CRM mirror", async ({ page }) => {
    await page.goto("/app/email-sink");
    await expect(page.getByRole("heading", { name: "EmailSink" })).toBeVisible();
    await page.screenshot({ path: path.join(shots, "email-sink.png"), fullPage: true });
    await page.getByLabel("Simulated reply body").fill("Yes, this is relevant. Let's talk next Tuesday.");
    const response = page.waitForResponse((item) => item.url().includes("/api/dev/email-sink/") && item.url().endsWith("/reply"));
    await page.getByRole("button", { name: /Simulate reply/ }).click();
    const replyResponse = await response;
    expect(replyResponse.status()).toBe(201);
    const replyPayload = await replyResponse.json();
    await expect(page.getByRole("status")).toContainText("POSITIVE");
    await page.goto(`/app/conversations/${replyPayload.data.message.conversationId}`);
    await expect(page.getByText("Conversation summary")).toBeVisible();
    await expect(page.getByText("Next Best Action")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prepare a discovery meeting" })).toBeVisible();
    await page.screenshot({ path: path.join(shots, "conversation.png"), fullPage: true });
    await page.goto("/app/tasks");
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await expect(page.getByText("Prepare a discovery meeting").first()).toBeVisible();
  });

  test("CSV import maps and deduplicates accounts", async ({ page }) => {
    await page.goto("/app/accounts/import");
    await expect(page.getByRole("heading", { name: "Import target accounts" })).toBeVisible();
    await page.getByRole("button", { name: /Import 2 rows/ }).click();
    await expect(page.getByText(/Import completed: 2 created/)).toBeVisible();
  });
});
