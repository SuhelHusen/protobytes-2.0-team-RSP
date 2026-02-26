import { NextFunction, Request, Response } from "express";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  const shouldHideMessage = process.env.NODE_ENV === "production";

  res.status(500).json({
    error: shouldHideMessage ? "Internal server error" : message,
  });
}
