import { expect, test } from "@playwright/test";
import { addContent, apiLogin, fakeCamArgs } from "./helpers";

const TEXT = "פסקה לדוגמה לקריאה מרוכזת. ".repeat(200);

test.use({ launchOptions: { args: fakeCamArgs("face.y4m") } });

  test("consent → live score → end → history with average", async ({ page, request }) => {
    const { token } = await apiLogin(page, request);
    const id = await addContent(request, token, { type: "text", title: "קריאה עם מצלמה", source: TEXT });
    page.on("console", (m) => m.text().startsWith("[bloom]") && console.log(m.text()));
    await page.goto(`/content/${id}`);
    await page.getByRole("button", { name: "התחל סשן" }).click();
    await expect(page.getByRole("dialog")).toContainText("נשארים בדפדפן");
    const t0 = Date.now();
    await page.getByRole("button", { name: "אני מסכים" }).click();

    const score = page.getByTestId("score");
    await expect(score).toHaveText(/^(0\.\d\d|1\.00)$/, { timeout: 40_000 });
    console.log(`first score after ${((Date.now() - t0) / 1000).toFixed(1)}s:`, await score.textContent());
    // camera dropdown is present
    await expect(page.getByRole("combobox", { name: /^מצלמה/ })).toBeVisible();
    // a few more readings arrive (every ~3 s)
    await page.waitForTimeout(7_000);
    console.log("later score:", await score.textContent());

    await page.getByRole("button", { name: "סיים סשן" }).click();
    await expect(page.getByText("הסשן הסתיים ונשמר בהיסטוריה")).toBeVisible();

    await page.getByRole("link", { name: "היסטוריה" }).first().click();
    const row = page.getByRole("row").filter({ hasText: "קריאה עם מצלמה" });
    await expect(row).toContainText(/\d\.\d\d/);
    await row.getByRole("link").first().click();
    await expect(page.getByRole("img", { name: "גרף ציון ריכוז לאורך הזמן" })).toBeVisible();
    const n = await page.getByRole("table", { name: "מדידות" }).getByRole("row").count();
    expect(n - 1).toBeGreaterThanOrEqual(2);
  });

test("YouTube content: IFrame API player + measurement with video position", async ({ page, request }) => {
  const { token } = await apiLogin(page, request);
  const id = await addContent(request, token, { type: "youtube", title: "סרטון", source: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" });
  await page.goto(`/content/${id}`);
  await expect(page.locator("iframe[src*='youtube']")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "התחל סשן" }).click();
  await page.getByRole("button", { name: "אני מסכים" }).click();
  await expect(page.getByTestId("score")).toHaveText(/^(0\.\d\d|1\.00)$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "סיים סשן" }).click();
  await expect(page.getByRole("status").filter({ hasText: "הסשן הסתיים" })).toContainText(/[0-9]+ מדידות · ממוצע/);
});
