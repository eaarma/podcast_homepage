import React, { useEffect, useRef, useState } from "react";

import * as Sentry from "@sentry/react";

type PlayerState = {
  playing: boolean;
  current: number;
  volume: number;
};

const EPS = 0.075; // 75 ms is plenty to hide initial blip

/** module-level single playback manager to avoid races */
let currentAudioEl: HTMLAudioElement | null = null;
function requestPlay(url: string, el: HTMLAudioElement) {
  try {
    if (currentAudioEl && currentAudioEl !== el) currentAudioEl.pause();
  } catch {}
  currentAudioEl = el;
}
function clearCurrentIfMatches(el: HTMLAudioElement) {
  if (currentAudioEl === el) {
    currentAudioEl = null;
  }
}

export default function CustomAudioPlayer({
  url,
  duration,
  disabled,
  playerStateMap,
  setPlayerStateMap,
}: {
  url: string;
  duration?: number;
  disabled?: boolean;
  playerStateMap: Record<string, PlayerState>;
  setPlayerStateMap: React.Dispatch<
    React.SetStateAction<Record<string, PlayerState>>
  >;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const probeTimeoutRef = useRef<number | null>(null);
  const probingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [vol, setVol] = useState(1);
  const [localDuration, setLocalDuration] = useState<number>(
    isFinite(Number(duration || 0)) && (duration || 0) > 0 ? duration! : 0
  );

  const playInProgressRef = useRef(false);

  // ensure an entry in shared map
  useEffect(() => {
    setPlayerStateMap((prev) => ({
      ...(prev || {}),
      [url]: prev[url] || { playing: false, current: 0, volume: 1 },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // accept parent-provided duration if valid
  useEffect(() => {
    if (typeof duration === "number" && isFinite(duration) && duration > 0) {
      setLocalDuration(duration);
    }
  }, [duration]);

  // helper: stop probing (cleanup)
  const stopProbe = (el?: HTMLAudioElement) => {
    probingRef.current = false;
    if (probeTimeoutRef.current) {
      window.clearTimeout(probeTimeoutRef.current);
      probeTimeoutRef.current = null;
    }
    if (el) {
      try {
        // return to start so UI shows 0:00 until user seeks/plays
        el.currentTime = Math.min(el.currentTime, 0);
      } catch {}
    }
  };

  // try to probe duration by seeking near the end (workaround for Infinity/0)
  const startProbe = (el: HTMLAudioElement) => {
    if (!el || probingRef.current) return;
    if (playInProgressRef.current) return;

    probingRef.current = true;

    // If browser supports seeking, set a very large currentTime to prompt the player
    try {
      // Some browsers throw if you set too large a value; try a large number.
      el.currentTime = 1e6;
    } catch (err) {
      // fallback: set to a smaller high value
      try {
        el.currentTime = 1e5;
      } catch (err2) {
        // if seeking fails, give up probing
        stopProbe(el);
        return;
      }
    }

    // listen for duration/durationchange/timeupdate
    const onDurationChange = () => {
      const dur = Number(el.duration);
      if (isFinite(dur) && dur > 0) {
        setLocalDuration(dur);
        try {
          el.currentTime = 0;
        } catch {}
        setCurrent(0);
        stopProbe(el);
      }
    };

    const onTimeUpdate = () => {
      const t = audioRef.current?.currentTime ?? 0;
      const clamped = t < EPS ? 0 : t;
      setCurrent(clamped);
      setPlayerStateMap((prev) => ({
        ...prev,
        [url]: {
          ...(prev[url] || { playing: false, current: 0, volume: vol }),
          playing,
          current: clamped,
          volume: vol,
        },
      }));
    };

    // when resetting to start (loadedmetadata / end / probe success)
    try {
      el.currentTime = 0;
    } catch {}
    setCurrent(0);

    el.addEventListener("durationchange", onDurationChange);
    el.addEventListener("timeupdate", onTimeUpdate);

    // safety timeout: stop probing after 5s
    probeTimeoutRef.current = window.setTimeout(() => {
      Sentry.captureMessage("Audio duration probe failed", {
        level: "warning",
        tags: {
          feature: "audio-playback",
          stage: "duration-probe",
        },
        extra: {
          url,
          duration: el.duration,
          readyState: el.readyState,
          networkState: el.networkState,
        },
      });
      el.removeEventListener("durationchange", onDurationChange);
      el.removeEventListener("timeupdate", onTimeUpdate);
      probingRef.current = false;
      probeTimeoutRef.current = null;
    }, 5000);
  };

  // attach audio element and events; attempt probe if needed
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    el.crossOrigin = "anonymous";
    el.preload = "metadata";

    // set src ONLY once per element
    if (!el.src) {
      el.src = url;
    }

    // only load if nothing has been loaded yet
    if (el.readyState === 0) {
      try {
        el.load();
      } catch {}
    }

    // handlers
    const onLoadedMetadata = () => {
      const dur = Number(el.duration);
      // Sometimes loadedmetadata produces 0 or Infinity — handle that below
      if (isFinite(dur) && dur > 0) {
        setLocalDuration(dur);
      } else {
        // duration is not usable -> start probing
        if (!isFinite(dur) || dur <= 0) {
          Sentry.captureMessage("Invalid audio duration after metadata", {
            level: "warning",
            tags: {
              feature: "audio-playback",
              stage: "metadata",
            },
            extra: {
              url,
              duration: dur,
              readyState: el.readyState,
            },
          });

          startProbe(el);
        }
      }

      // ensure shared map entry exists
      setPlayerStateMap((prev) => ({
        ...prev,
        [url]: prev[url] || { playing: false, current: 0, volume: vol },
      }));
    };

    const onTimeUpdate = () => {
      setCurrent(el.currentTime || 0);
      setPlayerStateMap((prev) => ({
        ...prev,
        [url]: {
          ...(prev[url] || { playing: false, current: 0, volume: vol }),
          playing,
          current: el.currentTime || 0,
          volume: vol,
        },
      }));
    };

    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      clearCurrentIfMatches(el);
      setPlayerStateMap((prev) => ({
        ...prev,
        [url]: {
          ...(prev[url] || { current: 0, volume: vol }),
          playing: false,
          current: 0,
          volume: vol,
        },
      }));
    };

    const onError = () => {
      const mediaError = el.error;

      Sentry.captureMessage("Audio element error", {
        level: "error",
        tags: {
          feature: "audio-playback",
          stage: "media-error",
        },
        extra: {
          url,
          code: mediaError?.code,
          message: mediaError?.message,
          readyState: el.readyState,
          networkState: el.networkState,
          src: el.currentSrc,
        },
      });
      // if metadata couldn't be loaded, try probe (sometimes probing helps)
      startProbe(el);
    };

    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);

    return () => {
      // cleanup
      try {
        el.pause();
      } catch {}
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      stopProbe(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, vol]);

  // only use playerStateMap for volume/UI sync, not to force play/pause
  useEffect(() => {
    const state = playerStateMap[url];
    if (!state) return;
    if (
      typeof state.volume === "number" &&
      Math.abs(state.volume - vol) > 0.01
    ) {
      setVol(state.volume);
      if (audioRef.current) audioRef.current.volume = state.volume;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerStateMap]);

  // helper: pause other audio elements synchronously
  /* const pauseOtherAudioElements = () => {
    try {
      const audios = document.querySelectorAll("audio");
      audios.forEach((a) => {
        if (a !== audioRef.current) {
          try {
            (a as HTMLMediaElement).pause();
          } catch {}
        }
      });
    } catch {}
  }; */

  // play/pause
  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;

    if (playing) {
      try {
        el.pause();
      } catch {}
      setPlaying(false);
      setPlayerStateMap((prev) => ({
        ...prev,
        [url]: {
          ...(prev[url] || { current: 0, volume: vol }),
          playing: false,
          current,
          volume: vol,
        },
      }));
      clearCurrentIfMatches(el);
      return;
    }

    //pauseOtherAudioElements();
    requestPlay(url, el);

    try {
      el.volume = vol;
      playInProgressRef.current = true;

      if (el.readyState < 2) {
  await new Promise((resolve) =>
    el.addEventListener("loadedmetadata", resolve, { once: true })
  );
}


      const p = el.play();
      if (p && typeof (p as Promise<void>).then === "function") {
        await p;
      }
      setPlaying(true);
playInProgressRef.current = false;

    } catch (e) {
      playInProgressRef.current = false;

      Sentry.captureException(e, {
        tags: {
          feature: "audio-playback",
          stage: "play",
        },
        extra: {
          url,
          volume: vol,
          currentTime: el.currentTime,
          readyState: el.readyState,
          networkState: el.networkState,
        },
      });
      console.warn("Play failed:", e);
      setPlaying(false);
      setPlayerStateMap((prev) => ({
        ...prev,
        [url]: {
          ...(prev[url] || { current: 0, volume: vol }),
          playing: false,
          current: el.currentTime || 0,
          volume: vol,
        },
      }));
      clearCurrentIfMatches(el);
    }
  };

  const onSeek = (v: number) => {
    const el = audioRef.current;
    if (!el) return;
    try {
      el.currentTime = v;
    } catch {}
    setCurrent(v);
    setPlayerStateMap((prev) => ({
      ...prev,
      [url]: {
        ...(prev[url] || { playing: false, volume: vol, current: 0 }),
        playing,
        current: v,
        volume: vol,
      },
    }));
  };

  const onVolume = (v: number) => {
    setVol(v);
    if (audioRef.current) audioRef.current.volume = v;
    setPlayerStateMap((prev) => ({
      ...prev,
      [url]: {
        ...(prev[url] || { playing: false, current }),
        playing,
        current,
        volume: v,
      },
    }));
  };

  // reset on url change
  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
  }, [url]);

  const PlaySVG = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="white"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
  const PauseSVG = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="white"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
  const VolumeSVG = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden
      role="img"
      style={{ display: "block" }}
    >
      <path d="M3 10v4h4l5 5V5L7 10H3z" fill="currentColor" />
    </svg>
  );

  const formatTime = (s: number) => {
    if (!isFinite(s) || s <= 0) return "0:00";
    const mm = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${mm}:${ss < 10 ? "0" + ss : ss}`;
  };

  return (
    <div className="w-full">
      {/* hidden audio element */}
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        style={{ display: "none" }}
      />

      <div className="flex items-center space-x-3 overflow-x-auto">
        <button
          onClick={togglePlay}
          style={{
            background: "transparent",
            border: `2px solid ${playing ? "#d868ee" : "#007BFF"}`,
            borderRadius: "30%",
            padding: "0.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            outline: "none",
            transition: "border-color 0.2s ease",
          }}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? PauseSVG : PlaySVG}
        </button>

        {/* Progress bar */}
        <input
          type="range"
          min={0}
          max={localDuration || 0}
          step="0.01"
          value={Math.min(current, localDuration || 0)}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="media-range flex-1 mx-2"
          style={{
            minWidth: "100px", // ✅ don’t let it collapse
            flexShrink: 1, // ✅ shrink but respect minWidth
            ["--range-progress" as any]: `${
              localDuration ? (current / localDuration) * 100 : 0
            }%`,
          }}
        />

        {/* Time display */}
        <div className="text-sm text-white font-mono whitespace-nowrap w-20 text-right m-2">
          {formatTime(current)} / {formatTime(localDuration)}
        </div>

        {/* Volume control */}
        <div className="flex items-center space-x-2 ml-2 w-20 sm:w-28">
          <span className="text-sm text-gray-300" aria-hidden>
            {VolumeSVG}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={vol}
            onChange={(e) => onVolume(Number(e.target.value))}
            className="media-range w-full"
            aria-label="Volume"
            style={{
              ["--range-progress" as any]: `${vol * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
