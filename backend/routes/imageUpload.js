import express from "express";
import multer from "multer";
import path from "path";
import { verifyToken } from "../middleware/verifyToken.js"; // Adjust path as needed

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/images/");
  },
  filename: (req, file, cb) => {
    cb(null, "background.jpg");
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

// ✅ Apply verifyToken here
router.post("/", verifyToken, upload.single("image"), (req, res) => {
  console.log(req.file);

  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded" });
  }

  return res.json({
    message: "Image uploaded successfully",
    imageUrl: `/images/background.jpg`,
  });
});

export default router;
