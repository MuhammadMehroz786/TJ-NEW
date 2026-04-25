import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Store, Link2, Unlink, RefreshCw, ShoppingBag, BookOpen, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";

interface Connection {
  id: string;
  platform: string;
  storeName: string;
  storeUrl: string;
  status: string;
  createdAt: string;
  _count?: { products: number };
}

export function Marketplaces() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Marketplace descriptors are built from i18n at render time so the name +
  // description translate with the rest of the page.
  const marketplaces = [
    {
      platform: "SALLA" as const,
      name: t("marketplaces.salla"),
      description: t("marketplaces.sallaDescription"),
      color: "from-indigo-500 to-indigo-600",
      bgLight: "bg-indigo-50",
      textColor: "text-indigo-700",
      borderColor: "border-indigo-200",
    },
    {
      platform: "SHOPIFY" as const,
      name: t("marketplaces.shopify"),
      description: t("marketplaces.shopifyDescription"),
      color: "from-green-500 to-green-600",
      bgLight: "bg-green-50",
      textColor: "text-green-700",
      borderColor: "border-green-200",
    },
  ];

  const fetchConnections = () => {
    api
      .get("/marketplaces")
      .then((res) => setConnections(res.data))
      .catch(() => toast.error(t("marketplaces.loadFailed")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getConnections = (platform: string) =>
    connections.filter((c) => c.platform === platform);

  const openConnect = (platform: string) => {
    setConnectingPlatform(platform);
    setStoreName("");
    setStoreUrl("");
    setClientId("");
    setClientSecret("");
    setDialogOpen(true);
  };

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/marketplaces/connect", {
        platform: connectingPlatform,
        storeName,
        storeUrl,
        clientId,
        clientSecret,
      });
      const label = connectingPlatform === "SALLA" ? t("marketplaces.salla") : t("marketplaces.shopify");
      toast.success(t("marketplaces.storeConnected", { platform: label }));
      setDialogOpen(false);
      fetchConnections();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t("marketplaces.connectionFailed");
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (id: string, platform: string) => {
    try {
      await api.delete(`/marketplaces/${id}`);
      toast.success(t("marketplaces.disconnected", { platform }));
      fetchConnections();
    } catch {
      toast.error(t("marketplaces.disconnectFailed"));
    }
  };

  const handleSync = async (id: string, platform: string) => {
    setSyncing(id);
    try {
      const res = await api.post(`/marketplaces/${id}/sync`);
      toast.success(t("marketplaces.syncedCount", { count: res.data.count, platform }));
      fetchConnections();
    } catch {
      toast.error(t("marketplaces.syncFailed"));
    } finally {
      setSyncing(null);
    }
  };

  const isShopify = connectingPlatform === "SHOPIFY";
  const platformLabel = isShopify ? t("marketplaces.shopify") : t("marketplaces.salla");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">{t("marketplaces.title")}</h1>
        <p className="text-slate-500 text-sm mt-1">{t("marketplaces.subtitle")}</p>
      </div>

      <div className="space-y-8">
        {marketplaces.map((mp) => {
          const platformConns = getConnections(mp.platform);

          return (
            <div key={mp.platform}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${mp.bgLight}`}>
                    {mp.platform === "SALLA" ? (
                      <Store className={`h-5 w-5 ${mp.textColor}`} />
                    ) : (
                      <ShoppingBag className={`h-5 w-5 ${mp.textColor}`} />
                    )}
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-900 text-lg">{mp.name}</h2>
                    <p className="text-sm text-slate-500">
                      {t("marketplaces.storesConnected", { count: platformConns.length })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {mp.platform === "SHOPIFY" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/shopify-guide")}
                      className="text-green-700 border-green-200 hover:bg-green-50"
                    >
                      <BookOpen className="h-4 w-4 mr-1" />
                      {t("marketplaces.setupGuide")}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConnect(mp.platform)}
                    className={`${mp.textColor} ${mp.borderColor} hover:${mp.bgLight}`}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {platformConns.length === 0 && (
                  <Card className="border-slate-200/60 overflow-hidden">
                    <CardContent className="p-5 flex flex-col items-center justify-center min-h-[120px]">
                      <p className="text-sm text-slate-400 mb-3">{t("marketplaces.noneYet")}</p>
                      <Button
                        onClick={() => openConnect(mp.platform)}
                        className="bg-teal-600 hover:bg-teal-700 text-white"
                        size="sm"
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1.5" />
                        {t("marketplaces.connect", { name: mp.name })}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {platformConns.map((conn) => (
                  <Card key={conn.id} className="border-slate-200/60 overflow-hidden">
                    <div className={`h-1.5 bg-gradient-to-r ${mp.color}`} />
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 truncate">{conn.storeName}</h3>
                          <p className="text-xs text-slate-400 truncate">{conn.storeUrl}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className="shrink-0 ms-2 bg-emerald-50 text-emerald-700 border-emerald-200"
                        >
                          {t("marketplaces.connected")}
                        </Badge>
                      </div>

                      <p className="text-sm text-slate-500 mb-4">
                        {t("marketplaces.productsSynced", { count: conn._count?.products ?? 0 })}
                      </p>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleSync(conn.id, conn.storeName)}
                          disabled={syncing === conn.id}
                          className="bg-teal-600 hover:bg-teal-700 text-white flex-1"
                          size="sm"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 me-1.5 ${syncing === conn.id ? "animate-spin" : ""}`}
                          />
                          {syncing === conn.id ? t("marketplaces.syncing") : t("marketplaces.sync")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnect(conn.id, conn.storeName)}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("marketplaces.connectTitle", { platform: platformLabel })}</DialogTitle>
            <DialogDescription>{t("marketplaces.connectSubtitle")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("marketplaces.storeName")}</Label>
              <Input
                placeholder={isShopify ? t("marketplaces.storeNamePlaceholderShopify") : t("marketplaces.storeNamePlaceholderSalla")}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t("marketplaces.storeUrl")}</Label>
              <Input
                placeholder={isShopify ? t("marketplaces.storeUrlPlaceholderShopify") : t("marketplaces.storeUrlPlaceholderSalla")}
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t("marketplaces.clientId")}</Label>
              <Input
                placeholder={isShopify ? t("marketplaces.clientIdPlaceholderShopify") : t("marketplaces.clientIdPlaceholderSalla")}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t("marketplaces.clientSecret")}</Label>
              <Input
                type="password"
                placeholder={isShopify ? t("marketplaces.clientSecretPlaceholderShopify") : t("marketplaces.clientSecretPlaceholderSalla")}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-slate-500">
              {connectingPlatform === "SALLA" ? t("marketplaces.hintSalla") : t("marketplaces.hintShopify")}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("marketplaces.cancel")}
              </Button>
              <Button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={saving}
              >
                {saving ? t("marketplaces.connecting") : t("marketplaces.connectBtn")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
