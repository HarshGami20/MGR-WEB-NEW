/** E.164 digits for Meta WhatsApp Cloud API (no + prefix). */
export function normalizeWhatsAppPhone(mobile?: string | null): string | null {
  if (!mobile?.trim()) return null;
  const digits = mobile.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}
