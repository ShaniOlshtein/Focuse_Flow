/* Measurement + growth follow the REAL state of the video.
   MOCKS (stated explicitly):
   - YouTube: https://www.youtube.com/iframe_api is replaced by a controllable fake player (window.__yt)
     that fires the same onStateChange / onError events as the real IFrame API. The real player is
     covered separately in measure-face.spec.ts.
   - Camera: Chrome fake device playing media/face.y4m (a real face video). MediaPipe face detection
     and the ONNX model run for real; only the NUMBER the model returns is pinned with the existing
     test hook window.__bloomScoreOverride so growth is deterministic.
   - Tab switch: document.hidden is overridden + a visibilitychange event is dispatched (headless
     Chromium never hides a tab by itself). */
import { APIRequestContext, expect, Page, test } from "@playwright/test";
import { addContent, apiLogin, fakeCamArgs } from "./helpers";

test.use({ launchOptions: { args: fakeCamArgs("face.y4m") } });
test.describe.configure({ timeout: 240_000 });

const FAKE_YT = `(function(){
  function Player(el, opts){
    this.opts = opts; this.state = -1; this.vid = opts.videoId; this.t = 0;
    var d = document.createElement('div'); d.setAttribute('data-testid','fake-yt'); d.textContent = 'fake player';
    el.replaceWith(d); this.el = d; window.__yt = this; var self = this;
    setTimeout(function(){ opts.events.onReady && opts.events.onReady({ target: self }); }, 0);
    setInterval(function(){ if (self.state === 1) self.t += 0.25; }, 250);
  }
  Player.prototype.getIframe = function(){ return this.el; };
  Player.prototype.getCurrentTime = function(){ return this.t; };
  Player.prototype.getPlayerState = function(){ return this.state; };
  Player.prototype.getVideoData = function(){ return { video_id: this.vid }; };
  Player.prototype.pauseVideo = function(){ this.set(2); };
  Player.prototype.playVideo = function(){ this.set(1); };
  Player.prototype.destroy = function(){};
  Player.prototype.set = function(s){ this.state = s; this.opts.events.onStateChange({ target: this, data: s }); };
  Player.prototype.loadOther = function(id, s){ this.vid = id; this.set(s); };
  Player.prototype.fail = function(code){ this.state = -1; this.opts.events.onError({ target: this, data: code }); };
  window.YT = { Player: Player };
  window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
})();`;

type Sess = { id: string; reading_count: number; focused_seconds: number; ended_at: string | null; stage: string };

async function setup(page: Page, request: APIRequestContext, score: number, opts: { blockYT?: boolean } = {}) {
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    opts.blockYT ? r.abort() : r.fulfill({ contentType: "text/javascript", body: FAKE_YT }));
  await page.addInitScript((s) => {
    (window as any).__bloomScoreOverride = s;
    (window as any).__bloomWindows = []; // existing debug hook: one entry per model inference
  }, score);
  const { token } = await apiLogin(page, request);
  const id = await addContent(request, token, { type: "youtube", title: "סרטון בדיקה", source: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" });
  await page.goto(`/content/${id}`);
  if (!opts.blockYT) await expect(page.getByTestId("fake-yt")).toBeVisible();
  const auth = { Authorization: `Bearer ${token}` };
  const sessions = async () => (await (await request.get("/api/sessions", { headers: auth })).json()) as Sess[];
  const open = async () => (await sessions()).find((s) => !s.ended_at)!;
  return { token, auth, sessions, open };
}

const yt = (page: Page, code: number) => page.evaluate((c) => (window as any).__yt.set(c), code);
const inferences = (page: Page) => page.evaluate(() => (window as any).__bloomWindows.length as number);
const state = (page: Page) => page.getByTestId("playback-status");
const startSession = async (page: Page) => {
  await page.getByRole("button", { name: /^התחל סשן/ }).click();
  await page.getByRole("button", { name: "אני מסכים" }).click();
};
const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

test("full flow: waiting → play → grow → pause (frozen) → resume → ended → end → new session", async ({ page, request }) => {
  const s = await setup(page, request, 0.9);
  await startSession(page);

  // 1. session started, video not playing: waiting, no measurement, no growth
  await expect(state(page)).toHaveAttribute("data-state", "waiting_for_video");
  await expect(state(page)).toContainText("ממתין להפעלת הסרטון");
  await page.waitForTimeout(16_000); // longer than warm-up (10 s) + one inference period (3 s)
  expect(await inferences(page)).toBe(0);
  let cur = await s.open();
  expect(cur.reading_count).toBe(0);
  expect(cur.focused_seconds).toBe(0);
  await expect(page.getByTestId("score")).toHaveText("—");

  // 2. play: measurement + growth start
  const tPlay = Date.now();
  await yt(page, 1);
  await expect(state(page)).toHaveCount(0);
  await expect(page.getByTestId("score")).toHaveText("0.90", { timeout: 30_000 });
  await expect.poll(async () => (await s.open()).reading_count, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  cur = await s.open();
  expect(cur.focused_seconds).toBeGreaterThan(0);
  // nothing from the 16 s of waiting was credited
  expect(cur.focused_seconds).toBeLessThanOrEqual((Date.now() - tPlay) / 1000 + 1);

  // 3. pause: everything stops immediately (no inference, no reading, no growth)
  await yt(page, 2);
  await expect(state(page)).toHaveAttribute("data-state", "paused");
  await page.waitForTimeout(1500); // let an in-flight request settle
  const frozen = await s.open();
  const inf = await inferences(page);
  await page.waitForTimeout(10_000);
  expect(await inferences(page)).toBe(inf);
  const after = await s.open();
  expect(after.reading_count).toBe(frozen.reading_count);
  expect(after.focused_seconds).toBe(frozen.focused_seconds);
  await expect(page.getByTestId("engine-status")).toContainText("המדידה מושהית");

  // 4. resume: continues from the same point, the paused 11.5 s are not credited
  const tResume = Date.now();
  await yt(page, 1);
  await expect.poll(async () => (await s.open()).reading_count, { timeout: 15_000 }).toBeGreaterThan(frozen.reading_count);
  const resumed = await s.open();
  expect(resumed.focused_seconds - frozen.focused_seconds).toBeLessThanOrEqual((Date.now() - tResume) / 1000 + 1);
  expect(resumed.focused_seconds).toBeGreaterThan(frozen.focused_seconds);

  // 5. video ended: measurement stops
  await yt(page, 0);
  await expect(state(page)).toHaveAttribute("data-state", "ended");
  await page.waitForTimeout(1500);
  const ended = await s.open();
  await page.waitForTimeout(7_000);
  expect((await s.open()).reading_count).toBe(ended.reading_count);

  // 6. manual end: saved with an average
  await page.getByRole("button", { name: "סיים סשן" }).click();
  await expect(page.getByRole("status").filter({ hasText: "הסשן הסתיים" })).toContainText(/[0-9]+ מדידות · ממוצע 0\.90/);
  expect((await s.sessions()).filter((x) => !x.ended_at)).toHaveLength(0);

  // 7. a new session after the previous one (video is at "ended"): waiting again, fresh plant
  await startSession(page);
  await expect(state(page)).toHaveAttribute("data-state", "waiting_for_video");
  const second = await s.open();
  expect(second.id).not.toBe(ended.id);
  await page.waitForTimeout(8_000);
  expect((await s.open()).reading_count).toBe(0);
});

test("buffering, tab switch, another video, video error", async ({ page, request }) => {
  const s = await setup(page, request, 0.9);
  await startSession(page);
  // sync: wait until the server has created the session (the POST is async after "אני מסכים")
  await expect.poll(async () => !!(await s.open()), { timeout: 15_000 }).toBe(true);
  await yt(page, 1);
  await expect.poll(async () => (await s.open()).reading_count, { timeout: 40_000 }).toBeGreaterThanOrEqual(1);

  const frozenFor = async (ms: number) => {
    await page.waitForTimeout(1500);
    const a = await s.open();
    const inf = await inferences(page);
    await page.waitForTimeout(ms);
    const b = await s.open();
    expect(b.reading_count).toBe(a.reading_count);
    expect(b.focused_seconds).toBe(a.focused_seconds);
    expect(await inferences(page)).toBe(inf);
  };
  const flowsAgain = async () => {
    const n = (await s.open()).reading_count;
    await expect.poll(async () => (await s.open()).reading_count, { timeout: 15_000 }).toBeGreaterThan(n);
  };

  // buffering
  await yt(page, 3);
  await expect(state(page)).toHaveAttribute("data-state", "buffering");
  await frozenFor(6_000);
  await yt(page, 1);
  await flowsAgain();

  // tab switch (video keeps playing)
  await setHidden(page, true);
  await expect(state(page)).toContainText("לשונית אחרת");
  await frozenFor(6_000);
  expect(await page.evaluate(() => (window as any).__yt.getPlayerState())).toBe(1);
  await setHidden(page, false);
  await flowsAgain();

  // another video loaded in the player
  await page.evaluate(() => (window as any).__yt.loadOther("OTHERVIDEO1", 1));
  await expect(state(page)).toHaveAttribute("data-state", "switched");
  await frozenFor(6_000);
  await page.evaluate(() => (window as any).__yt.loadOther("aqz-KE-bpKQ", 1));
  await flowsAgain();

  // video fails
  await page.evaluate(() => (window as any).__yt.fail(150));
  await expect(state(page)).toHaveAttribute("data-state", "error");
  await frozenFor(6_000);
});

test("rapid repeated clicks: one session per start, toggles settle on the real state", async ({ page, request }) => {
  const s = await setup(page, request, 0.9);
  await page.getByRole("button", { name: /^התחל סשן/ }).click();
  await page.getByRole("button", { name: "אני מסכים" }).dblclick();
  await expect(state(page)).toHaveAttribute("data-state", "waiting_for_video");
  await page.waitForTimeout(2000);
  expect(await s.sessions()).toHaveLength(1);

  for (let i = 0; i < 20; i++) await yt(page, i % 2 ? 2 : 1); // ends on pause
  await expect(state(page)).toHaveAttribute("data-state", "paused");
  await page.waitForTimeout(14_000);
  expect((await s.open()).reading_count).toBe(0);

  await yt(page, 1);
  await expect.poll(async () => (await s.open()).reading_count, { timeout: 40_000 }).toBeGreaterThanOrEqual(1);

  // double click on "end": exactly one end, summary still shown
  await page.getByRole("button", { name: "סיים סשן" }).dblclick();
  await expect(page.getByRole("status").filter({ hasText: "הסשן הסתיים" })).toContainText(/מדידות · ממוצע/);
  expect((await s.sessions()).filter((x) => !x.ended_at)).toHaveLength(0);
});

test("video playing but no attention: readings saved, plant does not grow, thirsty banner", async ({ page, request }) => {
  const s = await setup(page, request, 0.1);
  await startSession(page);
  await yt(page, 1);
  await expect(page.getByTestId("score")).toHaveText("0.10", { timeout: 40_000 });
  await expect(page.getByTestId("thirsty")).toBeVisible({ timeout: 25_000 });
  const cur = await s.open();
  expect(cur.reading_count).toBeGreaterThanOrEqual(3);
  expect(cur.focused_seconds).toBe(0);
  expect(cur.stage).toBe("seed");
});

test("YouTube API blocked: user reports play/pause manually", async ({ page, request }) => {
  const s = await setup(page, request, 0.9, { blockYT: true });
  await expect(page.locator("iframe[src*='youtube']")).toBeVisible({ timeout: 20_000 });
  await startSession(page);
  const box = page.getByTestId("manual-playback");
  await expect(box).toContainText("לא הצלחנו לזהות אוטומטית");
  await expect(state(page)).toHaveAttribute("data-state", "waiting_for_video");
  await page.waitForTimeout(14_000);
  expect((await s.open()).reading_count).toBe(0);

  await box.getByRole("button", { name: /התחלתי לצפות/ }).click();
  await expect.poll(async () => (await s.open()).reading_count, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

  await box.getByRole("button", { name: /עצרתי/ }).click();
  await expect(state(page)).toHaveAttribute("data-state", "paused");
  await page.waitForTimeout(1500);
  const n = (await s.open()).reading_count;
  await page.waitForTimeout(7_000);
  expect((await s.open()).reading_count).toBe(n);
});
