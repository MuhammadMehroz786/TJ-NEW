import { ArrowLeft, FileUp, Download, CheckCircle2, AlertTriangle, FileSpreadsheet, Image as ImageIcon, Archive, Copy, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre">
        {code}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

const CSV_TEMPLATE =
  "title,price,quantity,sku,status,description,imageUrl,category,vendor,tags\n" +
  "Cotton T-Shirt,99.00,10,TSHIRT-001,DRAFT,\"Soft cotton t-shirt, unisex\",,Apparel,Acme,\"summer,cotton\"\n" +
  "Running Shoes,349.00,25,SHOE-002,ACTIVE,,,Footwear,Acme,sports\n" +
  "Leather Wallet,189.50,5,WALLET-003,DRAFT,Handmade leather,,Accessories,Acme,\"leather,gift\"\n";

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tijarflow-products-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportGuide() {
  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Products
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-teal-50 flex items-center justify-center">
            <FileUp className="h-6 w-6 text-teal-700" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Bulk Import Guide</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Upload hundreds of products — with photos — in under a minute.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Overview */}
        <Card className="border-slate-200/60 border-l-4 border-l-teal-500">
          <CardContent className="p-5">
            <p className="text-sm text-slate-700 leading-relaxed">
              The bulk importer takes two files: a <strong>CSV</strong> with your product details,
              and an optional <strong>ZIP</strong> of product photos named after each item's SKU.
              Upload both at once on the Products page and TijarFlow will create every product
              with its photos attached — ready for live selling or marketplace push.
            </p>
          </CardContent>
        </Card>

        {/* Step 1 — CSV */}
        <Card className="border-slate-200/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Badge variant="secondary" className="rounded-full h-6 w-6 p-0 flex items-center justify-center font-bold">1</Badge>
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              Prepare your CSV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-slate-600">
              Start from the template below — or export from Excel / Google Sheets / Salla / Shopify.
              Common header names are auto-recognised (e.g. <code className="px-1 bg-slate-100 rounded text-xs">name</code>,
              {" "}<code className="px-1 bg-slate-100 rounded text-xs">qty</code>, <code className="px-1 bg-slate-100 rounded text-xs">brand</code> all work).
            </p>

            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download CSV template
            </Button>

            <div>
              <p className="font-medium text-slate-700 mb-2">Column reference</p>
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Column</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Required</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-3 py-2 font-mono">title</td>
                      <td className="px-3 py-2"><Badge className="bg-red-100 text-red-700 border-red-200">Yes</Badge></td>
                      <td className="px-3 py-2 text-slate-600">Max 255 chars. Aliases: <em>name</em>, <em>product</em></td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono">price</td>
                      <td className="px-3 py-2"><Badge className="bg-red-100 text-red-700 border-red-200">Yes</Badge></td>
                      <td className="px-3 py-2 text-slate-600">Number. Aliases: <em>cost</em></td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono">sku</td>
                      <td className="px-3 py-2 text-slate-500">Optional*</td>
                      <td className="px-3 py-2 text-slate-600">*Required if you're uploading a photos ZIP</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono">quantity</td>
                      <td className="px-3 py-2 text-slate-500">Optional</td>
                      <td className="px-3 py-2 text-slate-600">Defaults to 0. Aliases: <em>qty</em>, <em>stock</em>, <em>inventory</em></td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono">status</td>
                      <td className="px-3 py-2 text-slate-500">Optional</td>
                      <td className="px-3 py-2 text-slate-600">DRAFT / ACTIVE / ARCHIVED. Defaults to DRAFT</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono">description</td>
                      <td className="px-3 py-2 text-slate-500">Optional</td>
                      <td className="px-3 py-2 text-slate-600">Use quotes around text that contains commas</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono">imageUrl</td>
                      <td className="px-3 py-2 text-slate-500">Optional</td>
                      <td className="px-3 py-2 text-slate-600">A public https:// link. Ignored if ZIP has a matching photo</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono">category, vendor, productType</td>
                      <td className="px-3 py-2 text-slate-500">Optional</td>
                      <td className="px-3 py-2 text-slate-600">Free text</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-mono">tags</td>
                      <td className="px-3 py-2 text-slate-500">Optional</td>
                      <td className="px-3 py-2 text-slate-600">Comma or semicolon separated</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="font-medium text-slate-700 mb-2">Sample CSV</p>
              <CopyBlock code={CSV_TEMPLATE} />
            </div>
          </CardContent>
        </Card>

        {/* Step 2 — ZIP */}
        <Card className="border-slate-200/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Badge variant="secondary" className="rounded-full h-6 w-6 p-0 flex items-center justify-center font-bold">2</Badge>
              <Archive className="h-5 w-5 text-amber-600" />
              Prepare your photos ZIP
              <Badge variant="outline" className="ml-2 text-xs">Optional</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-slate-600">
              Name each photo with the SKU of the product it belongs to. The importer matches
              filenames to SKUs — case-insensitive, folders inside the ZIP are flattened.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-md p-4 bg-slate-50/50">
                <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">One photo per product</p>
                <CopyBlock code={"TSHIRT-001.jpg\nSHOE-002.png\nWALLET-003.webp"} />
              </div>

              <div className="border border-slate-200 rounded-md p-4 bg-slate-50/50">
                <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Multiple photos per product</p>
                <CopyBlock code={"TSHIRT-001.jpg\nTSHIRT-001-2.jpg\nTSHIRT-001-3.jpg\nSHOE-002-1.jpg\nSHOE-002-2.jpg"} />
              </div>
            </div>

            <div className="p-4 rounded-md bg-amber-50 border border-amber-200 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900">Rules</p>
                <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                  <li>Supported formats: JPG, PNG, WebP</li>
                  <li>Max 10 MB per image, 100 MB per ZIP, 2,000 files total</li>
                  <li>A photo without a matching SKU is skipped (reported back after import)</li>
                  <li>If a photo matches, it <strong>replaces</strong> any <code className="px-1 bg-amber-100 rounded">imageUrl</code> in the CSV for that row</li>
                  <li>Nested folders inside the ZIP are fine — the importer only looks at filenames</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 3 — Upload */}
        <Card className="border-slate-200/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Badge variant="secondary" className="rounded-full h-6 w-6 p-0 flex items-center justify-center font-bold">3</Badge>
              <FileUp className="h-5 w-5 text-teal-600" />
              Upload on the Products page
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal list-inside space-y-2 text-slate-700">
              <li>Go to <Link to="/products" className="text-teal-700 underline font-medium">Products</Link> and click <strong>Import CSV</strong>.</li>
              <li>Choose your CSV — the first 5 rows will preview immediately so you can spot mistakes.</li>
              <li>If you prepared photos, choose your ZIP file too.</li>
              <li>Click <strong>Import</strong>. You'll get a summary with how many products were created and how many photos matched.</li>
              <li>Photos that didn't match any SKU are listed in a warning — rename them and re-import only those.</li>
            </ol>

            <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-emerald-900">You're done</p>
                <p className="text-xs text-emerald-800">
                  Imported products land in your Products list with status set from the CSV
                  (default DRAFT). From there you can push them to Shopify/Salla, enhance photos
                  with AI, or start a live selling campaign.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card className="border-slate-200/60">
          <CardHeader>
            <CardTitle className="text-lg">Frequently asked</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-medium text-slate-800">What if a SKU is duplicated?</p>
              <p className="text-slate-600 mt-1">
                Only the first occurrence is created. Duplicate rows (with the same SKU) are silently skipped —
                the response tells you how many were skipped.
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-800">Can I re-import to update existing products?</p>
              <p className="text-slate-600 mt-1">
                Not yet — today's importer only creates new rows. To update a product, edit it inline
                or push an updated CSV after deleting the old ones.
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-800">My CSV was exported from Shopify / Salla — will it work?</p>
              <p className="text-slate-600 mt-1">
                Yes. Common column names (Name, Price, Stock, Vendor, Brand…) are auto-mapped. If a
                column isn't recognised it's just ignored.
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-800 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-slate-400" />
                Can I skip the ZIP and add photos later?
              </p>
              <p className="text-slate-600 mt-1">
                Yes. Import the CSV first, then edit each product and upload its photos, or add an
                <code className="px-1 bg-slate-100 rounded text-xs">imageUrl</code> column with a public link.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Link to="/products">
            <Button className="bg-teal-600 hover:bg-teal-700 text-white">
              <FileUp className="h-4 w-4 mr-2" />
              Go to Products
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
