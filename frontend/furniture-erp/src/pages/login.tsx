import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@/api-client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { BadgeCheck, Building2, LockKeyhole, Phone } from "lucide-react";
import { sanitizeDigitsOnly, FIELD_LIMITS } from "@/lib/form-validation";

export default function Login() {
  const [mobile, setMobile] = useState(""); 
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const { login: setAuthToken } = useAuth();
  const { toast } = useToast();

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        setAuthToken(data.token);
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast({
          title: "Login Failed",
          description: error.message || "Invalid credentials",
          variant: "destructive",
        });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
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
    loginMutation.mutate({ data: { mobile: digitsOnly, password } });
  };

  const handleMobileChange = (value: string) => {
    setMobile(sanitizeDigitsOnly(value, FIELD_LIMITS.mobile));
  };

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
              <img src="/icon.png" alt="MGR Casa" className="h-10 w-10 object-contain" />
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold tracking-tight">MGR Casa ERP</CardTitle>
              <CardDescription className="mt-1 text-sm">Sign in to continue to your workspace</CardDescription>
            </div>
            <div className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/15">
              <BadgeCheck className="h-3.5 w-3.5" />
              Secure login
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mobile" >Mobile Number</Label>
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
                    className="h-11 rounded-xl border-white/50 bg-white/75 pl-10 shadow-sm  tracking-wide"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative mt-1">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 rounded-xl border-white/50 bg-white/75 pl-10 shadow-sm"
                  />
                </div>
              </div>
              <Button type="submit" className="mt-2 h-11 w-full rounded-xl text-sm font-semibold" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Logging in..." : "Login"}
              </Button>
            </form>
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