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

const marketplaces = [
  {
    platform: "SALLA",
    name: "Salla",
    description: "Connect your Salla store to sync products",
    color: "from-indigo-500 to-indigo-600",
    bgLight: "bg-indigo-50",
    textColor: "text-indigo-700",
    borderColor: "border-indigo-200",
  },
  {
    platform: "SHOPIFY",
    name: "Shopify",
    description: "Connect your Shopify store to sync products",
    color: "from-green-500 to-green-600",
    bgLight: "bg-green-50",
    textColor: "text-green-700",
    borderColor: "border-green-200",
  },
];

export function Marketplaces() {
  const navigate = useNavigate();
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

  const fetchConnections = () => {
    api
      .get("/marketplaces")
      .then((res) => setConnections(res.data))
      .catch(() => toast.error("Failed to load marketplaces"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConnections();
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
      toast.success(`${connectingPlatform === "SALLA" ? "Salla" : "Shopify"} store connected!`);
      setDialogOpen(false);
      fetchConnections();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Connection failed";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (id: string, platform: string) => {
    try {
      await api.delete(`/marketplaces/${id}`);
      toast.success(`Disconnected from ${platform}`);
      fetchConnections();
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const handleSync = async (id: string, platform: string) => {
    setSyncing(id);
    try {
      const res = await api.post(`/marketplaces/${id}/sync`);
      toast.success(`Synced ${res.data.count} products from ${platform}`);
      fetchConnections();
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Marketplace Connections</h1>
        <p className="text-slate-500 text-sm mt-1">
          Connect your marketplaces to sync products into TijarFlow
        </p>
      </div>

      <div className="space-y-8">
        {marketplaces.map((mp) => {
          const platformConns = getConnections(mp.platform);

          return (
            <div key={mp.platform}>
              {/* Platform Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center ${mp.bgLight}`}
                  >
                    {mp.platform === "SALLA" ? (
                      <Store className={`h-5 w-5 ${mp.textColor}`} />
                    ) : (
                      <ShoppingBag className={`h-5 w-5 ${mp.textColor}`} />
                    )}
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-900 text-lg">{mp.name}</h2>
                    <p className="text-sm text-slate-500">
                      {platformConns.length} store{platformConns.length !== 1 ? "s" : ""} connected
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
                      Setup Guide
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

              {/* Store Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {platformConns.length === 0 && (
                  <Card className="border-slate-200/60 overflow-hidden">
                    <CardContent className="p-5 flex flex-col items-center justify-center min-h-[120px]">
                      <p className="text-sm text-slate-400 mb-3">No stores connected yet</p>
                      <Button
                        onClick={() => openConnect(mp.platform)}
                        className="bg-teal-600 hover:bg-teal-700 text-white"
                        size="sm"
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1.5" />
                        Connect {mp.name}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Connected stores */}
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
                          className="shrink-0 ml-2 bg-emerald-50 text-emerald-700 border-emerald-200"
                        >
                          Connected
                        </Badge>
                      </div>

                      <p className="text-sm text-slate-500 mb-4">
                        {conn._count?.products ?? 0} products synced
                      </p>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleSync(conn.id, conn.storeName)}
                          disabled={syncing === conn.id}
                          className="bg-teal-600 hover:bg-teal-700 text-white flex-1"
                          size="sm"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 mr-1.5 ${syncing === conn.id ? "animate-spin" : ""}`}
                          />
                          {syncing === conn.id ? "Syncing..." : "Sync"}
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

      {/* Connect Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {connectingPlatform}</DialogTitle>
            <DialogDescription>
              Enter your store details to connect
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="space-y-2">
              <Label>Store Name</Label>
              <Input
                placeholder={connectingPlatform === "SHOPIFY" ? "My Shopify Store" : "My Salla Store"}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Store URL</Label>
              <Input
                placeholder={connectingPlatform === "SHOPIFY" ? "https://mystore.myshopify.com" : "https://mystore.salla.sa"}
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Client ID</Label>
              <Input
                placeholder={connectingPlatform === "SHOPIFY" ? "96237c1c6ec5f21d653a..." : "Enter your Salla Client ID"}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Client Secret</Label>
              <Input
                type="password"
                placeholder={connectingPlatform === "SHOPIFY" ? "shpss_xxxxxxxxxxxxxxxxxxxxx" : "Enter your Salla Client Secret"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-slate-500">
              {connectingPlatform === "SALLA"
                ? "Find these in Salla Partner Portal → Apps → Your App → OAuth2 Credentials"
                : "Find these in Shopify Admin → Settings → Apps → Develop apps → Your app → API credentials"}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={saving}
              >
                {saving ? "Connecting..." : "Connect"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
