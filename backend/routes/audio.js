import express from "express";
import { bucket, admin } from "../firebase.js";
import { verifyToken } from "../middleware/verifyToken.js"; // adjust path if needed

const router = express.Router();

/**
 * GET /audio/files
 * Returns the list of audio records stored in Realtime DB.
 * Each item contains: id (recordId), name (fileName), url, title, phone, voiceType, uploadedAt, duration
 */
router.get("/files", verifyToken, async (req, res) => {
  try {
    const snap = await admin.database().ref("records").once("value");
    const data = snap.val() || {};

    // convert to array and normalize shape
    const results = Object.entries(data).map(([id, rec]) => {
      const r = rec || {};
      return {
        id,
        name: r.fileName || null,
        url: r.url || null,
        title: r.title || null,
        phone: r.phone || null,
        voiceType: r.voiceType || null,
        uploadedAt: r.uploadedAt || null,
        // ensure duration is a number (if missing, fallback to 0)
        duration:
          typeof r.duration === "number" && isFinite(r.duration)
            ? r.duration
            : Number.parseFloat(r.duration) || 0,
      };
    });

    // optional: sort newest first by uploadedAt if available
    results.sort((a, b) => {
      const ta = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
      const tb = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
      return tb - ta;
    });

    res.json(results);
  } catch (err) {
    console.error("Error listing audio files:", err);
    res.status(500).json({ message: "Failed to retrieve audio files" });
  }
});

/**
 * DELETE /audio/files/:filename
 * Finds DB record(s) by fileName and removes storage + DB entry
 */
router.delete("/files/:filename", verifyToken, async (req, res) => {
  const { filename } = req.params;
  if (!filename) {
    return res.status(400).json({ message: "Filename is required." });
  }

  try {
    // find matching records in DB
    const q = await admin
      .database()
      .ref("records")
      .orderByChild("fileName")
      .equalTo(filename)
      .once("value");

    if (!q.exists()) {
      // If not found in DB, still attempt to delete storage file (best-effort)
      const file = bucket.file(`audio/${filename}`);
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
        return res.json({
          message: `File "${filename}" deleted from storage (no DB record).`,
        });
      }
      return res.status(404).json({ message: "File not found." });
    }

    const val = q.val();
    const keys = Object.keys(val);

    // delete storage file(s) and DB entry(ies)
    await Promise.all(
      keys.map(async (k) => {
        const rec = val[k] || {};
        const filePath = `audio/${rec.fileName}`;
        try {
          await bucket.file(filePath).delete();
        } catch (e) {
          console.warn("Failed to delete storage file:", filePath, e);
        }
        await admin.database().ref(`records/${k}`).remove();
      })
    );

    res.json({
      message: `Deleted ${keys.length} record(s) and storage file(s).`,
    });
  } catch (err) {
    console.error(`Error deleting file "${filename}":`, err);
    res.status(500).json({ message: "Failed to delete file." });
  }
});

/**
 * GET /audio/download/:filename
 * Streams the storage file back.
 */
router.get("/download/:filename", verifyToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const file = bucket.file(`audio/${filename}`);

    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ message: "File not found" });

    // Optional: set content-type by reading file metadata
    const [meta] = await file.getMetadata();
    const contentType = meta?.contentType || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    file.createReadStream().pipe(res);
  } catch (err) {
    console.error("Download failed:", err);
    res.status(500).json({ message: "Download failed" });
  }
});

export default router;
