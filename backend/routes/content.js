import express from "express";
import fs from "fs";
import path from "path";
import { verifyToken } from "../middleware/verifyToken.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import Ajv from "ajv";
import { siteContentSchema } from "../schemas/siteContentSchema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();
const dataPath = path.join(__dirname, "../data/siteContent.json");

const ajv = new Ajv();

// GET /api/content - get current content
router.get("/", (req, res) => {
  try {
    const rawData = fs.readFileSync(dataPath, "utf8");
    const content = JSON.parse(rawData);
    res.json(content);
  } catch (error) {
    res.status(500).json({ message: "Failed to read content." });
  }
});

const validateFull = ajv.compile(siteContentSchema);

// POST
router.post("/", verifyToken, (req, res) => {
  const newContent = req.body;

  if (!newContent || typeof newContent !== "object") {
    return res.status(400).json({ message: "No content provided" });
  }

  if (!validateFull(newContent)) {
    return res.status(400).json({
      message: "Invalid content format",
      errors: validateFull.errors,
    });
  }

  try {
    fs.writeFileSync(dataPath, JSON.stringify(newContent, null, 2));
    res.json({ message: "Content replaced successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update content." });
  }
});

// PUT
router.put("/", verifyToken, (req, res) => {
  const updates = req.body;

  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ message: "Invalid update data" });
  }

  try {
    const existingData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    const mergedData = deepMerge(existingData, updates);

    if (!validateFull(mergedData)) {
      return res.status(400).json({
        message: "Resulting data structure invalid",
        errors: validateFull.errors,
      });
    }

    fs.writeFileSync(dataPath, JSON.stringify(mergedData, null, 2));
    res.json({ message: "Content updated successfully", updated: mergedData });
  } catch (error) {
    res.status(500).json({ message: "Failed to update content." });
  }
});

// Deep merge helper
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export default router;
