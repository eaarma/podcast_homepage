// Only one voice left
export type VoiceType = "voice1";

export async function processAndCompress(
  inBlob: Blob,
  voice: VoiceType,
  opts: CompressOptions = {}
): Promise<{ blob: Blob; mimeType: string; duration: number }> {
  const { targetSampleRate = 22050, channels = 1 } = opts;

  // 1) decode incoming blob
  const abuf = await decodeBlobToAudioBuffer(inBlob);

  // 2) voice effect parameters
  let playbackRate = 1.0;
  const filters: { type: string; value?: number; gain?: number }[] = [];

  if (voice === "voice1") {
    playbackRate = 1.15; // subtle lift, less chipmunk
    filters.push({ type: "highshelf", value: 4000, gain: 3 }); // gentle brightness
    filters.push({ type: "lowshelf", value: 200, gain: 2 }); // warmth
  }

  // 3) offline rendering setup
  const outSamples = Math.ceil(
    (abuf.length / playbackRate) * (targetSampleRate / abuf.sampleRate)
  );
  const offline = new OfflineAudioContext(
    channels,
    outSamples,
    targetSampleRate
  );

  // 4) prepare buffer (mono/stereo handling)
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

  // 5) apply filters
  let nodeChain: AudioNode = src;
  for (const f of filters) {
    const bq = offline.createBiquadFilter();
    bq.type = f.type as BiquadFilterType;
    if (f.value) bq.frequency.value = f.value;
    if (typeof f.gain === "number") bq.gain.value = f.gain;
    nodeChain.connect(bq);
    nodeChain = bq;
  }

  nodeChain.connect(offline.destination);

  // 6) render
  src.start();
  const rendered = await offline.startRendering();

  // 7) output as WAV
  const wavBlob = audioBufferToWavBlob(rendered);

  try {
    offline.close();
  } catch {}

  return {
    blob: wavBlob,
    mimeType: "audio/wav",
    duration: rendered.duration,
  };
}

/** Blob → AudioBuffer */
async function decodeBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  try {
    ctx.close();
  } catch {}
  return decoded;
}

/** AudioBuffer → WAV Blob */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;

  // interleave
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

  // WAV header
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

  // PCM samples
  let offset = 44;
  for (let i = 0; i < interleaved.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });
}
