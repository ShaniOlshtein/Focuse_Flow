/* Single source of truth for "is the video really playing right now?".
   Measurement and plant growth run only while isMeasuring() is true. Pure functions - unit tested. */

export type PlaybackState =
  | "idle" // no session
  | "waiting_for_video" // session started, video never played yet
  | "playing"
  | "paused"
  | "buffering"
  | "ended"
  | "error" // video failed to load / play
  | "switched"; // another video is loaded in the player

export type PlaybackEvent =
  | { type: "SESSION_START"; playing: boolean }
  | { type: "SESSION_END" }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "BUFFERING" }
  | { type: "ENDED" }
  | { type: "ERROR" }
  | { type: "VIDEO_CHANGED"; original: boolean; playing: boolean }
  | { type: "TAB_HIDDEN" }
  | { type: "TAB_VISIBLE" };

export type Playback = { state: PlaybackState; tabHidden: boolean; started: boolean };

export const INITIAL_PLAYBACK: Playback = { state: "idle", tabHidden: false, started: false };

export function reducePlayback(p: Playback, e: PlaybackEvent): Playback {
  switch (e.type) {
    case "TAB_HIDDEN":
      return p.tabHidden ? p : { ...p, tabHidden: true };
    case "TAB_VISIBLE":
      return p.tabHidden ? { ...p, tabHidden: false } : p;
    case "SESSION_START":
      return { ...p, state: e.playing ? "playing" : "waiting_for_video", started: e.playing };
    case "SESSION_END":
      return { ...p, state: "idle", started: false };
  }
  if (p.state === "idle") return p; // player events outside a session are irrelevant
  if (e.type === "VIDEO_CHANGED") {
    if (!e.original) return { ...p, state: "switched" };
    if (p.state !== "switched") return p;
    return { ...p, state: e.playing ? "playing" : p.started ? "paused" : "waiting_for_video", started: p.started || e.playing };
  }
  if (p.state === "switched") return p; // ignore the other video's events
  switch (e.type) {
    case "PLAY":
      return p.state === "playing" ? p : { ...p, state: "playing", started: true };
    case "PAUSE":
      // "unstarted"/"cued" also arrive as PAUSE: before the first play we keep waiting
      return !p.started ? (p.state === "waiting_for_video" ? p : { ...p, state: "waiting_for_video" })
        : p.state === "paused" ? p : { ...p, state: "paused" };
    case "BUFFERING":
      return p.started ? { ...p, state: "buffering" } : p;
    case "ENDED":
      return { ...p, state: "ended" };
    case "ERROR":
      return { ...p, state: "error" };
  }
  return p;
}

export const isMeasuring = (p: Playback) => p.state === "playing" && !p.tabHidden;

/** YouTube IFrame API player state -> event (-1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued). */
export function ytStateToEvent(code: number): PlaybackEvent | null {
  switch (code) {
    case 1:
      return { type: "PLAY" };
    case 2:
    case -1:
    case 5:
      return { type: "PAUSE" };
    case 3:
      return { type: "BUFFERING" };
    case 0:
      return { type: "ENDED" };
    default:
      return null;
  }
}

export const PLAYBACK_TEXT: Record<PlaybackState, string> = {
  idle: "",
  waiting_for_video: "▶ ממתין להפעלת הסרטון — המדידה והצמיחה יתחילו כשהסרטון יתנגן",
  playing: "",
  paused: "⏸ הסרטון מושהה — המדידה והצמיחה עצרו, וימשיכו מאותה נקודה כשתמשיכו לנגן",
  buffering: "⏳ הסרטון נטען… המדידה ממתינה",
  ended: "🎬 הסרטון הסתיים — המדידה נעצרה. אפשר לנגן שוב או לסיים את הסשן",
  error: "⚠️ הסרטון לא נטען או לא מתנגן — המדידה לא פועלת",
  switched: "🔀 בנגן מופיע סרטון אחר — המדידה מושהית עד שתחזרו לסרטון של הסשן",
};
export const TAB_HIDDEN_TEXT = "👀 עברתם ללשונית אחרת — המדידה מושהית עד שתחזרו";
