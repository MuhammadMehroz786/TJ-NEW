import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";

export function AdminLogin() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { adminRequestCode, adminVerifyCode } = useAuth();
  const navigate = useNavigate();

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return toast.error("Enter your admin email");
    setLoading(true);
    try {
      await adminRequestCode(trimmed);
      // Deliberately don't confirm whether the email is a real admin —
      // prevents attackers from enumerating admin accounts via this endpoint.
      toast.success("Check your inbox if that email belongs to an admin.");
      setStep(2);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          "Couldn't request the code",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    const digits = code.trim().replace(/\D/g, "");
    if (digits.length !== 6) return toast.error("Enter the 6-digit code from your email");
    setLoading(true);
    try {
      await adminVerifyCode(email.trim().toLowerCase(), digits);
      toast.success("Signed in");
      navigate("/admin");
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          "Verification failed",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await adminRequestCode(email.trim().toLowerCase());
      toast.success("A fresh code has been sent. Use the newest email — older codes no longer work.", { duration: 6000 });
      setCode("");
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          "Couldn't resend the code",
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      <Card className="border-slate-200/60 shadow-xl shadow-slate-200/50">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-purple-700" />
          </div>
          <CardTitle className="text-2xl font-semibold text-slate-900">
            {step === 1 ? "Admin sign-in" : "Enter your code"}
          </CardTitle>
          <CardDescription className="text-slate-500">
            {step === 1
              ? "Admins sign in with an email code — no password"
              : `If ${email} is an admin, a code is on its way.`}
          </CardDescription>
          <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-600 rounded-full transition-all duration-300"
              style={{ width: step === 1 ? "50%" : "100%" }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Admin email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@tijarflow.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending code...
                  </span>
                ) : (
                  "Send sign-in code"
                )}
              </Button>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setStep(1); setCode(""); }}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 -mt-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-50/60 border border-purple-100 text-sm text-purple-800">
                  <Mail className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    A code has been sent only if this email belongs to an admin account. It arrives in about 30 seconds and expires in 10 minutes.
                    If nothing arrives, double-check the email address and go back.
                  </span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">6-digit code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="text-center text-xl tracking-[0.4em] font-semibold"
                    required
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={loading || code.length !== 6}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    "Verify & sign in"
                  )}
                </Button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="w-full text-sm text-slate-500 hover:text-slate-700 disabled:opacity-60"
                >
                  {resending ? "Resending..." : "Didn't get it? Resend code"}
                </button>
              </form>
            </>
          )}
          <p className="mt-6 text-center text-sm text-slate-500">
            Not an admin?{" "}
            <Link to="/login" className="text-teal-600 font-medium hover:text-teal-700">
              Sign in with password
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
