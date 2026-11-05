import { expect, test } from "@playwright/test";
import { addContent, apiLogin, fakeCamArgs } from "./helpers";

test.use({ launchOptions: { args: fakeCamArgs("face.y4m") } });
const shot = (name: string) => `screens/${name}.png`;

test("landing page has 3 steps and big buttons", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "פורחים" })).toBeVisible();
  await expect(page.getByText("תתרכזו — ותראו מה צומח")).toBeVisible();
  await expect(page.locator(".step")).toHaveCount(3);
  await page.screenshot({ path: shot("landing"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: shot("landing-mobile"), fullPage: true });
});

test("live plant, low-focus reaction, garden, journal, profile", async ({ page, request }) => {
  test.setTimeout(150_000);
  const { token } = await apiLogin(page, request, "נועה");
  const id = await addContent(request, token, { type: "text", title: "פרק בהיסטוריה", source: "טקסט ארוך. ".repeat(300), bed: "היסטוריה" });
  await page.goto(`/content/${id}`);
  await expect(page.getByRole("img", { name: /הצמח שלך/ })).toBeVisible();
  await page.getByRole("button", { name: "התחל סשן" }).click();
  await page.getByRole("button", { name: "אני מסכים" }).click();
  await expect(page.getByTestId("score")).toHaveText(/\d\.\d\d/, { timeout: 30_000 });
  await expect(page.getByTestId("plant-stage")).toContainText("דק׳ מרוכזות");
  // the still portrait scores ~0.17 (< 0.4) -> after ~15 s the plant gets thirsty
  await expect(page.getByTestId("thirsty")).toHaveText(/הצמח שלך צמא לריכוז/, { timeout: 30_000 });
  await page.screenshot({ path: shot("watch-thirsty"), fullPage: true });
  await page.getByRole("button", { name: "סיים סשן" }).click();
  await expect(page.getByText("הצמח נשתל בגינה")).toBeVisible();

  await page.getByRole("link", { name: /הגינה שלי/ }).first().click();
  await expect(page.getByRole("heading", { name: "הגינה שלי" })).toBeVisible();
  await expect(page.getByLabel("ערוגה היסטוריה")).toBeVisible();
  await expect(page.getByRole("table", { name: "רשימת סשנים" })).toContainText("פרק בהיסטוריה");
  await page.screenshot({ path: shot("garden"), fullPage: true });
  await page.getByLabel("ערוגה היסטוריה").getByRole("link").first().click();
  await expect(page.getByRole("img", { name: "גרף ציון ריכוז לאורך הזמן" })).toBeVisible();
  await expect(page.getByText("אילו שניות נחשבו הכי הרבה?")).toBeVisible();
  await page.screenshot({ path: shot("session-detail"), fullPage: true });

  await page.getByRole("link", { name: "יומן הגינה" }).click();
  await expect(page.getByRole("heading", { name: "יומן הגינה" })).toBeVisible();
  await expect(page.locator(".badge.earned")).toContainText("זרע ראשון");
  await page.screenshot({ path: shot("journal"), fullPage: true });

  await page.getByRole("link", { name: "פרופיל" }).click();
  await page.getByLabel("שם תצוגה").fill("נועה כהן");
  await page.getByRole("button", { name: "שמירת שם" }).click();
  await expect(page.getByTestId("display-name")).toContainText("נועה כהן");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history");
  await page.screenshot({ path: shot("garden-mobile"), fullPage: true });
  await page.goto("/profile");
  await page.getByLabel(/כדי לאשר/).fill("מחק");
  await page.getByRole("button", { name: "מחיקת החשבון לצמיתות" }).click();
  await expect(page).toHaveURL(/\/$/);
  const r = await request.get("/api/users/me", { headers: { Authorization: `Bearer ${token}` } });
  expect(r.status()).toBe(401);
});
