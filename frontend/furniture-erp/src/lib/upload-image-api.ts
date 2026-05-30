import { getAuthToken } from "@/lib/auth-storage";
import { formatUploadErrorMessage } from "@/lib/upload-error-message";

type UploadImageResponse = { imageUrl: string };

function parseUploadResponse(raw: string): UploadImageResponse {
  try {
    const parsed = JSON.parse(raw) as UploadImageResponse;
    if (!parsed?.imageUrl?.trim()) {
      throw new Error("Upload did not complete. Please try again.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Upload did not complete")) throw error;
    throw new Error("Upload did not complete. Please try again.");
  }
}

async function parseUploadFailure(resp: Response, raw: string): Promise<never> {
  let detail = formatUploadErrorMessage(null);
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    detail = formatUploadErrorMessage(parsed.error || parsed.message || detail);
  } catch {
    if (raw.trim()) detail = formatUploadErrorMessage(raw);
  }
  if (resp.status === 404) {
    detail = "Upload service is unavailable. Restart the API server and try again.";
  }
  throw new Error(detail);
}

export async function uploadImageFile(
  endpoint: string,
  file: File,
  fieldName = "image",
  branchId?: number | null,
): Promise<UploadImageResponse> {
  const token = getAuthToken();
  const fd = new FormData();
  fd.append(fieldName, file);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (branchId != null && Number.isFinite(branchId)) headers["X-Branch-Id"] = String(branchId);

  const resp = await fetch(endpoint, { method: "POST", headers, body: fd });
  const raw = await resp.text();
  if (!resp.ok) await parseUploadFailure(resp, raw);
  return parseUploadResponse(raw);
}

export async function uploadOrderImage(
  file: File,
  branchId?: number | null,
): Promise<string> {
  const { imageUrl } = await uploadImageFile("/api/orders/upload-image", file, "image", branchId);
  return imageUrl;
}

export async function uploadComplaintImage(
  file: File,
  branchId?: number | null,
): Promise<{ imageUrl: string }> {
  return uploadImageFile("/api/complaints/upload-image", file, "image", branchId);
}
