import express from "express";
import multer from "multer";
import path from "path";
import { admin, bucket } from "../firebase.js";
import { parseBuffer } from "music-metadata";
import ffmpeg from "fluent-ffmpeg";
import stream from "stream";
import { promisify } from "util";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const bufferToStream = (buffer: Buffer) => {
  const readable = new stream.PassThrough();
  readable.end(buffer);
  return readable;
};
const ffmpegToBuffer = (inputBuffer: Buffer) =>
  new Promise() <
  Buffer >
  ((resolve, reject) => {
    const chunks: Buffer[] = [];
    ffmpeg(bufferToStream(inputBuffer))
      .toFormat("mp3")
      .audioBitrate(128)
      .on("error", (err) => reject(err))
      .on("data", (chunk) => chunks.push(chunk))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .pipe();
  });

router.post("/", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const rawTitle = (req.body.title || "").toString();
    const phoneNumber = req.body.phoneNumber || null;
    const voiceType = req.body.voiceType || null;

    // parse duration
    let finalDuration = 0;
    if (req.body?.duration) {
      const parsed = parseFloat(req.body.duration);
      if (!Number.isNaN(parsed) && parsed > 0) finalDuration = parsed;
    }
    if (finalDuration === 0) {
      try {
        const metadata = await parseBuffer(req.file.buffer, req.file.mimetype);
        finalDuration = metadata?.format?.duration ?? 0;
      } catch {}
    }

    // convert to MP3
    const mp3Buffer = await ffmpegToBuffer(req.file.buffer);

    // filename
    const safeBase = (rawTitle.trim() || "recording")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 50);
    const last4 = Date.now().toString().slice(-4);
    const fileName = `audio/${safeBase}${last4}.mp3`;
    const file = bucket.file(fileName);

    // save to Firebase Storage
    await file.save(mp3Buffer, {
      metadata: {
        contentType: "audio/mpeg",
        metadata: { duration: String(finalDuration) },
      },
      resumable: false,
    });
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // store record in Realtime DB
    const recordRef = await admin
      .database()
      .ref("records")
      .push({
        fileName: path.basename(fileName),
        url: publicUrl,
        title: safeBase,
        phone: phoneNumber,
        voiceType,
        uploadedAt: new Date().toISOString(),
        duration: Number(finalDuration),
      });

    res.json({
      url: publicUrl,
      recordId: recordRef.key,
      duration: finalDuration,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to upload audio" });
  }
});

export default router;
