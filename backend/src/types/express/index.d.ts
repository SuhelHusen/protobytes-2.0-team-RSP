export {};

declare global {
  namespace Express {
    interface UserTokenPayload {
      id: string;
      email: string;
      stream: "SEE" | "PLUS2_SCIENCE" | "PLUS2_MANAGEMENT";
    }

    interface Request {
      user?: UserTokenPayload;
    }
  }
}
