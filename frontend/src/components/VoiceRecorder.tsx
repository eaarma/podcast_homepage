import React, { useEffect, useRef, useState } from "react";
import CustomAudioPlayer from "./CustomAudioPlayer";
import { processAndCompress } from "../utils/audioUtils";
import type { VoiceType } from "../utils/audioUtils"; // type-only import
import RecorderButton from "./RecorderButton";

const VOICE_LIST: VoiceType[] = ["voice1", "voice2"]; // only two voices now
const VOICE_LABELS: Record<VoiceType, string> = {
  voice1: "Voice 1",
  voice2: "Voice 2",
};

export default function VoiceRecorder(): JSX.Element {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [title, setTitle] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

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

  // player state map for cross-player pause/volume sync
  type PlayerState = { playing: boolean; current: number; volume: number };
  const [playerStateMap, setPlayerStateMap] = useState<
    Record<string, PlayerState>
  >({});

  // start/stop recording
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
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setOriginalBlob(blob);
        const url = URL.createObjectURL(blob);
        setOriginalURL(url);

        // decode to extract duration quickly for original
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const Ctx = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new Ctx();
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          setOriginalDuration(decoded.duration || 0);
          ctx.close().catch(() => {});
        } catch (e) {
          console.warn("Could not decode original duration", e);
        }

        // process all voices
        await processAllVoices(blob);
      };

      mr.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(
        () => setRecordingTime((t) => t + 1),
        1000
      );

      setTimeout(() => {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "recording"
        )
          stopRecording();
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

  // process all voices and compute durations from the resulting blobs
  const processAllVoices = async (blob: Blob) => {
    setIsProcessing(true);
    setProcessingProgress(0);

    // cleanup previous processed objectURLs
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
        // tiny delay so UI can update
        await new Promise((r) => setTimeout(r, 30));

        const opts = {
          targetSampleRate: 22050,
          channels: 1,
          audioBitsPerSecond: 64000,
        };
        const res = await processAndCompress(blob, v, opts);

        // store blob & object URL
        setProcessedBlobs((prev) => ({ ...prev, [v]: res.blob }));
        const url = URL.createObjectURL(res.blob);
        setProcessedURLs((prev) => ({ ...prev, [v]: url }));

        // decode the processed blob to get correct duration (robust)
        try {
          const ab = await res.blob.arrayBuffer();
          const Ctx = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new Ctx();
          const decoded = await ctx.decodeAudioData(ab);
          const d = decoded.duration || 0;
          setProcessedDurations((prev) => ({ ...prev, [v]: d }));
          ctx.close().catch(() => {});
        } catch (e) {
          console.warn("Could not decode processed duration for", v, e);
          setProcessedDurations((prev) => ({ ...prev, [v]: 0 }));
        }
      } catch (err) {
        console.error("Processing failed for", v, err);
      } finally {
        setProcessingProgress(Math.round(((i + 1) / total) * 100));
      }
    }

    // brief pause so UI isn't jumpy
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
      const ext = mimeType.split("/")[1] || "webm";
      console.log(
        "original dur " +
          originalDuration +
          " and modified duration v1 " +
          processedDurations.voice1 +
          " processed dur v2 " +
          processedDurations.voice2
      );

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

  // cleanup memory and object URLs
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
    <section className="voice-recorder w-full max-w-lg mx-auto p-4 bg-gray-800 text-white rounded-lg">
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
              {/* Input fields */}
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
              <p className="text-xs text-gray-400 mb-4">
                *Kingituste loosimises osalemiseks jäta oma telefoninumber –
                seda näen vaid mina ja kasutan ainult võidu korral ühenduse
                võtmiseks.
              </p>

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
