import express from "express";
import multer from "multer";
import path from "path";
import { verifyToken } from "../middleware/verifyToken.js"; // Adjust path as needed

const router = express.Router();

// Multer storage with dynamic filename
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/images/");
  },
  filename: (req, file, cb) => {
    // `type` query decides whether it's desktop or mobile
    const type =
      req.query.type === "mobile" ? "background-small.jpg" : "background.jpg";
    cb(null, type);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedExt = /jpeg|jpg|png/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;

    if (allowedExt.test(ext) && mime.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG and PNG images are allowed"));
    }
  },
});

// ✅ Apply verifyToken
router.post("/", verifyToken, upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded" });
  }

  const isMobile = req.query.type === "mobile";
  const fileName = isMobile ? "background-small.jpg" : "background.jpg";

  return res.json({
    message: "Image uploaded successfully",
    imageUrl: `/images/${fileName}`,
  });
});

export default router;
