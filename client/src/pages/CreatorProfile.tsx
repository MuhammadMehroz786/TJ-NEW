import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import api from "@/lib/api";

const NICHES = ["Fashion", "Tech", "Food", "Lifestyle", "Beauty", "Sports", "Travel", "Education", "Entertainment", "Other"];
const PLATFORMS = ["instagram", "tiktok", "snapchat", "twitter", "youtube"];

interface SocialEntry { platform: string; handle: string; followerCount: number; }

export function CreatorProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [niche, setNiche] = useState("");
  const [rate, setRate] = useState("");
  const [socialPlatforms, setSocialPlatforms] = useState<SocialEntry[]>([{ platform: "instagram", handle: "", followerCount: 0 }]);
  const [portfolioLinks, setPortfolioLinks] = useState<string[]>([]);
  const [isAvailable, setIsAvailable] = useState(true);

  const isComplete = displayName && niche && rate && socialPlatforms.some((s) => s.handle);

  useEffect(() => {
    api.get("/creators/profile").then((res) => {
      const p = res.data.profile;
      if (p) {
        setDisplayName(p.displayName || "");
        setBio(p.bio || "");
        setProfilePhoto(p.profilePhoto || "");
        setNiche(p.niche || "");
        setRate(p.rate ? String(p.rate) : "");
        setSocialPlatforms(p.socialPlatforms?.length ? p.socialPlatforms : [{ platform: "instagram", handle: "", followerCount: 0 }]);
        setPortfolioLinks(p.portfolioLinks || []);
        setIsAvailable(p.isAvailable !== false);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/creators/profile", {
        displayName, bio: bio || null, profilePhoto: profilePhoto || null, niche,
        rate: parseFloat(rate), socialPlatforms: socialPlatforms.filter((s) => s.handle),
        portfolioLinks: portfolioLinks.filter(Boolean), isAvailable,
      });
      toast.success("Profile saved");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to save profile");
    } finally { setSaving(false); }
  };

  const updateSocial = (i: number, field: keyof SocialEntry, value: string | number) => {
    const u = [...socialPlatforms]; u[i] = { ...u[i], [field]: value }; setSocialPlatforms(u);
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">My Profile</h1>

      {!isComplete && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Complete your profile</p>
            <p className="text-sm text-amber-600 mt-0.5">Fill in your display name, niche, rate, and at least one social platform to appear in search results.</p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <Card className="border-slate-200/60">
          <CardHeader className="pb-4"><CardTitle className="text-lg">Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name *</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your public name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell merchants about yourself..."
                className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2" rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profilePhoto">Profile Photo URL</Label>
              <Input id="profilePhoto" value={profilePhoto} onChange={(e) => setProfilePhoto(e.target.value)} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Niche *</Label>
                <Select value={niche} onValueChange={setNiche}>
                  <SelectTrigger><SelectValue placeholder="Select niche" /></SelectTrigger>
                  <SelectContent>{NICHES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate">Rate (SAR) *</Label>
                <Input id="rate" type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60">
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Social Platforms *</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setSocialPlatforms([...socialPlatforms, { platform: "instagram", handle: "", followerCount: 0 }])}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {socialPlatforms.map((sp, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="w-36">
                  <Label className="text-xs">Platform</Label>
                  <Select value={sp.platform} onValueChange={(v) => updateSocial(i, "platform", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Handle</Label>
                  <Input value={sp.handle} onChange={(e) => updateSocial(i, "handle", e.target.value)} placeholder="@username" />
                </div>
                <div className="w-28">
                  <Label className="text-xs">Followers</Label>
                  <Input type="number" min="0" value={sp.followerCount || ""} onChange={(e) => updateSocial(i, "followerCount", parseInt(e.target.value) || 0)} placeholder="10000" />
                </div>
                {socialPlatforms.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSocialPlatforms(socialPlatforms.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 px-2">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/60">
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Portfolio Links</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setPortfolioLinks([...portfolioLinks, ""])}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {portfolioLinks.length === 0 ? (
              <p className="text-sm text-slate-400">No portfolio links added yet.</p>
            ) : portfolioLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={link} onChange={(e) => { const u = [...portfolioLinks]; u[i] = e.target.value; setPortfolioLinks(u); }} placeholder="https://..." className="flex-1" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setPortfolioLinks(portfolioLinks.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 px-2">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/60">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">Available for campaigns</p>
                <p className="text-sm text-slate-500">When off, merchants won't see you in search results</p>
              </div>
              <button onClick={() => setIsAvailable(!isAvailable)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isAvailable ? "bg-teal-600" : "bg-slate-200"}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${isAvailable ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} className="w-full bg-teal-600 hover:bg-teal-700 text-white" disabled={saving}>
          {saving ? <span className="flex items-center gap-2"><span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</span> : "Save Profile"}
        </Button>
      </div>
    </div>
  );
}
