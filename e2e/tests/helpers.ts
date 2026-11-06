import { APIRequestContext, Page } from "@playwright/test";
import { copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const hasMedia = (file: string) => existsSync(join(__dirname, "..", "media", file));
export const uid = () => Math.random().toString(36).slice(2, 10);

/** Chrome can't read fake-camera files from non-ASCII paths, so copy the clip to the temp dir. */
export function fakeCamArgs(file: string) {
  const src = join(__dirname, "..", "media", file);
  const dst = join(tmpdir(), `bloom-${file}`);
  if (!existsSync(dst)) copyFileSync(src, dst);
  return [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${dst}`,
  ];
}

/** Register + login through the API and put the token in localStorage (fast path for non-auth tests). */
export async function apiLogin(page: Page, request: APIRequestContext, name = "בודק") {
  const email = `u_${uid()}@test.com`;
  const password = "Password123!";
  await request.post("/api/auth/register", { data: { email, password, display_name: name } });
  const { access_token } = await (await request.post("/api/auth/login", { data: { email, password } })).json();
  await page.goto("/login");
  await page.evaluate((t) => localStorage.setItem("bloom_token", t), access_token);
  return { token: access_token as string, email, password };
}

export async function addContent(request: APIRequestContext, token: string, data: Record<string, string>) {
  const r = await request.post("/api/content", { data, headers: { Authorization: `Bearer ${token}` } });
  return (await r.json()).id as string;
}
