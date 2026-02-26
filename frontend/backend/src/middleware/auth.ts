import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

export type StreamType = "SEE" | "PLUS2_SCIENCE" | "PLUS2_MANAGEMENT";

export type UserTokenPayload = {
  id: string;
  email: string;
  stream: StreamType;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: UserTokenPayload;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.split(" ")[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({ error: "JWT secret is not configured" });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload & UserTokenPayload;

    if (!decoded.id || !decoded.email || !decoded.stream) {
      res.status(401).json({ error: "Invalid token payload" });
      return;
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      stream: decoded.stream,
    };

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
