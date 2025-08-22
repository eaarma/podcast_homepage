import React, { useRef, useState } from "react";
import CustomAudioPlayer from "./CustomAudioPlayer";
import { processAndCompress } from "../utils/audioUtils";
import type { VoiceType } from "../utils/audioUtils"; // type-only import
import RecorderButton from "./RecorderButton";

import lamejs from "@breezystack/lamejs";

const VOICE_LIST: VoiceType[] = ["voice1", "voice2"];
const VOICE_LABELS: Record<VoiceType, string> = {
  voice1: "Voice 1",
  voice2: "Voice 2",
};

/* -------------------- Helpers -------------------- */

async function decodeBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as
    | typeof AudioContext
    | undefined;
  if (!Ctx) throw new Error("No AudioContext available");
  const ctx = new Ctx();
  try {
    // decodeAudioData returns a Promise in modern browsers
    const audioBuf = await ctx.decodeAudioData(arrayBuffer);
    return audioBuf;
  } finally {
    try {
      ctx.close();
    } catch {}
  }
}

function floatTo16BitPCM(float32: Float32Array) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Try to convert an AudioBuffer to MP3 bytes using lamejs.
 * If lamejs import fails or encoding fails, this function throws.
 */
async function audioBufferToMp3Bytes(buffer: AudioBuffer, bitrateKbps = 96) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;

  const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, bitrateKbps);
  const blockSize = 1152;
  const mp3Chunks: number[] = [];

  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(buffer.getChannelData(c));
  }

  for (let i = 0; i < buffer.length; i += blockSize) {
    const left16 = floatTo16BitPCM(channelData[0].subarray(i, i + blockSize));

    let mp3buf: Int8Array | Int16Array | Uint8Array | number[];

    if (numChannels === 1) {
      mp3buf = encoder.encodeBuffer(left16);
    } else {
      const right16 = floatTo16BitPCM(
        channelData[1].subarray(i, i + blockSize)
      );
      mp3buf = encoder.encodeBuffer(left16, right16);
    }

    if (mp3buf.length > 0) {
      mp3Chunks.push(...mp3buf);
    }
  }

  const flush = encoder.flush();
  if (flush.length > 0) {
    mp3Chunks.push(...flush);
  }

  return new Uint8Array(mp3Chunks);
}

/**
 * Convert Blob -> MP3 Blob with debug logs
 */
async function blobToMp3Blob(blob: Blob, bitrateKbps = 96): Promise<Blob> {
  console.log("[blobToMp3Blob] start", blob);
  try {
    const audioBuf = await decodeBlobToAudioBuffer(blob);
    console.log("[blobToMp3Blob] decoded AudioBuffer", {
      duration: audioBuf.duration,
      channels: audioBuf.numberOfChannels,
      sampleRate: audioBuf.sampleRate,
    });

    const bytes = await audioBufferToMp3Bytes(audioBuf, bitrateKbps);
    console.log("[blobToMp3Blob] got MP3 bytes", bytes.length);

    const mp3Blob = new Blob([bytes.buffer], { type: "audio/mpeg" });
    console.log("[blobToMp3Blob] returning MP3 blob", mp3Blob);
    return mp3Blob;
  } catch (err) {
    console.error("[blobToMp3Blob] conversion failed", err);
    throw err;
  }
}

/**
 * Fallback: get duration by creating an Audio element and waiting for loadedmetadata.
 */
function durationFromAudioElement(
  urlOrBlob: string | Blob,
  timeoutMs = 5000
): Promise<number> {
  return new Promise((resolve) => {
    try {
      const a = new Audio();
      a.preload = "metadata";
      a.crossOrigin = "anonymous";
      let settled = false;
      const cleanup = () => {
        a.onloadedmetadata = null;
        a.onerror = null;
        try {
          a.src = "";
        } catch {}
      };
      const onDone = (d: number) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(Number.isFinite(d) ? d : 0);
      };
      a.onloadedmetadata = () => {
        onDone(a.duration || 0);
      };
      a.onerror = () => {
        onDone(0);
      };
      const t = window.setTimeout(() => {
        onDone(0);
      }, timeoutMs);
      // ensure we clear timeout on finish
      const oldOnLoaded = a.onloadedmetadata;
      a.onloadedmetadata = () => {
        window.clearTimeout(t);
        if (oldOnLoaded) oldOnLoaded.call(a);
        onDone(a.duration || 0);
      };
      if (typeof urlOrBlob === "string") {
        a.src = urlOrBlob;
        try {
          a.load();
        } catch {}
      } else {
        a.src = URL.createObjectURL(urlOrBlob);
        try {
          a.load();
        } catch {}
      }
    } catch {
      resolve(0);
    }
  });
}

/* -------------------- Component -------------------- */

export default function VoiceRecorder(): JSX.Element {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [title, setTitle] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // NOTE: originalBlob here will be the blob we use for playback/upload.
  // It may be mp3 (preferred) or webm fallback.
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalURL, setOriginalURL] = useState<string | null>(null);
  const [originalDuration, setOriginalDuration] = useState<number>(0);

  const [processedBlobs, setProcessedBlobs] = useState<
    Record<VoiceType, Blob | null>
  >({
    voice1: null,
    voice2: null,
  });
  const [processedURLs, setProcessedURLs] = useState<
    Record<VoiceType, string | null>
  >({
    voice1: null,
    voice2: null,
  });
  const [processedDurations, setProcessedDurations] = useState<
    Record<VoiceType, number>
  >({
    voice1: 0,
    voice2: 0,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  type PlayerState = { playing: boolean; current: number; volume: number };
  const [playerStateMap, setPlayerStateMap] = useState<
    Record<string, PlayerState>
  >({});

  const startRecording = async () => {
    try {
      cleanupAll();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      mr.onstop = async () => {
        setIsProcessing(true);
        setProcessingProgress(5);

        try {
          const recordedBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });

          const playbackBlob = recordedBlob;
          const playbackURL = URL.createObjectURL(playbackBlob);

          let dur = 0;
          try {
            const buf = await decodeBlobToAudioBuffer(playbackBlob);
            dur = buf.duration || 0;
          } catch {
            dur = await durationFromAudioElement(playbackBlob);
          }
          setProcessingProgress(25);

          setOriginalBlob(playbackBlob);
          setOriginalURL(playbackURL);
          setOriginalDuration(dur);

          await processAllVoices(recordedBlob);
          setProcessingProgress(100);
        } catch (e) {
          console.error("Error in onstop processing:", e);
        } finally {
          setIsProcessing(false);
          setProcessingProgress(0);
        }
      };

      mr.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(
        () => setRecordingTime((t) => t + 1),
        1000
      );

      // safety timeout (5 minutes)
      setTimeout(() => {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "recording"
        ) {
          stopRecording();
        }
      }, 5 * 60 * 1000);
    } catch (err) {
      console.error("Mic error:", err);
      alert("Could not start recording. Check microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // processAllVoices: keep your processAndCompress pipeline unchanged,
  const processAllVoices = async (originalWebmBlob: Blob) => {
    setIsProcessing(true);
    setProcessingProgress(0);

    VOICE_LIST.forEach((v) => {
      if (processedURLs[v]) URL.revokeObjectURL(processedURLs[v]!);
    });
    setProcessedURLs({ voice1: null, voice2: null });
    setProcessedBlobs({ voice1: null, voice2: null });
    setProcessedDurations({ voice1: 0, voice2: 0 });

    const total = VOICE_LIST.length;

    for (let i = 0; i < total; i++) {
      const v = VOICE_LIST[i];
      try {
        await new Promise((r) => setTimeout(r, 30));

        const opts = {
          targetSampleRate: 22050,
          channels: 1,
          audioBitsPerSecond: 64000,
        };

        const res = await processAndCompress(originalWebmBlob, v, opts);
        // ensure blob type is correct
        const processedBlob = res.blob.type
          ? res.blob
          : new Blob([res.blob], { type: "audio/webm" });

        // <<< Add this line to debug >>>
        console.log(
          "Processed blob info:",
          v,
          processedBlob,
          processedBlob.size,
          processedBlob.type
        );

        setProcessedBlobs((prev) => ({ ...prev, [v]: processedBlob }));
        const url = URL.createObjectURL(processedBlob);
        setProcessedURLs((prev) => ({ ...prev, [v]: url }));

        // decode duration safely
        try {
          const buf = await decodeBlobToAudioBuffer(processedBlob);
          setProcessedDurations((prev) => ({
            ...prev,
            [v]: buf.duration || 0,
          }));
        } catch {
          const fallbackDur = await durationFromAudioElement(processedBlob);
          setProcessedDurations((prev) => ({ ...prev, [v]: fallbackDur }));
        }
      } catch (err) {
        console.error("Processing failed for", v, err);
      } finally {
        setProcessingProgress(Math.round(((i + 1) / total) * 100));
      }
    }

    await new Promise((r) => setTimeout(r, 150));
    setIsProcessing(false);
    setProcessingProgress(0);
  };

  // upload chosen blob and inputs as metadata
  const handleUpload = async (useOriginal: boolean, voice?: VoiceType) => {
    let blobToSend: Blob | null = null;
    let filename = "recording";

    if (useOriginal) {
      blobToSend = originalBlob;
      filename = "original";
    } else if (voice) {
      blobToSend = processedBlobs[voice];
      filename = voice;
    }

    if (!blobToSend) {
      alert("No audio to send.");
      return;
    }

    try {
      const mimeType = blobToSend.type || "audio/webm";
      const ext =
        mimeType === "audio/mpeg"
          ? "mp3"
          : mimeType === "audio/wav"
          ? "wav"
          : mimeType.split("/")[1] || "webm";
      const fd = new FormData();
      fd.append("audio", blobToSend, `${filename}.${ext}`);
      fd.append("title", title || "Untitled Recording");
      fd.append("phoneNumber", phoneNumber || "");
      fd.append("voiceType", useOriginal ? "original" : voice || "unknown");
      fd.append(
        "duration",
        useOriginal
          ? originalDuration.toString()
          : voice && processedDurations[voice] !== undefined
          ? processedDurations[voice].toString()
          : "0"
      );

      const res = await fetch(
        "https://podcast-homepage.onrender.com/api/upload",
        {
          method: "POST",
          body: fd,
        }
      );

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      alert(`Uploaded! Record ID: ${data.recordId}`);
      cleanupAll();
    } catch (err) {
      console.error("Upload error:", err);
      alert("Upload failed (see console)");
    }
  };

  const cleanupAll = () => {
    if (originalURL) {
      URL.revokeObjectURL(originalURL);
      setOriginalURL(null);
    }
    VOICE_LIST.forEach((v) => {
      const u = processedURLs[v];
      if (u) URL.revokeObjectURL(u);
    });
    setProcessedURLs({ voice1: null, voice2: null });
    setProcessedBlobs({ voice1: null, voice2: null });
    setProcessedDurations({ voice1: 0, voice2: 0 });
    setOriginalBlob(null);
    setOriginalDuration(0);
    setPlayerStateMap({});
    setRecordingTime(0);
  };

  return (
    <section className="voice-recorder w-full max-w-lg mx-auto p-4 bg-pink-300 text-white rounded-lg">
      <h2 className="text-xl font-semibold mb-2">Send a Voice Recording</h2>
      <p className="text-sm mb-4">
        Record, preview processed voices, then send chosen audio.
      </p>

      <div className="flex flex-col items-center mb-4 space-y-2">
        <RecorderButton
          startRecording={startRecording}
          stopRecording={stopRecording}
          isProcessing={isProcessing}
          recordingTime={recordingTime}
          isRecording={isRecording}
        />
      </div>

      {isProcessing ? (
        <div className="flex flex-col items-center justify-center p-6 bg-gray-900 rounded">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mb-4" />
          <div className="mb-2">Processing voices...</div>
          <div className="w-full bg-gray-700 h-2 rounded overflow-hidden mb-2">
            <div
              className="h-2 bg-green-400"
              style={{ width: `${processingProgress}%` }}
            />
          </div>
          <div className="text-sm text-gray-300">{processingProgress}%</div>
        </div>
      ) : (
        <>
          {originalURL && (
            <div className="mb-6">
              <div className="mb-4">
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="title"
                >
                  Title
                </label>
                <input
                  id="title"
                  type="text"
                  placeholder="Add a title to the recording"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-gray-700 border border-gray-500 focus:outline-none focus:border-blue-400"
                />
              </div>

              <div className="mb-2">
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="phone"
                >
                  Phone number <span className="text-red-500">*</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  placeholder="Enter phone number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-gray-700 border border-gray-500 focus:outline-none focus:border-blue-400"
                />
              </div>

              <label className="block text-sm font-medium">
                Original Voice:
              </label>
              <CustomAudioPlayer
                url={originalURL}
                duration={originalDuration}
                disabled={isProcessing}
                playerStateMap={playerStateMap}
                setPlayerStateMap={setPlayerStateMap}
              />
              <div className="flex items-center justify-between mt-2">
                <div className="text-sm"></div>
                <div>
                  <button
                    onClick={() => handleUpload(true)}
                    className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-700"
                    disabled={isProcessing}
                  >
                    Send Original
                  </button>
                </div>
              </div>
            </div>
          )}

          {originalURL && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Modified Voices:
              </label>
              {VOICE_LIST.map((v) => (
                <div key={v} className="mb-4 p-2 bg-gray-700 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <span>{VOICE_LABELS[v]}</span>
                    <div className="space-x-2">
                      {processedBlobs[v] && (
                        <button
                          onClick={() => handleUpload(false, v)}
                          className="bg-purple-600 px-2 py-1 rounded hover:bg-purple-700"
                          disabled={isProcessing}
                        >
                          Send
                        </button>
                      )}
                    </div>
                  </div>

                  {processedURLs[v] ? (
                    <CustomAudioPlayer
                      url={processedURLs[v]!}
                      duration={processedDurations[v]}
                      disabled={isProcessing}
                      playerStateMap={playerStateMap}
                      setPlayerStateMap={setPlayerStateMap}
                    />
                  ) : (
                    <div className="text-sm text-gray-400">
                      Not generated yet
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
