import { chromium, expect, test } from "@playwright/test";
import { addContent, apiLogin, fakeCamArgs } from "./helpers";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

test("shared garden: two users, two cameras, live status + cheer; outsider gets 404", async ({ request }) => {
  test.setTimeout(180_000);
  // two separate browsers, each with its own fake camera
  const browserA = await chromium.launch({ channel: "chromium", args: fakeCamArgs("face.y4m") });
  const browserB = await chromium.launch({ channel: "chromium", args: fakeCamArgs("noface.y4m") });
  const a = await (await browserA.newContext({ baseURL: BASE })).newPage();
  const b = await (await browserB.newContext({ baseURL: BASE })).newPage();
  try {
    const ua = await apiLogin(a, request, "אהובה");
    const ub = await apiLogin(b, request, "מיכל");
    const ida = await addContent(request, ua.token, { type: "text", title: "היסטוריה", source: "טקסט. ".repeat(200) });
    const idb = await addContent(request, ub.token, { type: "web", title: "מתמטיקה", source: "https://example.com" });

    // A opens a room from the watch screen
    await a.goto(`/content/${ida}`);
    await a.getByRole("button", { name: "הזמן חבר ללמוד איתך" }).click();
    const code = (await a.getByTestId("room-code").textContent())!.trim();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    await expect(a.getByLabel("קישור הזמנה")).toHaveValue(new RegExp(`/room/${code}$`));

    // B opens the share link -> opt-in -> picks own (different) content
    await b.goto(`/room/${code}`);
    await expect(b.getByText("בלי וידאו ובלי נקודות פנים")).toBeVisible();
    await b.getByRole("button", { name: /הצטרפות לחדר/ }).click();
    await b.getByRole("link", { name: "ללמוד בחדר" }).click();
    await expect(b.getByTestId("room-code")).toHaveText(code);
    const buddyOnA = a.getByTestId("buddy").filter({ hasText: "מיכל" });
    await expect(buddyOnA).toContainText("עוד לא התחיל/ה סשן", { timeout: 5_000 });

    // both start their normal sessions inside the room
    for (const p of [a, b]) {
      await p.getByRole("button", { name: "התחל סשן" }).click();
      await p.getByRole("button", { name: "אני מסכים" }).click();
    }
    // B has no face -> A sees "not in front of the camera" within ~5 s of B's state change
    await expect(b.getByTestId("engine-status")).toContainText("לא זוהו פנים", { timeout: 30_000 });
    await expect(buddyOnA.getByTestId("buddy-status")).toHaveText("לא מול המצלמה", { timeout: 5_000 });
    // A gets a live score -> B sees A's matching status within ~5 s of A's first score
    await expect(a.getByTestId("score")).toHaveText(/\d\.\d\d/, { timeout: 30_000 });
    const expected = Number(await a.getByTestId("score").textContent()) < 0.4 ? "צריך/ה עידוד" : "מרוכז/ת";
    const buddyOnB = b.getByTestId("buddy").filter({ hasText: "אהובה" });
    await expect(buddyOnB.getByTestId("buddy-status")).toHaveText(expected, { timeout: 5_000 });
    await b.screenshot({ path: "screens/room-b.png", fullPage: true });

    // B cheers -> sun animation on A's screen
    await b.getByRole("button", { name: "שלח עידוד 🌞" }).click();
    await expect(a.getByTestId("sun")).toContainText("מיכל שלח/ה לך עידוד", { timeout: 5_000 });
    await a.screenshot({ path: "screens/room-a.png", fullPage: true });

    // a third user who did not join gets 404 from the API
    const page = await (await browserA.newContext({ baseURL: BASE })).newPage();
    const uc = await apiLogin(page, request, "זרה");
    const r = await request.get(`/api/rooms/${code}`, { headers: { Authorization: `Bearer ${uc.token}` } });
    expect(r.status()).toBe(404);

    // solo session keeps working after leaving the room
    await b.getByRole("button", { name: "יציאה מהחדר" }).click();
    await expect(b.getByRole("button", { name: "הזמן חבר ללמוד איתך" })).toBeVisible();
    await expect(b.getByRole("button", { name: "סיים סשן" })).toBeVisible();
    await expect(buddyOnA).toHaveCount(0, { timeout: 5_000 });
    await b.getByRole("button", { name: "סיים סשן" }).click();
    await expect(b.getByText("הסשן הסתיים ונשמר בהיסטוריה")).toBeVisible();
  } finally {
    // never let a stuck browser hang the whole suite
    const closeSoon = (br: typeof browserA) => Promise.race([br.close(), new Promise((r) => setTimeout(r, 5_000))]);
    await Promise.all([closeSoon(browserA), closeSoon(browserB)]);
  }
});
