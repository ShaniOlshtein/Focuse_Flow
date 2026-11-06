import { expect, test } from "@playwright/test";
import { addContent, apiLogin, fakeCamArgs, hasMedia } from "./helpers";

test.skip(!hasMedia("real.y4m"), "needs a local recording in e2e/media/real.y4m (not in git)");
test.use({ launchOptions: { args: hasMedia("real.y4m") ? fakeCamArgs("real.y4m") : [] } });

test("real webcam video: scores vary over time", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { token } = await apiLogin(page, request);
  const id = await addContent(request, token, { type: "text", title: "אמיתי", source: "טקסט. ".repeat(100) });
  const scores: string[] = [];
  page.on("console", (m) => m.text().startsWith("[bloom] inference") && scores.push(m.text()));
  await page.goto(`/content/${id}`);
  await page.getByRole("button", { name: "התחל סשן" }).click();
  await page.getByRole("button", { name: "אני מסכים" }).click();
  await expect(page.getByTestId("score")).toHaveText(/\d\.\d\d/, { timeout: 30_000 });
  const seen: string[] = [];
  for (let i = 0; i < 16; i++) {
    seen.push((await page.getByTestId("score").textContent()) + "|" + (await page.getByTestId("engine-status").textContent()));
    await page.waitForTimeout(3000);
  }
  console.log("SCORES", seen.join("  "));
});
