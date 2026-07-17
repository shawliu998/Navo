import { expect, test } from "@playwright/test";
import path from "node:path";

const shots = path.resolve(process.cwd(), "../../artifacts/screenshots");
const ids = {
  account: "00000000-0000-4000-8000-000000000100",
  mission: "00000000-0000-4000-8000-000000001900",
  approval: "00000000-0000-4000-8000-000000001400",
  run: "00000000-0000-4000-8000-000000000900",
};

test.describe.serial("Navo Agent Experience Sprint 0.3", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /进入 Demo Workspace/ }).click();
    await expect(page).toHaveURL(/\/app\/overview/);
  });

  test("Command Center creates a reviewable single-account draft and global Agent drawer controls Navo", async ({ page }) => {
    await expect(page.getByText(/Current mission|Today.?s plan|Needs your attention/i).first()).toBeVisible();
    await page.getByLabel("Target account").selectOption(ids.account);
    await expect(page.getByText(/https:\/\//).first()).toBeVisible();
    await page.getByRole("button", { name: "Research website" }).click();
    const previewResponse = page.waitForResponse((response) => response.url().endsWith("/api/agent/commands/preview") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Preview plan" }).click();
    const preview = await (await previewResponse).json() as { data: { plan: unknown } };
    await expect(page.getByText("Schema-validated MissionPlan")).toBeVisible();
    await expect(page.getByText("DRAFT ONLY", { exact: true })).toBeVisible();
    const createdResponse = page.waitForResponse((response) => response.url().endsWith("/api/agent/commands/create-mission") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save draft" }).click();
    const created = await (await createdResponse).json() as { missionId: string };
    await expect(page).toHaveURL(new RegExp(`/app/missions/${created.missionId}`));
    const saved = await page.evaluate(async (missionId) => (await fetch(`/api/missions/${missionId}`)).json(), created.missionId) as { data: { mission: { plan: unknown } } };
    expect(saved.data.mission.plan).toEqual(preview.data.plan);
    await page.screenshot({ path: path.join(shots, "command-center.png"), fullPage: true });
    await page.getByRole("button", { name: /Navo is/i }).first().click();
    await expect(page.getByRole("dialog", { name: /Navo/i })).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(shots, "agent-drawer.png") });
    await page.getByRole("tab", { name: "Controls" }).click();
    const pause = page.getByRole("button", { name: /Pause Navo/ });
    if (await pause.isVisible()) {
      await pause.click();
      await expect(page.getByText(/Navo is paused/i).first()).toBeVisible();
      await page.getByRole("button", { name: /Resume Navo/ }).click();
    }
  });

  test("Mission list, six-step wizard and persisted mission detail form one flow", async ({ page }) => {
    await page.goto("/app/missions");
    await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Find high-fit packaging and automotive component manufacturers in DACH" })).toBeVisible();
    await page.screenshot({ path: path.join(shots, "mission-list.png"), fullPage: true });
    await page.getByRole("link", { name: /Create mission/ }).click();
    await page.getByLabel("Mission name").fill("Pilot QA expansion discovery");
    await page.getByLabel("Objective").fill("Find and qualify five pilot accounts with evidence-backed expansion signals.");
    await page.getByLabel("Desired outcome").fill("Two qualified accounts and one approval-ready draft.");
    await page.screenshot({ path: path.join(shots, "mission-wizard.png"), fullPage: true });
    for (let step = 0; step < 5; step += 1) await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Review and create" })).toBeVisible();
    await page.getByRole("button", { name: /Generate AI MissionPlan preview/ }).click();
    await expect(page.getByText("AI MissionPlan")).toBeVisible();
    await expect(page.getByText(/mock-ai|deepseek/i)).toBeVisible();
    await expect(page.getByText("DRAFT ONLY", { exact: true })).toBeVisible();
    const created = page.waitForResponse((response) => response.url().endsWith("/api/missions") && response.request().method() === "POST");
    await page.getByRole("button", { name: /Create & start/ }).click();
    expect((await created).status()).toBe(201);
    await expect(page).toHaveURL(/\/app\/missions\//);
    await expect(page.getByRole("heading", { name: "Pilot QA expansion discovery" })).toBeVisible();
  });

  test("Mission detail shows plan, evidence-aware targets, activity and lifecycle controls", async ({ page }) => {
    await page.goto(`/app/missions/${ids.mission}`);
    await expect(page.getByRole("heading", { name: "Find high-fit packaging and automotive component manufacturers in DACH" })).toBeVisible();
    await page.screenshot({ path: path.join(shots, "mission-detail.png"), fullPage: true });
    await page.getByRole("link", { name: "Plan" }).click();
    await expect(page.getByText("DACH expansion-signal outreach plan")).toBeVisible();
    await expect(page.getByText("Load Nova Automation product knowledge")).toBeVisible();
    await page.getByRole("link", { name: "Activity", exact: true }).click();
    await expect(page.getByText(/durable timeline/i)).toBeVisible();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();
  });

  test("Account worklist and Ask Navo produce a contextual assessment", async ({ page }) => {
    await page.goto("/app/accounts");
    await expect(page.getByText("Agent Priority")).toBeVisible();
    await page.goto(`/app/accounts/${ids.account}`);
    await expect(page.getByText("What Navo thinks")).toBeVisible();
    await page.getByRole("link", { name: /Ask Navo about this account/ }).click();
    await expect(page).toHaveURL(new RegExp(`/app/missions/new\\?accountId=${ids.account}`));
  });

  test("Command menu routes natural-language work to the account-aware mission wizard", async ({ page }) => {
    await page.getByRole("button", { name: "Open Navo command menu" }).click();
    const menu = page.getByRole("dialog", { name: "Navo command menu" });
    await menu.getByPlaceholder("Ask Navo to research, explain").fill("Research this account and prepare an evidence-backed draft.");
    await menu.getByPlaceholder("Ask Navo to research, explain").press("Enter");
    await expect(page).toHaveURL(/\/app\/missions\/new\?objective=/);
  });

  test("Human approval and Agent Activity explain recommendations and execution", async ({ page }) => {
    await page.goto(`/app/approvals/${ids.approval}`);
    await expect(page.getByText(/Navo recommends/i)).toBeVisible();
    await page.screenshot({ path: path.join(shots, "approval-agent.png"), fullPage: true });
    await page.goto(`/app/runs/${ids.run}`);
    await expect(page.getByText("BUSINESS SUMMARY")).toBeVisible();
    await expect(page.getByText(/PLAYBOOK V/)).toBeVisible();
    await page.screenshot({ path: path.join(shots, "run-detail-agent.png"), fullPage: true });
  });

  test("Memory and Capabilities expose durable learning and measured tools", async ({ page }) => {
    await page.goto("/app/memory");
    await expect(page.getByRole("heading", { name: "Memory" })).toBeVisible();
    await expect(page.getByText("Active facts", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: path.join(shots, "memory.png"), fullPage: true });
    await page.goto("/app/agents");
    await expect(page.getByRole("heading", { name: "Capabilities" })).toBeVisible();
    await expect(page.getByText("Node attempts", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(shots, "capabilities.png"), fullPage: true });
  });
});
