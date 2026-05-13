import rateLimit from "express-rate-limit";

/** Protects notification REST endpoints from abuse (token registration, list polling). */
export const notificationRestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

export const notificationMutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
