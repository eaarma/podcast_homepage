import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as Sentry from "@sentry/node";

// Load env vars FIRST
dotenv.config();

// Fix __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Sentry BEFORE app setup
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
});

const app = express();

// Sentry request handler (must be early)
app.use(Sentry.Handlers.requestHandler());

const PORT = process.env.PORT || 4000;

// Middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://podcast-homepage.vercel.app",
    "https://www.kirsstordil.com",
    "https://kirsstordil.com",
  ],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Static files
app.use("/images", express.static(path.join(__dirname, "public/images")));

// Routes
import authRoutes from "./routes/auth.js";
import contentRoutes from "./routes/content.js";
import uploadRoutes from "./routes/upload.js";
import imageUploadRoutes from "./routes/imageUpload.js";
import audioRoutes from "./routes/audio.js";

app.use("/api/auth", authRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/uploadimage", imageUploadRoutes);
app.use("/audio", audioRoutes);

// Example download route
app.get("/audio/download/:filename", (req, res) => {
  const file = path.join(__dirname, "your-audio-folder", req.params.filename);
  res.download(file);
});

// 🧨 Sentry error handler (MUST be after routes)
app.use(Sentry.Handlers.errorHandler());

// Fallback error handler
app.use((err, req, res, next) => {
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
