import { ApiError } from "@/api-client/custom-fetch";
import { formatErrorMessage } from "@/lib/error-message";

const UPLOAD_FALLBACK = "Could not upload the image. Please try again.";

function messageFromApiError(error: ApiError<unknown>): string | null {
  const data = error.data;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    for (const key of ["error", "message", "detail"] as const) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  if (error.message.trim()) return error.message.trim();
  return null;
}

export function formatUploadErrorMessage(
  input: unknown,
  fallback = UPLOAD_FALLBACK,
): string {
  if (input instanceof ApiError) {
    const fromApi = messageFromApiError(input);
    if (fromApi) return formatErrorMessage(fromApi, fallback);
  }

  return formatErrorMessage(input, fallback);
}

export function validateImageFile(file: File, maxMb: number): string | null {
  if (!file.type.startsWith("image/")) return "Please choose an image file.";
  if (file.size > maxMb * 1024 * 1024) return `Image is too large (max ${maxMb} MB).`;
  return null;
}
