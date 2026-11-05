import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/* Minimal YouTube IFrame API wrapper: gives currentTime (reading position) and pause/play. */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiP: Promise<any> | null = null;
function loadApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiP ??= new Promise((resolve, reject) => {
    window.setTimeout(() => reject(new Error("timeout")), 8000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => reject(new Error("blocked"));
    document.head.appendChild(s);
  });
  apiP.catch(() => (apiP = null));
  return apiP;
}

export type PlayerHandle = { getTime: () => number; pause: () => void; play: () => void; isPlaying: () => boolean };

export default forwardRef<PlayerHandle, { videoId: string; title: string }>(function YouTubePlayer({ videoId, title }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const [fallback, setFallback] = useState(false); // API script blocked -> plain embed, position = elapsed time
  const shownAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    loadApi().then((YT) => {
      if (cancelled || !host.current) return;
      const el = document.createElement("div");
      host.current.appendChild(el);
      player.current = new YT.Player(el, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: (e: any) => e.target.getIframe()?.setAttribute("title", title),
        },
      });
    }).catch(() => {
      if (!cancelled) setFallback(true);
    });
    return () => {
      cancelled = true;
      try {
        player.current?.destroy();
      } catch {
        /* ignore */
      }
      player.current = null;
    };
  }, [videoId, title]);

  useImperativeHandle(ref, () => ({
    getTime: () =>
      player.current?.getCurrentTime
        ? Number(player.current.getCurrentTime()) || 0
        : (Date.now() - shownAt.current) / 1000,
    pause: () => player.current?.pauseVideo?.(),
    play: () => player.current?.playVideo?.(),
    isPlaying: () => player.current?.getPlayerState?.() === 1,
  }));

  if (fallback)
    return (
      <div className="video-wrap">
        <iframe title={title} src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
          allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
  return <div className="video-wrap" ref={host} />;
});
