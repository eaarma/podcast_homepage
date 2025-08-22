// routes/upload.js
import express from "express";
import multer from "multer";
import path from "path";
import { admin, bucket } from "../firebase.js";
import { parseBuffer } from "music-metadata";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/upload
 * form fields:
 *  - audio (file)
 *  - title (string, optional)
 *  - phoneNumber (string, optional)
 *  - voiceType (string, optional)
 *  - duration (string/number, optional) -- duration in seconds sent from client
 */
router.post("/", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const rawTitle = (req.body.title || "").toString();
    const phoneNumber = req.body.phoneNumber || null;
    const voiceType = req.body.voiceType || null;

    // try to read duration sent by client (FormData sends strings)
    let durationFromClient = NaN;
    if (req.body && typeof req.body.duration !== "undefined") {
      const parsed = parseFloat(req.body.duration);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed > 0) {
        durationFromClient = parsed;
      }
    }

    // fallback: parse buffer server-side if client didn't provide a valid duration
    let finalDuration = 0;
    if (Number.isFinite(durationFromClient) && durationFromClient > 0) {
      finalDuration = durationFromClient;
      console.log("Using duration provided by client:", finalDuration);
    } else {
      try {
        // parseBuffer accepts Buffer (multer.memoryStorage gives Buffer) and contentType
        const metadata = await parseBuffer(req.file.buffer, req.file.mimetype);
        const d = metadata?.format?.duration ?? 0;
        if (typeof d === "number" && isFinite(d) && d > 0) {
          finalDuration = d;
          console.log("Parsed duration from buffer (server):", finalDuration);
        } else {
          console.warn(
            "parseBuffer returned no valid duration, falling back to 0"
          );
        }
      } catch (err) {
        console.warn("Failed to parse audio metadata server-side:", err);
      }
    }

    // Build filename & save to storage
    // Build filename & save to storage
    const ext = path.extname(req.file.originalname) || ".mp3"; // build safe base from title

    const baseFromTitle = rawTitle.trim() || "recording";

    // sanitize: replace spaces with underscore, strip non-alphanum _ - characters, limit length
    const safeBase = baseFromTitle
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 50);

    // suffix: last 4 digits of Date.now() to match your requested format
    const timestamp = Date.now().toString();
    const last4 = timestamp.slice(-4);

    // final base and file name
    const finalBase = `${safeBase}${last4}`; // e.g. MyTitle1234
    const fileName = `audio/${finalBase}${ext}`;
    const file = bucket.file(fileName);

    // Save buffer directly to Cloud Storage. Add duration into Storage's custom metadata
    // (optional but convenient later)
    const storageMetadata = {
      contentType: req.file.mimetype,
      metadata: {
        // store as string
        duration: String(finalDuration ?? 0),
      },
    };

    await file.save(req.file.buffer, {
      metadata: storageMetadata,
      resumable: false,
    });

    // Make public (keep your existing behavior)
    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Persist record in Realtime DB including duration (as number)
    const recordRef = await admin
      .database()
      .ref("records")
      .push({
        fileName: path.basename(fileName),
        url: publicUrl,
        title: finalBase,
        phone: phoneNumber,
        voiceType,
        uploadedAt: new Date().toISOString(),
        duration: Number(finalDuration || 0),
      });

    // return duration in response so client can verify immediately
    res.json({
      url: publicUrl,
      recordId: recordRef.key,
      duration: Number(finalDuration || 0),
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to upload audio" });
  }
});

export default router;
