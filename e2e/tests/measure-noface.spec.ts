import { expect, test } from "@playwright/test";
import { addContent, apiLogin, fakeCamArgs } from "./helpers";


test.use({ launchOptions: { args: fakeCamArgs("noface.y4m") } });

  test("shows 'לא זוהו פנים' and keeps working", async ({ page, request }) => {
    const { token } = await apiLogin(page, request);
    const id = await addContent(request, token, { type: "web", title: "דף בלי פנים", source: "https://example.com" });
    await page.goto(`/content/${id}`);
    await page.getByRole("button", { name: "התחל סשן" }).click();
    await page.getByRole("button", { name: "אני מסכים" }).click();
    await expect(page.getByTestId("engine-status")).toContainText("לא זוהו פנים", { timeout: 30_000 });
    await expect(page.getByTestId("score")).toHaveText("—");
    await page.getByRole("button", { name: "סיים סשן" }).click();
    await expect(page.getByText("הסשן הסתיים ונשמר בהיסטוריה")).toBeVisible();
    await page.getByRole("link", { name: "הספרייה" }).click();
    await expect(page.getByRole("list", { name: "רשימת תוכן" })).toContainText("דף בלי פנים");
  });

  test("declining consent still allows watching", async ({ page, request }) => {
    const { token } = await apiLogin(page, request);
    const id = await addContent(request, token, { type: "text", title: "בלי מצלמה", source: "שלום" });
    await page.goto(`/content/${id}`);
    await page.getByRole("button", { name: "התחל סשן" }).click();
    await page.getByRole("button", { name: "לא, תודה" }).click();
    await expect(page.getByText("בחרת לצפות בלי מדידה")).toBeVisible();
    await expect(page.getByLabel("טקסט לקריאה")).toContainText("שלום");
  });
