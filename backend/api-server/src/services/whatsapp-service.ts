import { logger } from "../lib/logger";
import type { WhatsAppTemplateMessage } from "../lib/whatsapp-templates";

const waLog = logger.child({ ns: "whatsapp" });

function whatsAppEnabled(): boolean {
  const flag = process.env["WHATSAPP_ENABLED"]?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  return Boolean(
    process.env["WHATSAPP_ACCESS_TOKEN"]?.trim() &&
      process.env["WHATSAPP_PHONE_NUMBER_ID"]?.trim(),
  );
}

function graphMessagesUrl(): string | null {
  const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"]?.trim();
  if (!phoneNumberId) return null;
  const version = process.env["WHATSAPP_API_VERSION"]?.trim() || "v21.0";
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
}

export async function sendWhatsAppTemplate(
  toE164: string,
  template: WhatsAppTemplateMessage,
): Promise<{ ok: boolean; error?: string }> {
  if (!whatsAppEnabled()) {
    waLog.debug({ to: toE164, template: template.name }, "WhatsApp disabled or not configured");
    return { ok: false, error: "disabled" };
  }

  const url = graphMessagesUrl();
  const token = process.env["WHATSAPP_ACCESS_TOKEN"]?.trim();
  if (!url || !token) {
    return { ok: false, error: "not_configured" };
  }

  const body = {
    messaging_product: "whatsapp",
    to: toE164,
    type: "template",
    template,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number };
    };

    if (!res.ok) {
      const msg = data.error?.message ?? res.statusText;
      waLog.warn({ to: toE164, template: template.name, status: res.status, err: data.error }, msg);
      return { ok: false, error: msg };
    }

    waLog.info({ to: toE164, template: template.name }, "WhatsApp template sent");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    waLog.error({ err, to: toE164, template: template.name }, "WhatsApp send failed");
    return { ok: false, error: msg };
  }
}

export async function sendWhatsAppTemplateToMany(
  phones: string[],
  template: WhatsAppTemplateMessage,
): Promise<void> {
  const unique = [...new Set(phones)];
  await Promise.all(
    unique.map(async (phone) => {
      await sendWhatsAppTemplate(phone, template);
    }),
  );
}
