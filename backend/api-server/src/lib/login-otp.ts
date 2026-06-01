import crypto from "node:crypto";
import { comparePassword, hashPassword } from "./auth";

type OtpSession = {
  userId: number;
  mobile: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
};

const sessions = new Map<string, OtpSession>();

function otpTtlSeconds(): number {
  const raw = Number(process.env["AUTH_OTP_TTL_SECONDS"]);
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

function maxVerifyAttempts(): number {
  const raw = Number(process.env["AUTH_OTP_MAX_ATTEMPTS"]);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

function resendCooldownMs(): number {
  const raw = Number(process.env["AUTH_OTP_RESEND_COOLDOWN_SECONDS"]);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 60;
  return seconds * 1000;
}

function purgeExpiredSessions(): void {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(sessionId);
  }
}

export function isWebLoginOtpEnabled(): boolean {
  const flag = process.env["AUTH_WEB_OTP_ENABLED"]?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return true;
}

export function generateOtpSessionId(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function generateOtpCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `${digits.slice(0, 2)}****${digits.slice(-2)}`;
}

export async function createLoginOtpSession(
  userId: number,
  mobile: string,
): Promise<{ sessionId: string; code: string; expiresInSeconds: number }> {
  purgeExpiredSessions();
  const code = generateOtpCode();
  const sessionId = generateOtpSessionId();
  const otpHash = await hashPassword(code);
  const ttl = otpTtlSeconds();
  sessions.set(sessionId, {
    userId,
    mobile,
    otpHash,
    expiresAt: Date.now() + ttl * 1000,
    attempts: 0,
    lastSentAt: Date.now(),
  });
  return { sessionId, code, expiresInSeconds: ttl };
}

export function getLoginOtpSessionUser(
  sessionId: string,
): { userId: number; mobile: string } | null {
  purgeExpiredSessions();
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(sessionId);
    return null;
  }
  return { userId: session.userId, mobile: session.mobile };
}

export async function refreshLoginOtpSession(
  sessionId: string,
): Promise<
  | { ok: true; code: string; expiresInSeconds: number; retryAfterSeconds?: number }
  | { ok: false; error: string; retryAfterSeconds?: number }
> {
  purgeExpiredSessions();
  const session = sessions.get(sessionId);
  if (!session) return { ok: false, error: "Session expired. Please sign in again." };

  const now = Date.now();
  const elapsed = now - session.lastSentAt;
  const cooldown = resendCooldownMs();
  if (elapsed < cooldown) {
    const retryAfterSeconds = Math.ceil((cooldown - elapsed) / 1000);
    return {
      ok: false,
      error: `Please wait ${retryAfterSeconds}s before requesting a new code.`,
      retryAfterSeconds,
    };
  }

  const code = generateOtpCode();
  session.otpHash = await hashPassword(code);
  session.attempts = 0;
  session.lastSentAt = now;
  session.expiresAt = now + otpTtlSeconds() * 1000;

  return { ok: true, code, expiresInSeconds: otpTtlSeconds() };
}

export async function verifyLoginOtp(
  sessionId: string,
  code: string,
): Promise<{ ok: true; userId: number } | { ok: false; error: string }> {
  purgeExpiredSessions();
  const session = sessions.get(sessionId);
  if (!session) return { ok: false, error: "Session expired. Please sign in again." };
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return { ok: false, error: "Verification code expired. Please sign in again." };
  }

  session.attempts += 1;
  if (session.attempts > maxVerifyAttempts()) {
    sessions.delete(sessionId);
    return { ok: false, error: "Too many attempts. Please sign in again." };
  }

  const match = await comparePassword(code, session.otpHash);
  if (!match) {
    const remaining = Math.max(0, maxVerifyAttempts() - session.attempts);
    if (remaining === 0) {
      sessions.delete(sessionId);
      return { ok: false, error: "Too many attempts. Please sign in again." };
    }
    return {
      ok: false,
      error: remaining === 1 ? "Invalid code. One attempt left." : `Invalid code. ${remaining} attempts left.`,
    };
  }

  sessions.delete(sessionId);
  return { ok: true, userId: session.userId };
}
