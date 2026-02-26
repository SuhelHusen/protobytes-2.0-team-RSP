import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import pool from "../db/connection";
import { authMiddleware, UserTokenPayload } from "../middleware/auth";

const router = Router();

const VALID_STREAMS = ["SEE", "PLUS2_SCIENCE", "PLUS2_MANAGEMENT"] as const;
type StreamType = (typeof VALID_STREAMS)[number];

function isValidStream(stream: string): stream is StreamType {
  return VALID_STREAMS.includes(stream as StreamType);
}

function createToken(payload: UserTokenPayload): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing");
  }

  const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as SignOptions["expiresIn"];

  return jwt.sign(payload, secret, {
    expiresIn,
  });
}

router.post("/auth/signup", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const stream = String(req.body.stream || "");

    if (!name || !email || !password || !stream) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    if (!isValidStream(stream)) {
      res.status(400).json({ error: "Invalid stream" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const created = await pool.query(
      `INSERT INTO users (name, email, password, stream)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, stream, created_at`,
      [name, email, hashedPassword, stream]
    );

    const user = created.rows[0];
    const token = createToken({
      id: user.id,
      email: user.email,
      stream: user.stream,
    });

    res.status(201).json({
      user,
      token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create account";
    res.status(500).json({ error: message });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const found = await pool.query(
      "SELECT id, name, email, stream, password, created_at FROM users WHERE email = $1",
      [email]
    );

    if (found.rows.length === 0) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const user = found.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = createToken({
      id: user.id,
      email: user.email,
      stream: user.stream,
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        stream: user.stream,
        created_at: user.created_at,
      },
      token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    res.status(500).json({ error: message });
  }
});

router.get("/auth/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const found = await pool.query(
      "SELECT id, name, email, stream, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (found.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user: found.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch user";
    res.status(500).json({ error: message });
  }
});

export default router;
