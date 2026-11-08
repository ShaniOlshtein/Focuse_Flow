import { describe, expect, it } from "vitest";
import { INITIAL_PLAYBACK, isMeasuring, Playback, PlaybackEvent, reducePlayback, ytStateToEvent } from "./playback";

const run = (...events: PlaybackEvent[]) => events.reduce(reducePlayback, INITIAL_PLAYBACK);
const START_WAITING: PlaybackEvent = { type: "SESSION_START", playing: false };
const PLAY: PlaybackEvent = { type: "PLAY" };
const PAUSE: PlaybackEvent = { type: "PAUSE" };

describe("playback state machine", () => {
  it("starts idle and not measuring", () => {
    expect(INITIAL_PLAYBACK.state).toBe("idle");
    expect(isMeasuring(INITIAL_PLAYBACK)).toBe(false);
  });

  it("player events before a session are ignored", () => {
    const p = run(PLAY, { type: "BUFFERING" }, { type: "ENDED" }, { type: "ERROR" });
    expect(p.state).toBe("idle");
    expect(isMeasuring(p)).toBe(false);
  });

  it("session started while the video is not playing -> waiting_for_video, no measurement", () => {
    const p = run(START_WAITING);
    expect(p.state).toBe("waiting_for_video");
    expect(isMeasuring(p)).toBe(false);
  });

  it("session started while the video already plays -> playing, measuring", () => {
    const p = run({ type: "SESSION_START", playing: true });
    expect(p.state).toBe("playing");
    expect(isMeasuring(p)).toBe(true);
  });

  it("measures only after the video really plays", () => {
    expect(isMeasuring(run(START_WAITING, PLAY))).toBe(true);
  });

  it("buffering / unstarted / cued before the first play keep waiting", () => {
    const p = run(START_WAITING, { type: "BUFFERING" }, PAUSE);
    expect(p.state).toBe("waiting_for_video");
    expect(isMeasuring(p)).toBe(false);
  });

  it("pause stops measuring, play resumes it", () => {
    const paused = run(START_WAITING, PLAY, PAUSE);
    expect(paused.state).toBe("paused");
    expect(isMeasuring(paused)).toBe(false);
    expect(isMeasuring(reducePlayback(paused, PLAY))).toBe(true);
  });

  it("buffering in the middle stops measuring until playing again", () => {
    const b = run(START_WAITING, PLAY, { type: "BUFFERING" });
    expect(b.state).toBe("buffering");
    expect(isMeasuring(b)).toBe(false);
    expect(isMeasuring(reducePlayback(b, PLAY))).toBe(true);
  });

  it("ended stops measuring; replay resumes", () => {
    const e = run(START_WAITING, PLAY, { type: "ENDED" });
    expect(e.state).toBe("ended");
    expect(isMeasuring(e)).toBe(false);
    expect(isMeasuring(reducePlayback(e, PLAY))).toBe(true);
  });

  it("a video that fails to load never measures", () => {
    const e = run(START_WAITING, { type: "ERROR" });
    expect(e.state).toBe("error");
    expect(isMeasuring(e)).toBe(false);
  });

  it("tab hidden pauses measurement while the video keeps playing; visible resumes", () => {
    const h = run(START_WAITING, PLAY, { type: "TAB_HIDDEN" });
    expect(h.state).toBe("playing");
    expect(isMeasuring(h)).toBe(false);
    expect(isMeasuring(reducePlayback(h, { type: "TAB_VISIBLE" }))).toBe(true);
  });

  it("tab hidden + play while hidden: still not measuring until visible", () => {
    const p = run(START_WAITING, { type: "TAB_HIDDEN" }, PLAY);
    expect(isMeasuring(p)).toBe(false);
    expect(isMeasuring(reducePlayback(p, { type: "TAB_VISIBLE" }))).toBe(true);
  });

  it("another video in the player stops measuring and ignores its events", () => {
    const s = run(START_WAITING, PLAY, { type: "VIDEO_CHANGED", original: false, playing: true }, PLAY);
    expect(s.state).toBe("switched");
    expect(isMeasuring(s)).toBe(false);
  });

  it("returning to the original video resumes per its real state", () => {
    const sw = run(START_WAITING, PLAY, { type: "VIDEO_CHANGED", original: false, playing: true });
    expect(reducePlayback(sw, { type: "VIDEO_CHANGED", original: true, playing: true }).state).toBe("playing");
    expect(reducePlayback(sw, { type: "VIDEO_CHANGED", original: true, playing: false }).state).toBe("paused");
    const swBefore = run(START_WAITING, { type: "VIDEO_CHANGED", original: false, playing: true });
    expect(reducePlayback(swBefore, { type: "VIDEO_CHANGED", original: true, playing: false }).state).toBe("waiting_for_video");
  });

  it("VIDEO_CHANGED original=true when not switched is a no-op", () => {
    const p = run(START_WAITING, PLAY);
    expect(reducePlayback(p, { type: "VIDEO_CHANGED", original: true, playing: false })).toBe(p);
  });

  it("manual session end -> idle, nothing measured even if the video keeps playing", () => {
    const p = run(START_WAITING, PLAY, { type: "SESSION_END" }, PLAY);
    expect(p.state).toBe("idle");
    expect(isMeasuring(p)).toBe(false);
  });

  it("a new session after a previous one starts fresh (waiting, not 'started')", () => {
    const p = run(START_WAITING, PLAY, PAUSE, { type: "SESSION_END" }, START_WAITING);
    expect(p.state).toBe("waiting_for_video");
    expect(p.started).toBe(false);
    expect(reducePlayback(p, PAUSE).state).toBe("waiting_for_video");
  });

  it("rapid repeated play/pause toggles end in the last real state", () => {
    let p: Playback = run(START_WAITING);
    for (let i = 0; i < 50; i++) p = reducePlayback(reducePlayback(p, PLAY), PAUSE);
    expect(p.state).toBe("paused");
    p = reducePlayback(p, PLAY);
    expect(isMeasuring(p)).toBe(true);
  });

  it("repeated identical events return the same object (no needless re-render)", () => {
    const p = run(START_WAITING, PLAY);
    expect(reducePlayback(p, PLAY)).toBe(p);
    const q = reducePlayback(p, PAUSE);
    expect(reducePlayback(q, PAUSE)).toBe(q);
    expect(reducePlayback(q, { type: "TAB_VISIBLE" })).toBe(q);
  });

  it("tab visibility is kept across session start/end", () => {
    const p = run({ type: "TAB_HIDDEN" }, { type: "SESSION_START", playing: true });
    expect(p.tabHidden).toBe(true);
    expect(isMeasuring(p)).toBe(false);
  });
});

describe("YouTube state codes", () => {
  it.each([
    [1, "PLAY"],
    [2, "PAUSE"],
    [-1, "PAUSE"],
    [5, "PAUSE"],
    [3, "BUFFERING"],
    [0, "ENDED"],
  ])("code %i -> %s", (code, type) => expect(ytStateToEvent(code)?.type).toBe(type));
  it("unknown codes -> null", () => {
    expect(ytStateToEvent(42)).toBeNull();
    expect(ytStateToEvent(Number.NaN)).toBeNull();
  });
});
