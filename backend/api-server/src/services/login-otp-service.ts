import { logger } from "../lib/logger";
import { maskMobile } from "../lib/login-otp";
import { normalizeWhatsAppPhone } from "../lib/whatsapp-phone";
import { templateLoginOtp } from "../lib/whatsapp-templates";
import { sendWhatsAppTemplate } from "./whatsapp-service";

const otpLog = logger.child({ ns: "auth", layer: "login-otp" });

/** Log OTP to terminal (dev). Set `AUTH_OTP_LOG_CONSOLE=false` to disable in production. */
function logOtpToConsole(mobile: string, otp: string): void {
  const flag = process.env["AUTH_OTP_LOG_CONSOLE"]?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return;
  if (flag !== "1" && flag !== "true" && flag !== "yes" && process.env.NODE_ENV === "production") {
    return;
  }
  console.log(`[login-otp] code=${otp} mobile=${maskMobile(mobile)}`);
}

function devModeTestPhone(): string | null {
  const raw = process.env["WHATSAPP_DEV_PHONE"]?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 10) return digits;
  return null;
}

function isDevMode(): boolean {
  const v = process.env["DEV_MODE"]?.trim().toLowerCase();
  return v === "true" || v === "1";
}

function resolveDestinationPhone(mobile: string): string | null {
  if (isDevMode()) {
    const devPhone = devModeTestPhone();
    if (devPhone) return devPhone;
  }
  return normalizeWhatsAppPhone(mobile);
}

export async function sendLoginOtpWhatsApp(input: {
  mobile: string;
  recipientName: string;
  otpCode: string;
}): Promise<{ ok: boolean; error?: string }> {
  logOtpToConsole(input.mobile, input.otpCode);
  otpLog.info({ mobile: maskMobile(input.mobile), otp: input.otpCode }, "Login OTP generated");

  const phone = resolveDestinationPhone(input.mobile);
  if (!phone) {
    return { ok: false, error: "invalid_phone" };
  }

  const template = templateLoginOtp({ otpCode: input.otpCode });

  const result = await sendWhatsAppTemplate(phone, template);
  if (!result.ok && result.error === "disabled") {
    otpLog.warn(
      { mobile: input.mobile, otp: input.otpCode },
      "WhatsApp disabled — OTP logged for local development",
    );
    return { ok: true };
  }

  if (!result.ok) {
    otpLog.warn({ mobile: input.mobile, err: result.error }, "Failed to send login OTP via WhatsApp");
    return { ok: false, error: result.error ?? "send_failed" };
  }

  if (isDevMode() && devModeTestPhone()) {
    otpLog.info(
      { devPhone: devModeTestPhone(), otp: input.otpCode },
      "Login OTP sent to DEV_MODE test phone",
    );
  }

  return { ok: true };
}
