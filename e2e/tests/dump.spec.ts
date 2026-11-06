import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { addContent, apiLogin, fakeCamArgs, hasMedia } from "./helpers";

test.skip(!hasMedia("real.y4m"), "needs a local recording in e2e/media/real.y4m (not in git)");
test.use({ launchOptions: { args: hasMedia("real.y4m") ? fakeCamArgs("real.y4m") : [] } });
test("dump raw landmark windows from the real video", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { token } = await apiLogin(page, request);
  const id = await addContent(request, token, { type: "text", title: "dump", source: "x" });
  await page.addInitScript(() => { localStorage.setItem("bloom_crop", "0"); (window as any).__bloomWindows = []; });
  await page.goto(`/content/${id}`);
  await page.getByRole("button", { name: "התחל סשן" }).click();
  await page.getByRole("button", { name: "אני מסכים" }).click();
  await page.waitForTimeout(55_000);
  const w = await page.evaluate(() => (window as any).__bloomWindows);
  writeFileSync("media/windows.json", JSON.stringify(w));
  console.log("windows", w.length);
});
