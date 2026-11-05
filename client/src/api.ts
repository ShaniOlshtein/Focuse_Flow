// Same-origin, relative API calls. Token lives in localStorage so a refresh keeps the user logged in.
const TOKEN_KEY = "bloom_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "אין חיבור לשרת. בדקו את החיבור ונסו שוב");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.detail === "string" ? data.detail : "משהו השתבש, נסו שוב";
    if (res.status === 401 && token && !path.startsWith("/api/auth/login")) {
      tokenStore.clear();
      onUnauthorized();
    }
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export type User = { id: string; email: string; display_name: string; created_at: string };
export type ContentType = "youtube" | "text" | "web";
export type Content = {
  id: string;
  type: ContentType;
  title: string;
  source: string;
  bed: string | null;
  created_at: string;
  youtube_id?: string | null;
};

export const TYPE_LABEL: Record<ContentType, string> = { youtube: "סרטון YouTube", text: "טקסט", web: "דף אינטרנט" };

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
