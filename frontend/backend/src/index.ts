import fs from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { testConnection } from "./db/connection";
import { errorHandler, notFoundHandler } from "./middleware/error";
import authRoutes from "./routes/auth";
import chatRoutes from "./routes/chat";
import healthRoutes from "./routes/health";
import mcqRoutes from "./routes/mcq";
import scheduleRoutes from "./routes/schedule";
import tasksRoutes from "./routes/tasks";
import uploadRoutes from "./routes/upload";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
const uploadPath = path.resolve(__dirname, "../uploads");

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadPath));

app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", uploadRoutes);
app.use("/api", chatRoutes);
app.use("/api", mcqRoutes);
app.use("/api", tasksRoutes);
app.use("/api", scheduleRoutes);

// Replace placeholder route files with teammate implementations as they arrive.

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer(): Promise<void> {
  await testConnection();
  app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
  });
}

startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  console.error(`Failed to start server: ${message}`);
  process.exit(1);
});

export default app;
