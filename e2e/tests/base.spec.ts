import { expect, Page, test } from "@playwright/test";

const uid = () => Math.random().toString(36).slice(2, 10);
const YT = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";

async function register(page: Page, email: string, password: string, name: string) {
  await page.goto("/register");
  await page.getByLabel("שם תצוגה").fill(name);
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel(/^סיסמה/).fill(password);
  await page.getByRole("button", { name: "הרשמה" }).click();
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "התחברות" }).click();
}

test("landing → register errors → login → library CRUD → logout", async ({ page }) => {
  const email = `e2e_${uid()}@test.com`;
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("link", { name: "הרשמה" })).toBeVisible();

  await register(page, email, "short", "שירה");
  await expect(page.getByRole("alert")).toContainText("8 תווים");

  await register(page, email, "Password123!", "שירה");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("נרשמת בהצלחה")).toBeVisible();

  await register(page, email, "Password123!", "שירה");
  await expect(page.getByRole("alert")).toContainText("כבר רשומה");

  await login(page, email, "WrongPass999");
  await expect(page.getByRole("alert")).toContainText("שגויים");

  await login(page, email, "Password123!");
  await expect(page).toHaveURL(/\/library/);
  await expect(page.getByTestId("display-name")).toContainText("שירה");
  await expect(page.getByText("הספרייה עוד ריקה")).toBeVisible();

  await page.getByLabel("כותרת").fill("סרטון לדוגמה");
  await page.getByLabel("קישור").fill(YT);
  await page.getByRole("button", { name: "הוספת תוכן" }).click();
  await expect(page.getByRole("status")).toContainText("נוסף");
  await expect(page.getByRole("list", { name: "רשימת תוכן" })).toContainText("סרטון לדוגמה");

  await page.reload(); // token survives refresh
  await expect(page.getByTestId("display-name")).toContainText("שירה");
  await page.getByRole("link", { name: "פתח" }).first().click();
  await expect(page.getByRole("heading", { name: "סרטון לדוגמה" })).toBeVisible();
  await expect(page.locator("iframe[src*='aqz-KE-bpKQ']")).toBeVisible();

  await page.goto("/library");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "מחק" }).first().click();
  await expect(page.getByText("הספרייה עוד ריקה")).toBeVisible();

  await page.getByRole("button", { name: "התנתק" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/library");
  await expect(page).toHaveURL(/\/login/);
});

test("user isolation: B sees 'לא נמצא' on A's item", async ({ browser }) => {
  const a = await browser.newPage();
  const ea = `a_${uid()}@test.com`;
  await register(a, ea, "Password123!", "א");
  await login(a, ea, "Password123!");
  await expect(a).toHaveURL(/\/library/);
  await a.getByLabel("כותרת").fill("פרטי של A");
  await a.getByLabel("סוג").selectOption("text");
  await a.getByLabel("הטקסט").fill("טקסט סודי");
  await a.getByRole("button", { name: "הוספת תוכן" }).click();
  await a.getByRole("link", { name: "פתח" }).first().click();
  const url = a.url();

  const b = await (await browser.newContext()).newPage();
  const eb = `b_${uid()}@test.com`;
  await register(b, eb, "Password123!", "ב");
  await login(b, eb, "Password123!");
  await expect(b).toHaveURL(/\/library/);
  await b.goto(url);
  await expect(b.getByRole("heading", { name: "לא נמצא" })).toBeVisible();
  await expect(b.getByText("טקסט סודי")).toHaveCount(0);
});
