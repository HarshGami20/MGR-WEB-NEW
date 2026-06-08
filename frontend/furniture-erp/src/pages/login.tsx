import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  getRememberedMobile,
  isRememberMeEnabled,
  setRememberMePreference,
} from "@/lib/auth-storage";
import {
  isLoginOtpRequired,
  resendLoginOtp,
  verifyLoginOtp,
  webLogin,
} from "@/lib/auth-login-api";
import { formatErrorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { BadgeCheck, Building2, Eye, EyeOff, LockKeyhole, MessageCircle, Phone } from "lucide-react";
import { sanitizeDigitsOnly, FIELD_LIMITS } from "@/lib/form-validation";

type LoginStep = "credentials" | "otp";

export default function Login() {
  const [step, setStep] = useState<LoginStep>("credentials");
  const [mobile, setMobile] = useState(() => getRememberedMobile());
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => isRememberMeEnabled());
  const [otp, setOtp] = useState("");
  const [otpSessionId, setOtpSessionId] = useState<string | null>(null);
  const [maskedMobile, setMaskedMobile] = useState("");
  const [expiresInSeconds, setExpiresInSeconds] = useState(300);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { login: setAuthToken } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const completeLogin = useCallback(
    (token: string) => {
      const digitsOnly = sanitizeDigitsOnly(mobile, FIELD_LIMITS.mobile);
      setRememberMePreference(rememberMe, digitsOnly);
      setAuthToken(token, rememberMe);
      setLocation("/dashboard");
    },
    [mobile, rememberMe, setAuthToken, setLocation],
  );

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digitsOnly = sanitizeDigitsOnly(mobile, FIELD_LIMITS.mobile);
    if (digitsOnly.length !== 10) {
      toast({
        title: "Invalid mobile number",
        description: "Enter exactly 10 digits.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const data = await webLogin(digitsOnly, password);
      if (isLoginOtpRequired(data)) {
        setOtpSessionId(data.sessionId);
        setMaskedMobile(data.maskedMobile);
        setExpiresInSeconds(data.expiresInSeconds);
        setResendCooldown(60);
        setOtp("");
        setStep("otp");
        toast({
          title: "Verification code sent",
          description: `Check WhatsApp on ${data.maskedMobile}.`,
        });
        return;
      }
      completeLogin(data.token);
    } catch (error) {
      toast({
        title: "Login Failed",
        description: formatErrorMessage(error, "Invalid credentials"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpSessionId) {
      setStep("credentials");
      return;
    }
    const code = otp.replace(/\D/g, "");
    if (code.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Enter the 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const data = await verifyLoginOtp(otpSessionId, code);
      completeLogin(data.token);
    } catch (error) {
      toast({
        title: "Verification failed",
        description: formatErrorMessage(error, "Invalid verification code"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!otpSessionId || resendCooldown > 0) return;
    setLoading(true);
    try {
      const data = await resendLoginOtp(otpSessionId);
      setMaskedMobile(data.maskedMobile);
      setExpiresInSeconds(data.expiresInSeconds);
      setResendCooldown(60);
      setOtp("");
      toast({
        title: "Code resent",
        description: `A new code was sent to WhatsApp on ${data.maskedMobile}.`,
      });
    } catch (error) {
      const message = formatErrorMessage(error, "Could not resend code");
      const retryAfter =
        error &&
        typeof error === "object" &&
        "data" in error &&
        error.data &&
        typeof error.data === "object" &&
        "retryAfterSeconds" in error.data &&
        typeof (error.data as { retryAfterSeconds?: unknown }).retryAfterSeconds === "number"
          ? (error.data as { retryAfterSeconds: number }).retryAfterSeconds
          : null;
      if (retryAfter != null) setResendCooldown(retryAfter);
      toast({
        title: "Resend failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToCredentials = () => {
    setStep("credentials");
    setOtp("");
    setOtpSessionId(null);
    setMaskedMobile("");
  };

  const handleMobileChange = (value: string) => {
    setMobile(sanitizeDigitsOnly(value, FIELD_LIMITS.mobile));
  };

  const expiryMinutes = Math.max(1, Math.round(expiresInSeconds / 60));

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 16%, rgba(120, 72, 160, 0.16), transparent 34%), radial-gradient(circle at 86% 22%, rgba(140, 114, 200, 0.18), transparent 38%), radial-gradient(circle at 52% 88%, rgba(196, 181, 253, 0.22), transparent 34%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,39,67,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(56,39,67,0.22) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-1/3 h-72 w-72 rounded-full bg-brand-300/35 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-violet-200/30 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <Card className="w-full rounded-[2rem] border-white/55 bg-white/70 shadow-[0_24px_70px_rgba(56,39,67,0.14)] backdrop-blur-xl">
          <CardHeader className="space-y-3 pb-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 ring-1 ring-primary/20">
              <img src="/mgr_casa_logo_blue_mg.svg" alt="MGR Casa" className="h-10 w-10 object-contain" />
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold tracking-tight">MGR Casa ERP</CardTitle>
              <CardDescription className="mt-1 text-sm">
                {step === "credentials"
                  ? "Sign in to continue to your workspace"
                  : "Enter the verification code sent to WhatsApp"}
              </CardDescription>
            </div>
            <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/15">
              {step === "credentials" ? (
                <>
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Secure login
                </>
              ) : (
                <>
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp verification
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {step === "credentials" ? (
              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mobile">Mobile Number</Label>
                  <div className="relative mt-1">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="mobile"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="Enter mobile number"
                      maxLength={10}
                      pattern="[0-9]{10}"
                      title="Enter 10 digits only"
                      value={mobile}
                      onChange={(e) => handleMobileChange(e.target.value)}
                      required
                      className="h-11 rounded-xl border-white/50 bg-white/75 pl-10 shadow-sm tracking-wide"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative mt-1">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11 rounded-xl border-white/50 bg-white/75 pl-10 pr-12 shadow-sm"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      className="absolute inset-y-0 right-0 z-10 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                  />
                  <Label htmlFor="remember-me" className="cursor-pointer text-sm font-normal leading-none">
                    Remember me
                  </Label>
                </div>
                <Button type="submit" className="mt-2 h-11 w-full rounded-xl text-sm font-semibold" disabled={loading}>
                  {loading ? "Verifying..." : "Continue"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleOtpSubmit} className="space-y-4">
                <p className="text-center text-sm text-muted-foreground">
                  We sent a 6-digit code to WhatsApp on{" "}
                  <span className="font-medium text-foreground">{maskedMobile || "your mobile"}</span>. Code expires in{" "}
                  {expiryMinutes} minute{expiryMinutes === 1 ? "" : "s"}.
                </p>
                <div className="flex justify-center py-2">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={loading}>
                    <InputOTPGroup className="gap-2">
                      <InputOTPSlot index={0} className="h-11 w-11 rounded-xl" />
                      <InputOTPSlot index={1} className="h-11 w-11 rounded-xl" />
                      <InputOTPSlot index={2} className="h-11 w-11 rounded-xl" />
                      <InputOTPSlot index={3} className="h-11 w-11 rounded-xl" />
                      <InputOTPSlot index={4} className="h-11 w-11 rounded-xl" />
                      <InputOTPSlot index={5} className="h-11 w-11 rounded-xl" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button type="submit" className="h-11 w-full rounded-xl text-sm font-semibold" disabled={loading || otp.length < 6}>
                  {loading ? "Verifying..." : "Verify & sign in"}
                </Button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1 rounded-xl"
                    disabled={loading || resendCooldown > 0}
                    onClick={() => void handleResendOtp()}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 flex-1 rounded-xl"
                    disabled={loading}
                    onClick={handleBackToCredentials}
                  >
                    Back to login
                  </Button>
                </div>
              </form>
            )}
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              Authorized users only
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
