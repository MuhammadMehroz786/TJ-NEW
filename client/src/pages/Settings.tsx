import { useState, type FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import api from "@/lib/api";
import { useTranslation } from "react-i18next";

export function Settings() {
  const { user, updateUser } = useAuth();
  const { t } = useTranslation();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const handleProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.put("/user/profile", { name, email });
      updateUser(res.data.user);
      toast.success("Profile updated");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to update profile";
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSavingPassword(true);
    try {
      await api.put("/user/password", { currentPassword, newPassword });
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to update password";
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">{t("settings.title")}</h1>
        <p className="text-slate-500 text-sm mt-1">{t("settings.subtitle")}</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Profile */}
        <Card className="border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-lg">{t("settings.profile")}</CardTitle>
            <CardDescription>{t("settings.profileSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfile} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("settings.nameLabel")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.emailLabel")}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={savingProfile}
              >
                {savingProfile ? t("settings.savingProfile") : t("settings.saveProfile")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Separator />

        {/* Password */}
        <Card className="border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-lg">{t("settings.password")}</CardTitle>
            <CardDescription>{t("settings.passwordSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePassword} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("settings.currentPassword")}</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.newPassword")}</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder={t("settings.newPasswordHint")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.newPassword")}</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={savingPassword}
              >
                {savingPassword ? t("settings.changingPassword") : t("settings.changePassword")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
