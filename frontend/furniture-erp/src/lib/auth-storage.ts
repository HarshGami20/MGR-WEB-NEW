export const AUTH_TOKEN_KEY = "erp_token";
export const REMEMBER_ME_KEY = "erp_remember_me";
export const REMEMBER_MOBILE_KEY = "erp_remember_mobile";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string, rememberMe: boolean): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

export function isRememberMeEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(REMEMBER_ME_KEY);
  if (v === null) return true;
  return v === "1";
}

export function setRememberMePreference(enabled: boolean, mobile?: string): void {
  if (enabled) {
    localStorage.setItem(REMEMBER_ME_KEY, "1");
    if (mobile?.trim()) localStorage.setItem(REMEMBER_MOBILE_KEY, mobile.trim());
  } else {
    localStorage.removeItem(REMEMBER_ME_KEY);
    localStorage.removeItem(REMEMBER_MOBILE_KEY);
  }
}

export function getRememberedMobile(): string {
  if (typeof window === "undefined") return "";
  if (localStorage.getItem(REMEMBER_ME_KEY) !== "1") return "";
  return localStorage.getItem(REMEMBER_MOBILE_KEY) ?? "";
}
