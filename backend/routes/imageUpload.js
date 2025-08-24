import express from "express";
import multer from "multer";
import { verifyToken } from "../middleware/verifyToken.js";
import admin from "firebase-admin";

const router = express.Router();
const bucket = admin.storage().bucket();

// Use memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedExt = /jpeg|jpg|png/;
    const mime = file.mimetype;
    if (
      allowedExt.test(file.originalname.toLowerCase()) &&
      mime.startsWith("image/")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG and PNG images are allowed"));
    }
  },
});

router.post("/", verifyToken, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const isMobile = req.query.type === "mobile";
    const fileName = isMobile ? "background-small.jpg" : "background.jpg";
    const destination = `site-images/${fileName}`;

    const file = bucket.file(destination);

    // Save to Firebase Storage
    await file.save(req.file.buffer, {
      contentType: req.file.mimetype,
      metadata: { cacheControl: "public, max-age=31536000" },
    });

    // Generate signed URL (valid for e.g. 1 year)
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    });

    return res.json({
      message: "Image uploaded successfully",
      imageUrl: signedUrl,
    });
  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).json({ error: "Image upload failed" });
  }
});

export default router;
