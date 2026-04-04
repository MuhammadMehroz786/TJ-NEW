import { ArrowLeft, ExternalLink, Copy, Check, ShoppingBag, Key, Shield, Link2, Package, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";

function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-sm font-mono overflow-x-auto">
        {code}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function ShopifyGuide() {
  return (
    <div className="max-w-4xl">
      {/* Back + Header */}
      <div className="mb-8">
        <Link
          to="/marketplaces"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Marketplaces
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-green-50 flex items-center justify-center">
            <ShoppingBag className="h-6 w-6 text-green-700" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Shopify Integration Guide</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              How to connect your Shopify store to TijarFlow
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Overview Card */}
        <Card className="border-slate-200/60 border-l-4 border-l-teal-500">
          <CardContent className="p-5">
            <p className="text-sm text-slate-700 leading-relaxed">
              TijarFlow connects to your Shopify store using the <strong>Admin API</strong>. You'll need to create a
              custom app in your Shopify admin to generate an API access token. This token allows TijarFlow
              to read and sync your products.
            </p>
          </CardContent>
        </Card>

        {/* What You'll Need */}
        <Card className="border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="h-5 w-5 text-slate-400" />
              What You'll Need
            </CardTitle>
            <CardDescription>These credentials are required to connect your store</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm font-semibold text-slate-800">Store URL</p>
                <p className="text-xs text-slate-500 mt-1">Your myshopify.com domain</p>
                <code className="text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded mt-2 inline-block">
                  yourstore.myshopify.com
                </code>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm font-semibold text-slate-800">Store Name</p>
                <p className="text-xs text-slate-500 mt-1">Display name for your store</p>
                <code className="text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded mt-2 inline-block">
                  My Shopify Store
                </code>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm font-semibold text-slate-800">Admin API Access Token</p>
                <p className="text-xs text-slate-500 mt-1">Starts with shpat_</p>
                <code className="text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded mt-2 inline-block">
                  shpat_xxxxxxxxxxxx
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step by Step */}
        <Card className="border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-lg">Step-by-Step Setup</CardTitle>
            <CardDescription>Follow these steps in your Shopify Admin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="flex-none">
                <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm font-bold">
                  1
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Enable Custom App Development</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Go to your Shopify Admin → <strong>Settings</strong> → <strong>Apps and sales channels</strong> →
                  click <strong>Develop apps</strong>. If prompted, click <strong>"Allow custom app development"</strong>.
                </p>
                <a
                  href="https://shopify.dev/docs/apps/build/authentication/access-tokens/generate-app-credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 mt-2"
                >
                  Shopify Docs: App Credentials
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <Separator />

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="flex-none">
                <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm font-bold">
                  2
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Create a Custom App</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Click <strong>"Create an app"</strong> and name it <strong>"TijarFlow"</strong> (or any name you prefer).
                </p>
              </div>
            </div>

            <Separator />

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex-none">
                <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm font-bold">
                  3
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Configure Admin API Scopes</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Click <strong>"Configure Admin API scopes"</strong> and enable the following permissions:
                </p>
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-mono text-xs">
                      read_products
                    </Badge>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-mono text-xs">
                      write_products
                    </Badge>
                    <Badge className="bg-green-100 text-green-800 font-mono text-xs">Required</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-mono text-xs">
                      read_inventory
                    </Badge>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-mono text-xs">
                      write_inventory
                    </Badge>
                    <Badge className="bg-blue-100 text-blue-800 font-mono text-xs">Recommended</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-mono text-xs">
                      read_orders
                    </Badge>
                    <Badge className="bg-slate-100 text-slate-600 font-mono text-xs">Optional</Badge>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">Click "Save" after selecting scopes.</p>
              </div>
            </div>

            <Separator />

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="flex-none">
                <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm font-bold">
                  4
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Install the App</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Go to the <strong>"API credentials"</strong> tab and click <strong>"Install app"</strong>.
                  Confirm the installation when prompted.
                </p>
              </div>
            </div>

            <Separator />

            {/* Step 5 */}
            <div className="flex gap-4">
              <div className="flex-none">
                <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm font-bold">
                  5
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Copy Your Admin API Access Token</h3>
                <p className="text-sm text-slate-600 mt-1">
                  After installation, Shopify will show your <strong>Admin API access token</strong>.
                  Copy it immediately — <strong className="text-red-600">it is only shown once!</strong>
                </p>
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">
                    The access token starts with <code className="bg-amber-100 px-1 rounded">shpat_</code> and is only displayed once.
                    If you lose it, you'll need to uninstall and reinstall the app to generate a new one.
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Step 6 */}
            <div className="flex gap-4">
              <div className="flex-none">
                <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm font-bold">
                  6
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Connect in TijarFlow</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Go back to the <strong>Marketplaces</strong> page in TijarFlow, click <strong>"Connect Shopify"</strong>,
                  and enter your store name, store URL, and the access token you just copied.
                </p>
                <Link to="/marketplaces">
                  <Button className="mt-3 bg-teal-600 hover:bg-teal-700 text-white">
                    <Link2 className="h-4 w-4 mr-2" />
                    Go to Marketplaces
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Reference */}
        <Card className="border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-400" />
              API Reference
            </CardTitle>
            <CardDescription>Endpoints TijarFlow uses to sync your products</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Base URL</p>
              <CopyBlock code="https://{store}.myshopify.com/admin/api/2025-01" />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Authentication Header</p>
              <CopyBlock code="X-Shopify-Access-Token: shpat_your_token_here" />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Product Endpoints</p>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600">Operation</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600">Method</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600">Endpoint</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-4 py-2.5 text-slate-700">List products</td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">GET</Badge></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">/products.json</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-slate-700">Get product</td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">GET</Badge></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">/products/{"{id}"}.json</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-slate-700">Create product</td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">POST</Badge></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">/products.json</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-slate-700">Update product</td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">PUT</Badge></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">/products/{"{id}"}.json</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-slate-700">Delete product</td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">DELETE</Badge></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">/products/{"{id}"}.json</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-slate-700">List images</td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">GET</Badge></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">/products/{"{id}"}/images.json</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-slate-700">List variants</td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">GET</Badge></td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">/products/{"{id}"}/variants.json</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Rate Limits</p>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600">
                  <strong>2 requests/second</strong> per app per store (leaky bucket with 40-request bucket).
                  Check <code className="text-xs bg-slate-200 px-1 rounded">X-Shopify-Shop-Api-Call-Limit</code> header for current usage.
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">API Version</p>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600">
                  Current stable: <code className="text-xs bg-teal-50 text-teal-700 px-1 rounded">2025-01</code>.
                  Shopify releases quarterly. Always pin to a specific version.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scopes Reference */}
        <Card className="border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-slate-400" />
              Required Permissions (Scopes)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-4 py-2.5 font-medium text-slate-600">Scope</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-600">Access</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">read_products</td>
                    <td className="px-4 py-2.5 text-slate-600">Read products, variants, images, collections</td>
                    <td className="px-4 py-2.5"><Badge className="bg-green-100 text-green-800 text-xs">Required</Badge></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">write_products</td>
                    <td className="px-4 py-2.5 text-slate-600">Create, update, delete products</td>
                    <td className="px-4 py-2.5"><Badge className="bg-green-100 text-green-800 text-xs">Required</Badge></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">read_inventory</td>
                    <td className="px-4 py-2.5 text-slate-600">Read inventory levels and locations</td>
                    <td className="px-4 py-2.5"><Badge className="bg-blue-100 text-blue-800 text-xs">Recommended</Badge></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">write_inventory</td>
                    <td className="px-4 py-2.5 text-slate-600">Adjust inventory levels</td>
                    <td className="px-4 py-2.5"><Badge className="bg-blue-100 text-blue-800 text-xs">Recommended</Badge></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">read_orders</td>
                    <td className="px-4 py-2.5 text-slate-600">Read order data for analytics</td>
                    <td className="px-4 py-2.5"><Badge className="bg-slate-100 text-slate-600 text-xs">Optional</Badge></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Helpful Links */}
        <Card className="border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-lg">Helpful Links</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "Shopify Admin API Reference", url: "https://shopify.dev/docs/api/admin-rest" },
                { label: "Product Resource Docs", url: "https://shopify.dev/docs/api/admin-rest/2025-01/resources/product" },
                { label: "OAuth & Authentication", url: "https://shopify.dev/docs/apps/auth/oauth" },
                { label: "API Scopes Reference", url: "https://shopify.dev/docs/api/usage/access-scopes" },
                { label: "Rate Limits", url: "https://shopify.dev/docs/api/usage/rate-limits" },
                { label: "API Versioning", url: "https://shopify.dev/docs/api/usage/versioning" },
              ].map(({ label, url }) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-teal-300 hover:bg-teal-50/30 transition-colors group"
                >
                  <span className="text-sm text-slate-700 group-hover:text-teal-700">{label}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-teal-600" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
