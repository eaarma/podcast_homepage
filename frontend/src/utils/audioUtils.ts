// Client-side audio processing -> compressed blob using MediaRecorder (Opus/WebM).
// No external libs required.

export type VoiceType = "voice1" | "voice2" | "voice3" | "voice4";

export interface CompressOptions {
  targetSampleRate?: number; // e.g. 22050
  channels?: number; // 1 = mono, 2 = stereo
  audioBitsPerSecond?: number; // e.g. 64000
}

/**
 * processAndCompress:
 * - decodes input blob into an AudioBuffer
 * - applies simple effect chain (playbackRate + filters) in OfflineAudioContext
 * - renders an AudioBuffer at targetSampleRate / channels
 * - plays the rendered buffer into a MediaStreamDestination
 * - records the destination with MediaRecorder using Opus/WebM (if supported)
 *
 * Returns: { blob, mimeType, duration } where duration is seconds (float)
 */
export async function processAndCompress(
  inBlob: Blob,
  voice: VoiceType,
  opts: CompressOptions = {}
): Promise<{ blob: Blob; mimeType: string; duration: number }> {
  const {
    targetSampleRate = 22050,
    channels = 1,
    audioBitsPerSecond = 64000,
  } = opts;

  // 1) decode incoming blob to AudioBuffer
  const abuf = await decodeBlobToAudioBuffer(inBlob);

  // 2) pick effect parameters per voice
  let playbackRate = 1.0;
  const filters: { type: string; value?: number; gain?: number }[] = [];
  let extraProcess: "delay" | "none" = "none";

  switch (voice) {
    case "voice1":
      playbackRate = 1.35;
      filters.push({ type: "highshelf", value: 3000, gain: 6 });
      break;
    case "voice2":
      playbackRate = 0.9;
      filters.push({ type: "lowpass", value: 3500 });
      break;
    case "voice3":
      playbackRate = 1.05;
      filters.push({ type: "highpass", value: 300 });
      filters.push({ type: "lowpass", value: 3000 });
      break;
    case "voice4":
      playbackRate = 0.95;
      filters.push({ type: "lowpass", value: 5000 });
      extraProcess = "delay";
      break;
  }

  // 3) build OfflineAudioContext with targetSampleRate and channel count
  // estimate length (samples) after playbackRate adjustment
  const outSamples = Math.ceil(
    (abuf.length / playbackRate) * (targetSampleRate / abuf.sampleRate)
  );
  const offline = new OfflineAudioContext(
    channels,
    outSamples,
    targetSampleRate
  );

  // 4) create source buffer: downmix to `channels` if needed
  const srcBuffer = offline.createBuffer(
    channels,
    abuf.length,
    abuf.sampleRate
  );
  if (channels === 1) {
    const out = srcBuffer.getChannelData(0);
    for (let i = 0; i < abuf.length; i++) {
      let sum = 0;
      for (let ch = 0; ch < abuf.numberOfChannels; ch++) {
        sum += abuf.getChannelData(ch)[i] || 0;
      }
      out[i] = sum / abuf.numberOfChannels;
    }
  } else {
    // copy channels up to available channels (simple copy)
    for (let ch = 0; ch < channels; ch++) {
      const out = srcBuffer.getChannelData(ch);
      const inCh = Math.min(ch, abuf.numberOfChannels - 1);
      out.set(abuf.getChannelData(inCh));
    }
  }

  const src = offline.createBufferSource();
  src.buffer = srcBuffer;
  src.playbackRate.value = playbackRate;

  // 5) set up filters chain
  let nodeChain: AudioNode = src;
  for (const f of filters) {
    const bq = offline.createBiquadFilter();
    if (f.type === "highshelf") {
      bq.type = "highshelf";
      bq.frequency.value = f.value || 3000;
      if (typeof f.gain === "number") bq.gain.value = f.gain;
    } else if (f.type === "lowpass") {
      bq.type = "lowpass";
      bq.frequency.value = f.value || 3000;
    } else if (f.type === "highpass") {
      bq.type = "highpass";
      bq.frequency.value = f.value || 300;
    }
    nodeChain.connect(bq);
    nodeChain = bq;
  }

  // extra process (simple feedback delay)
  if (extraProcess === "delay") {
    const delay = offline.createDelay(1.0);
    delay.delayTime.value = 0.12;
    const fb = offline.createGain();
    fb.gain.value = 0.28;
    nodeChain.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    // also route dry signal
    const dryGain = offline.createGain();
    dryGain.gain.value = 0.9;
    nodeChain.connect(dryGain);
    dryGain.connect(offline.destination);
    delay.connect(offline.destination);
    src.start(0);
  } else {
    nodeChain.connect(offline.destination);
    src.start(0);
  }

  // 6) render offline
  const rendered = await offline.startRendering();
  // rendered.duration is available here

  // 7) convert rendered AudioBuffer into a MediaStream and record with MediaRecorder (Opus/WebM if supported)
  // Create a new AudioContext for playback at the same sampleRate as rendered
  const playCtx = new (window.AudioContext ||
    (window as any).webkitAudioContext)({ sampleRate: rendered.sampleRate });

  // create buffer source in playCtx
  const playSrc = playCtx.createBufferSource();
  playSrc.buffer = rendered;

  // create destination (MediaStream) and connect
  const dest = playCtx.createMediaStreamDestination();
  playSrc.connect(dest);

  // also route to silent destination so we don't play to speakers
  const gainNode = playCtx.createGain();
  gainNode.gain.value = 0;
  playSrc.connect(gainNode);
  gainNode.connect(playCtx.destination);

  // choose mimeType for MediaRecorder
  const candidateTypes = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
    "audio/ogg",
  ];
  let mimeType: string | null = null;
  for (const t of candidateTypes) {
    try {
      if (
        (MediaRecorder as any).isTypeSupported &&
        (MediaRecorder as any).isTypeSupported(t)
      ) {
        mimeType = t;
        break;
      }
    } catch (e) {
      // ignore
    }
  }

  // If no compressed mimeType supported, fallback to WAV blob
  if (!mimeType) {
    // create WAV fallback (rendered already present)
    const wavBlob = audioBufferToWavBlob(rendered);
    try {
      playCtx.close();
    } catch (_) {}
    try {
      offline.close();
    } catch (_) {}
    return {
      blob: wavBlob,
      mimeType: "audio/wav",
      duration: rendered.duration,
    };
  }

  const options: MediaRecorderOptions = {
    mimeType,
    // @ts-ignore - audioBitsPerSecond is supported in MediaRecorder options in many browsers
    audioBitsPerSecond: audioBitsPerSecond,
  };

  const recorder = new MediaRecorder(dest.stream, options);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const finishedPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const out = new Blob(chunks, { type: mimeType! });
      resolve(out);
    };
    recorder.onerror = (ev) => reject(ev);
  });

  // start recording + playback
  recorder.start();
  playSrc.start();

  // stop after rendered.duration (plus small buffer)
  const stopAfterMs = Math.ceil(rendered.duration * 1000) + 300;
  await new Promise((r) => setTimeout(r, stopAfterMs));

  try {
    playSrc.stop();
  } catch (e) {
    // ignore
  }
  recorder.stop();

  const outBlob = await finishedPromise;

  // cleanup
  try {
    playCtx.close();
  } catch (_) {}
  try {
    offline.close();
  } catch (_) {}

  return { blob: outBlob, mimeType: mimeType!, duration: rendered.duration };
}

/** Helper: decode Blob to AudioBuffer */
async function decodeBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  try {
    ctx.close();
  } catch (_) {}
  return decoded;
}

/** Helper: convert AudioBuffer -> WAV Blob (PCM16) fallback */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;

  // interleave channels
  let interleaved: Float32Array;
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    interleaved = new Float32Array(left.length + right.length);
    let idx = 0;
    for (let i = 0; i < left.length; i++) {
      interleaved[idx++] = left[i];
      interleaved[idx++] = right[i];
    }
  } else {
    interleaved = buffer.getChannelData(0);
  }

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const bufferLength = 44 + interleaved.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + interleaved.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, interleaved.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < interleaved.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });
}
