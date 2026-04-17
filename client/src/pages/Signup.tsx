import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ArrowLeft, Mail } from "lucide-react";

export function Signup() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<"MERCHANT" | "CREATOR" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { signupStart, signupVerify, signupResend } = useAuth();
  const navigate = useNavigate();

  const handleRoleSelect = (selectedRole: "MERCHANT" | "CREATOR") => {
    setRole(selectedRole);
    setStep(2);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!role) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await signupStart(name, email, password, role);
      toast.success(res.message);
      setStep(3);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Signup failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    const digits = code.trim().replace(/\D/g, "");
    if (digits.length !== 6) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }
    setLoading(true);
    try {
      await signupVerify(email, digits);
      toast.success("Account created");
      navigate("/");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Verification failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await signupResend(email);
      toast.success("A fresh code has been sent to your email");
      setCode("");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Couldn't resend the code";
      toast.error(message);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      <Card className="border-slate-200/60 shadow-xl shadow-slate-200/50">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-semibold text-slate-900">
            {step === 1 ? "I want to..." : step === 2 ? "Create your account" : "Verify your email"}
          </CardTitle>
          <CardDescription className="text-slate-500">
            {step === 1
              ? "Choose how you'll use TijarFlow"
              : step === 2
                ? `Step 2 of 3 — ${role === "MERCHANT" ? "Merchant" : "Creator"} account`
                : `Step 3 of 3 — We sent a code to ${email}`}
          </CardDescription>
          <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-600 rounded-full transition-all duration-300"
              style={{ width: step === 1 ? "33%" : step === 2 ? "66%" : "100%" }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleRoleSelect("MERCHANT")}
                className="w-full border-2 border-slate-200 rounded-xl p-5 flex items-center gap-4 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-left"
              >
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center text-2xl shrink-0">
                  🏪
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Sell & Advertise</p>
                  <p className="text-sm text-slate-500 mt-0.5">I'm a store owner or merchant</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleRoleSelect("CREATOR")}
                className="w-full border-2 border-slate-200 rounded-xl p-5 flex items-center gap-4 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-left"
              >
                <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-2xl shrink-0">
                  🎬
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Promote & Earn</p>
                  <p className="text-sm text-slate-500 mt-0.5">I'm a content creator</p>
                </div>
              </button>
            </div>
          ) : step === 2 ? (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 -mt-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" type="text" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                </div>
                <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white" disabled={loading}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending code...
                    </span>
                  ) : (
                    "Send verification code"
                  )}
                </Button>
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 -mt-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-teal-50/60 border border-teal-100 text-sm text-teal-800">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>Check your inbox for a 6-digit code. It expires in 10 minutes.</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Verification code</Label>
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
                  />
                </div>
                <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white" disabled={loading || code.length !== 6}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    "Verify & create account"
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
            Already have an account?{" "}
            <Link to="/login" className="text-teal-600 font-medium hover:text-teal-700">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
