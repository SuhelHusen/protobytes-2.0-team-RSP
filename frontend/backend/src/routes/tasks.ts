import { Router } from "express";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.get("/tasks", authMiddleware, (_req, res) => {
  res.status(501).json({
    error: "Tasks route not integrated yet. Replace backend/src/routes/tasks.ts with Person 2 version.",
  });
});

router.post("/tasks", authMiddleware, (_req, res) => {
  res.status(501).json({
    error: "Tasks route not integrated yet. Replace backend/src/routes/tasks.ts with Person 2 version.",
  });
});

router.get("/tasks/stats", authMiddleware, (_req, res) => {
  res.status(501).json({
    error: "Task stats route not integrated yet. Replace backend/src/routes/tasks.ts with Person 2 version.",
  });
});

export default router;
