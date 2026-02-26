import { Router } from "express";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.post("/chat", authMiddleware, (_req, res) => {
  res.status(501).json({
    error: "Chat route not integrated yet. Replace backend/src/routes/chat.ts with Person 1 version.",
  });
});

export default router;
