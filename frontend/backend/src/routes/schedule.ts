import { Router } from "express";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.post("/schedule/generate", authMiddleware, (_req, res) => {
  res.status(501).json({
    error: "Schedule route not integrated yet. Replace backend/src/routes/schedule.ts with Person 2 version.",
  });
});

export default router;
