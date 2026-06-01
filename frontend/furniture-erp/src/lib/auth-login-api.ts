import { customFetch } from "@/api-client/custom-fetch";
import type { AuthResponse } from "@/api-client/generated/api.schemas";

export type LoginOtpRequiredResponse = {
  otpRequired: true;
  sessionId: string;
  expiresInSeconds: number;
  maskedMobile: string;
};

export type WebLoginResponse = AuthResponse | LoginOtpRequiredResponse;

export function isLoginOtpRequired(data: WebLoginResponse): data is LoginOtpRequiredResponse {
  return "otpRequired" in data && data.otpRequired === true;
}

export async function webLogin(mobile: string, password: string): Promise<WebLoginResponse> {
  return customFetch<WebLoginResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile, password, client: "web" }),
  });
}

export async function verifyLoginOtp(sessionId: string, otp: string): Promise<AuthResponse> {
  return customFetch<AuthResponse>("/api/auth/login/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, otp }),
  });
}

export async function resendLoginOtp(sessionId: string): Promise<{
  success: boolean;
  expiresInSeconds: number;
  maskedMobile: string;
}> {
  return customFetch("/api/auth/login/resend-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}
