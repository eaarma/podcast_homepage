import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Fix __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
const corsOptions = {
  origin: [
    "http://localhost:5173", // for local dev
    "https://podcast-homepage.vercel.app", // deployed frontend
    "https://www.kirsstordil.com",
    "https://kirsstordil.com",
  ],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Serve images statically
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

app.get("/audio/download/:filename", (req, res) => {
  const file = path.join(__dirname, "your-audio-folder", req.params.filename);
  res.download(file); // This sets Content-Disposition header!
});

//testing
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
});
// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
