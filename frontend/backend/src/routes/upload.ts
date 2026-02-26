import path from "path";
import { Router } from "express";
import pool from "../db/connection";
import { authMiddleware } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();

router.post("/upload", authMiddleware, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "PDF file is required (field name: file)" });
      return;
    }

    const storedFilePath = `/uploads/${path.basename(req.file.filename)}`;
    let sourceId: string | null = null;

    try {
      const sourceInsert = await pool.query(
        `INSERT INTO sources (user_id, file_name, file_path, total_pages)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [req.user.id, req.file.originalname, storedFilePath, 0]
      );

      sourceId = sourceInsert.rows[0]?.id || null;
    } catch {
      // Keep request successful even if source insert fails. File is already saved.
    }

    res.status(201).json({
      message: "PDF uploaded successfully",
      sourceId,
      file: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        path: storedFilePath,
        size: req.file.size,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
