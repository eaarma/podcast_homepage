import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import Ajv from "ajv";
import { siteContentSchema } from "../schemas/siteContentSchema.js";
import { rtdb } from "../firebase.js";

const router = express.Router();
const ajv = new Ajv();
const validateFull = ajv.compile(siteContentSchema);

// ✅ GET /api/content
router.get("/", async (req, res) => {
  try {
    const snapshot = await rtdb.ref("siteContent").once("value");
    const content = snapshot.val();
    if (!content) return res.json({});
    res.json(content);
  } catch (error) {
    console.error("GET content error:", error);
    res.status(500).json({ message: "Failed to fetch content." });
  }
});

// ✅ POST /api/content (replace full content)
router.post("/", verifyToken, async (req, res) => {
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
    await rtdb.ref("siteContent").set(newContent);
    res.json({ message: "Content replaced successfully" });
  } catch (error) {
    console.error("POST content error:", error);
    res.status(500).json({ message: "Failed to update content." });
  }
});

// ✅ PUT /api/content (merge/partial update)
router.put("/", verifyToken, async (req, res) => {
  const updates = req.body;

  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ message: "Invalid update data" });
  }

  try {
    const snapshot = await rtdb.ref("siteContent").once("value");
    const existingData = snapshot.val() || {};
    const mergedData = deepMerge(existingData, updates);

    if (!validateFull(mergedData)) {
      return res.status(400).json({
        message: "Resulting data structure invalid",
        errors: validateFull.errors,
      });
    }

    await rtdb.ref("siteContent").set(mergedData);
    res.json({ message: "Content updated successfully", updated: mergedData });
  } catch (error) {
    console.error("PUT content error:", error);
    res.status(500).json({ message: "Failed to update content." });
  }
});

// 🔧 Deep merge helper
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
