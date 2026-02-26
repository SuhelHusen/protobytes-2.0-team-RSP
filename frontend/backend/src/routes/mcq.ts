import { Router } from "express";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.post("/generate-mcq", authMiddleware, (_req, res) => {
  res.status(501).json({
    error: "MCQ route not integrated yet. Replace backend/src/routes/mcq.ts with Person 1 version.",
  });
});

export default router;
