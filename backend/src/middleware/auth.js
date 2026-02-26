// backend/src/middleware/auth.js
export const authMiddleware = (req, res, next) => {
  // For testing, we will hardcode a user ID
  req.user = {
    id: '11111111-1111-1111-1111-111111111111', // replace with your test user UUID
    stream: 'PLUS2_SCIENCE', // SEE / PLUS2_SCIENCE / PLUS2_MANAGEMENT
  };
  next();
};
