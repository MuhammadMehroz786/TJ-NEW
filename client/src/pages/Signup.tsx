import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export function Signup() {
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<"MERCHANT" | "CREATOR" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleRoleSelect = (selectedRole: "MERCHANT" | "CREATOR") => {
    setRole(selectedRole);
    setStep(2);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!role) return;
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await signup(name, email, password, role);
      navigate("/");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Signup failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Card className="border-slate-200/60 shadow-xl shadow-slate-200/50">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-semibold text-slate-900">
            {step === 1 ? "I want to..." : "Create your account"}
          </CardTitle>
          <CardDescription className="text-slate-500">
            {step === 1
              ? "Choose how you'll use TijarFlow"
              : `Step 2 of 2 — ${role === "MERCHANT" ? "Merchant" : "Creator"} account`}
          </CardDescription>
          <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-600 rounded-full transition-all duration-300"
              style={{ width: step === 1 ? "50%" : "100%" }}
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
          ) : (
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
                  <Input id="password" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                </div>
                <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white" disabled={loading}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating account...
                    </span>
                  ) : (
                    "Create account"
                  )}
                </Button>
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
