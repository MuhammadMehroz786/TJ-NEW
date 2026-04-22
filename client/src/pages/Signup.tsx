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
import { useTranslation } from "react-i18next";

export function Signup() {
  // MVP scope: only MERCHANT signups. The Creator role + its pages still
  // exist for any already-created creator accounts and for future re-enable,
  // but new users can no longer pick that path — we start straight on the
  // account-details step with role hardcoded to MERCHANT.
  const [step, setStep] = useState<1 | 2 | 3>(2);
  const [role] = useState<"MERCHANT">("MERCHANT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { signupStart, signupVerify, signupResend } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

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
            {step === 2 ? t("signup.formTitle") : t("signup.otpTitle")}
          </CardTitle>
          <CardDescription className="text-slate-500">
            {step === 2
              ? t("signup.formStepSimple")
              : t("signup.otpStep", { email })}
          </CardDescription>
          <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-600 rounded-full transition-all duration-300"
              style={{ width: step === 2 ? "50%" : "100%" }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {step === 2 ? (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("signup.nameLabel")}</Label>
                  <Input id="name" type="text" placeholder={t("signup.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("signup.emailLabel")}</Label>
                  <Input id="email" type="email" placeholder={t("signup.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("signup.passwordLabel")}</Label>
                  <Input id="password" type="password" placeholder={t("signup.passwordPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                </div>
                <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white" disabled={loading}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t("signup.submitting")}
                    </span>
                  ) : (
                    t("signup.submit")
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
                {t("common.back")}
              </button>
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-teal-50/60 border border-teal-100 text-sm text-teal-800">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>{t("signup.otpHint")}</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">{t("signup.otpLabel")}</Label>
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
                      {t("signup.otpSubmitting")}
                    </span>
                  ) : (
                    t("signup.otpSubmit")
                  )}
                </Button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="w-full text-sm text-slate-500 hover:text-slate-700 disabled:opacity-60"
                >
                  {resending ? t("signup.otpResending") : t("signup.otpResend")}
                </button>
              </form>
            </>
          )}
          <p className="mt-6 text-center text-sm text-slate-500">
            {t("signup.haveAccount")}{" "}
            <Link to="/login" className="text-teal-600 font-medium hover:text-teal-700">{t("signup.signIn")}</Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
