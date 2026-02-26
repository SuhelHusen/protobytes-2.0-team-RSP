import "dotenv/config";
import express from "express";
import pkg from "pg";
const { Pool } = pkg;
import tasksRouter from "./src/routes/tasks.js";
import scheduleRouter from "./src/routes/schedule.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Make pool available to routes
app.locals.pool = pool;

// CORS - MUST be before routes
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Body parser
app.use(express.json());

// Routes
app.use("/api/tasks", tasksRouter);
app.use("/api/schedule", scheduleRouter);

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "AI Study Planner API" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ 
    error: err.message || "Internal server error",
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});