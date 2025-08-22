// Client-side audio processing -> compressed blob using MediaRecorder (Opus/WebM).
// No external libs required.

export type VoiceType = "voice1" | "voice2";

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
    audioBitsPerSecond = 64000, // unused now
  } = opts;

  // 1) decode incoming blob to AudioBuffer
  const abuf = await decodeBlobToAudioBuffer(inBlob);

  // 2) pick effect parameters per voice
  let playbackRate = 1.0;
  const filters: { type: string; value?: number; gain?: number }[] = [];

  switch (voice) {
    case "voice1":
      playbackRate = 1.35;
      filters.push({ type: "highshelf", value: 3000, gain: 6 });
      break;
    case "voice2":
      playbackRate = 0.9;
      filters.push({ type: "lowpass", value: 3500 });
      break;
  }

  // 3) build OfflineAudioContext
  const outSamples = Math.ceil(
    (abuf.length / playbackRate) * (targetSampleRate / abuf.sampleRate)
  );
  const offline = new OfflineAudioContext(
    channels,
    outSamples,
    targetSampleRate
  );

  // 4) create source buffer and downmix/upmix
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
    for (let ch = 0; ch < channels; ch++) {
      const out = srcBuffer.getChannelData(ch);
      const inCh = Math.min(ch, abuf.numberOfChannels - 1);
      out.set(abuf.getChannelData(inCh));
    }
  }

  const src = offline.createBufferSource();
  src.buffer = srcBuffer;
  src.playbackRate.value = playbackRate;

  // 5) apply filter chain
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

  nodeChain.connect(offline.destination);

  // 6) render audio
  src.start();
  const rendered = await offline.startRendering();

  // 7) convert rendered AudioBuffer to WAV blob
  const wavBlob = audioBufferToWavBlob(rendered);

  try {
    offline.close();
  } catch (_) {}

  return {
    blob: wavBlob,
    mimeType: "audio/wav",
    duration: rendered.duration,
  };
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

  return new Blob([view], { type: "audio/webm" });
}
