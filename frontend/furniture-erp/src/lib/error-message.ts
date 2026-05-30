const HTTP_PREFIX_RE = /^HTTP\s+\d{3}(?:\s+[A-Za-z ]+)?:\s*/i;

function sentenceCase(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function ensureSentence(text: string): string {
  const trimmed = sentenceCase(text).replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function ensureTitle(text: string): string {
  return sentenceCase(text)
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "")
    .trim();
}

function stripHtmlToText(value: string): string {
  const trimmed = value.trim();
  if (!/<(!DOCTYPE|html|body|pre)\b/i.test(trimmed)) return trimmed;

  const preMatch = trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const source = preMatch?.[1] ?? trimmed;
  return source
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMeaningfulLine(text: string): string {
  const line = text.split(/\n|\\n|<br/i)[0]?.trim() ?? text.trim();
  return line.replace(/^Error:\s*/i, "").trim();
}

function cleanRawMessage(input: unknown): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof Error
        ? input.message
        : String(input);

  const withoutHtml = stripHtmlToText(raw);

  return firstMeaningfulLine(withoutHtml)
    .replace(/^ApiError:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(HTTP_PREFIX_RE, "")
    .trim();
}

function jsonMessages(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object") {
            const message = (entry as { message?: unknown }).message;
            return typeof message === "string" ? message : "";
          }
          return "";
        })
        .filter(Boolean);
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as { error?: unknown; message?: unknown; detail?: unknown };
      return [record.error, record.message, record.detail].filter(
        (value): value is string => typeof value === "string" && value.trim() !== "",
      );
    }
  } catch {
    // Not JSON; fall through to plain text formatting.
  }
  return [];
}

function friendlyKnownMessage(text: string): string | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "error") return "Something went wrong.";
  if (normalized === "failed") return "The action could not be completed.";
  if (normalized === "select a branch") return "Select a branch before continuing.";
  if (normalized === "invalid category") return "Select a valid category.";
  if (normalized === "enter a name") return "Enter a name before continuing.";
  if (normalized === "calculate first") return "Calculate the result first.";
  if (normalized === "choose an image file") return "Please choose an image file.";
  if (normalized === "please upload an image file") return "Please upload an image file.";
  if (normalized.includes("only image")) return "Only image files can be uploaded.";
  if (normalized === "image file is too large.") return "Image file is too large.";
  if (normalized === "image file is required (field name: image)") return "Please choose an image file.";
  if (normalized === "avatar file is required") return "Please choose an avatar image.";
  if (normalized === "failed to upload image") return "Could not upload the image. Please try again.";
  if (normalized === "server did not return an image url") return "Upload did not complete. Please try again.";
  if (normalized === "upload did not complete. please try again.") return "Upload did not complete. Please try again.";
  if (normalized === "internal server error") return "Something went wrong. Please try again.";
  if (normalized.includes("image too large")) return text.trim().endsWith(".") ? text.trim() : `${text.trim()}.`;
  if (normalized === "select start and end dates") return "Select both start and end dates.";
  if (normalized === "unauthorized") return "Please sign in again.";
  if (normalized === "forbidden") return "You do not have permission to perform this action.";
  if (normalized === "insufficient stock") return "There is not enough stock available.";
  if (normalized === "sku already exists") return "This SKU already exists. Use a different SKU.";
  if (normalized === "product not found") return "Product not found. Refresh and try again.";
  if (normalized === "purchase order not found") return "Purchase order not found. Refresh and try again.";
  if (normalized === "follow-up date cannot be in the past") return "Follow-up date cannot be in the past. Choose today or a future date.";

  return null;
}

export function formatErrorMessage(input: unknown, fallback = "Please try again."): string {
  if (input == null || input === "") return fallback;

  const raw = cleanRawMessage(input);

  const fromJson = jsonMessages(raw);
  if (fromJson.length > 0) {
    return fromJson.map((message) => formatErrorMessage(message, fallback)).join(" ");
  }

  return friendlyKnownMessage(raw) ?? ensureSentence(raw || fallback);
}

export function formatErrorTitle(input: unknown, fallback = "Action needed"): string {
  if (input == null || input === "") return fallback;
  const raw = cleanRawMessage(input);
  const friendly = friendlyKnownMessage(raw);
  if (friendly) return ensureTitle(friendly);
  return ensureTitle(raw || fallback) || fallback;
}
