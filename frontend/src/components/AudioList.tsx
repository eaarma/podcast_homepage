import React, { useEffect, useState } from "react";
import axios from "axios";
import CustomAudioPlayer from "./CustomAudioPlayer";

type AudioFile = {
  id?: string;
  name: string;
  uploadedAt?: string;
  url: string;
  title?: string | null;
  phone?: string | null;
  voiceType?: string | null;
  duration?: number; // normalized numeric duration (seconds)
};

type PlayerState = {
  playing: boolean;
  current: number;
  volume: number;
};

export default function AudioList(): JSX.Element {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerStateMap, setPlayerStateMap] = useState<
    Record<string, PlayerState>
  >({});
  const [durations, setDurations] = useState<Record<string, number>>({});

  const token = localStorage.getItem("admin-token");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    // fallback that uses an <audio> element to read duration (used when server value is absent)
    const fallbackDurationFromAudioElement = (url: string, timeoutMs = 5000) =>
      new Promise<number>((resolve) => {
        try {
          const a = new Audio();
          a.preload = "metadata";
          a.crossOrigin = "anonymous";
          let settled = false;
          let timeoutId: number | undefined;

          const cleanup = () => {
            try {
              a.src = "";
              a.onloadedmetadata = null;
              a.onerror = null;
            } catch {}
            if (timeoutId) window.clearTimeout(timeoutId);
          };

          a.onloadedmetadata = () => {
            if (settled) return;
            settled = true;
            const d = Number.isFinite(a.duration) ? a.duration : 0;
            cleanup();
            resolve(d || 0);
          };

          a.onerror = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(0);
          };

          timeoutId = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(0);
          }, timeoutMs);

          // set src last to start loading
          a.src = url;
          try {
            a.load();
          } catch {}
        } catch (err) {
          resolve(0);
        }
      });

    const fetchFiles = async () => {
      setLoading(true);
      try {
        const res = await axios.get<AudioFile[]>(
          "https://podcast-homepage.onrender.com/audio/files",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const list = res.data || [];

        // prepare playerStateMap keys
        const initialMap: Record<string, PlayerState> = {};
        list.forEach((f) => {
          initialMap[f.url] = { playing: false, current: 0, volume: 1 };
        });
        setPlayerStateMap(initialMap);

        // Normalize durations from server and fallback if necessary.
        // We'll compute durations in parallel but keep a small concurrency implicitly via Promise.all().
        const enriched = await Promise.all(
          list.map(async (f) => {
            // serverDuration might be number or string (coerce safely)
            const raw = (f as any).duration;
            let dur = 0;

            if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
              dur = raw;
            } else if (typeof raw === "string" && raw.trim() !== "") {
              // trim commas/spaces just in case (some headers can have trailing commas)
              const cleaned = raw.replace(",", "").trim();
              const parsed = Number.parseFloat(cleaned);
              if (Number.isFinite(parsed) && parsed > 0) dur = parsed;
            }

            // If server did not provide a valid duration, fallback to audio element
            if (!Number.isFinite(dur) || dur <= 0) {
              // try audio element fallback (short timeout)
              try {
                dur = await fallbackDurationFromAudioElement(f.url, 5000);
                if (!Number.isFinite(dur)) dur = 0;
              } catch (err) {
                dur = 0;
              }
            }

            // return item with normalized duration
            return { ...f, duration: dur };
          })
        );

        // set durations map and files state
        const map: Record<string, number> = {};
        enriched.forEach((f) => {
          map[f.url] = f.duration ?? 0;
        });
        setDurations(map);
        setFiles(enriched);
      } catch (err) {
        console.error("Error fetching audio files:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleDownload = async (fileName: string) => {
    try {
      const response = await fetch(
        `https://podcast-homepage.onrender.com/audio/download/${fileName}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed", err);
      alert("Download failed (see console).");
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!window.confirm(`Delete file "${fileName}"?`)) return;
    try {
      await axios.delete(
        `https://podcast-homepage.onrender.com/audio/files/${fileName}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setFiles((prev) => prev.filter((f) => f.name !== fileName));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Delete failed (see console).");
    }
  };

  if (!token)
    return (
      <p className="text-center p-4">
        You must be logged in to view audio files.
      </p>
    );
  if (loading) return <p className="text-center p-4">Loading audio files...</p>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 bg-white dark:bg-gray-900 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6 text-center text-gray-900 dark:text-white">
        Audio Recordings
      </h2>

      {files.length === 0 ? (
        <p className="text-center text-gray-600 dark:text-gray-300">
          No audio files found.
        </p>
      ) : (
        <ul className="space-y-4">
          {files.map((file) => (
            <li
              key={file.url}
              className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">
                    {file.title || file.name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Phone:{" "}
                    <span className="font-medium">{file.phone ?? "none"}</span>
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    File name:{" "}
                    <span className="font-medium">{file.name ?? "none"}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {file.uploadedAt && !isNaN(Date.parse(file.uploadedAt))
                      ? new Date(file.uploadedAt).toLocaleString()
                      : "Date unknown"}
                  </p>
                  <div className="mt-3">
                    <CustomAudioPlayer
                      url={file.url}
                      duration={file.duration ?? 0}
                      disabled={false}
                      playerStateMap={playerStateMap}
                      setPlayerStateMap={setPlayerStateMap}
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      ({(file.duration ?? 0).toFixed(2)} sec)
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => handleDownload(file.name)}
                    title="Download"
                    className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <span>
                      {/* Download SVG */}{" "}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5 text-green-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 3v12m0 0l4-4m-4 4l-4-4M21 21H3"
                        />{" "}
                      </svg>
                    </span>
                  </button>
                  <button
                    onClick={() => handleDelete(file.name)}
                    title="Delete"
                    className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <span>
                      {/* Trash SVG */}{" "}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5 text-red-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        {" "}
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
                        />{" "}
                      </svg>
                    </span>
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
