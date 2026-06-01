import { logger } from "../lib/logger";
import { normalizeWhatsAppPhone } from "../lib/whatsapp-phone";
import { templateLoginOtp } from "../lib/whatsapp-templates";
import { sendWhatsAppTemplate } from "./whatsapp-service";

const otpLog = logger.child({ ns: "auth", layer: "login-otp" });

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
