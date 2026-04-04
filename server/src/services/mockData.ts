interface MockProduct {
  title: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  sku: string;
  currency: string;
  quantity: number;
  images: string[];
  category: string;
  tags: string[];
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  platformProductId: string;
}

const sallaProducts: Omit<MockProduct, "sku" | "platformProductId">[] = [
  { title: "عباية كلاسيكية سوداء", description: "عباية أنيقة مصنوعة من قماش كريب فاخر", price: 350, compareAtPrice: 450, currency: "SAR", quantity: 25, images: ["https://placehold.co/400x400/1a1a2e/ffffff?text=Abaya"], category: "ملابس نسائية", tags: ["عبايات", "أزياء"], status: "ACTIVE" },
  { title: "عطر عود ملكي", description: "عطر عود فاخر بتركيبة شرقية أصيلة", price: 280, compareAtPrice: null, currency: "SAR", quantity: 50, images: ["https://placehold.co/400x400/4a1942/ffffff?text=Oud"], category: "عطور", tags: ["عود", "عطور شرقية"], status: "ACTIVE" },
  { title: "تمر سكري ممتاز", description: "تمر سكري من القصيم - درجة أولى", price: 95, compareAtPrice: 120, currency: "SAR", quantity: 200, images: ["https://placehold.co/400x400/8b6914/ffffff?text=Dates"], category: "أغذية", tags: ["تمور", "سكري"], status: "ACTIVE" },
  { title: "بخور دوسري فاخر", description: "بخور معطر بأجود أنواع العود", price: 150, compareAtPrice: null, currency: "SAR", quantity: 75, images: ["https://placehold.co/400x400/2d1b69/ffffff?text=Bakhoor"], category: "بخور ومعطرات", tags: ["بخور", "معطرات منزلية"], status: "ACTIVE" },
  { title: "ثوب رجالي قطن", description: "ثوب رجالي من القطن المصري الفاخر", price: 220, compareAtPrice: 280, currency: "SAR", quantity: 40, images: ["https://placehold.co/400x400/f5f5dc/333333?text=Thobe"], category: "ملابس رجالية", tags: ["أثواب", "أزياء رجالية"], status: "ACTIVE" },
  { title: "عسل سدر أصلي", description: "عسل سدر طبيعي من جبال اليمن", price: 180, compareAtPrice: null, currency: "SAR", quantity: 30, images: ["https://placehold.co/400x400/daa520/ffffff?text=Honey"], category: "أغذية", tags: ["عسل", "منتجات طبيعية"], status: "ACTIVE" },
  { title: "شماغ شتوي فاخر", description: "شماغ من أجود أنواع القطن", price: 85, compareAtPrice: 110, currency: "SAR", quantity: 100, images: ["https://placehold.co/400x400/cc0000/ffffff?text=Shemagh"], category: "إكسسوارات رجالية", tags: ["شماغ", "إكسسوارات"], status: "ACTIVE" },
  { title: "زيت أركان مغربي", description: "زيت أركان طبيعي للعناية بالبشرة والشعر", price: 120, compareAtPrice: null, currency: "SAR", quantity: 60, images: ["https://placehold.co/400x400/228b22/ffffff?text=Argan"], category: "عناية شخصية", tags: ["زيوت", "عناية بالبشرة"], status: "DRAFT" },
  { title: "سجادة صلاة محمولة", description: "سجادة صلاة خفيفة الوزن مع حقيبة", price: 65, compareAtPrice: 80, currency: "SAR", quantity: 150, images: ["https://placehold.co/400x400/006400/ffffff?text=Prayer+Mat"], category: "مستلزمات إسلامية", tags: ["صلاة", "سفر"], status: "ACTIVE" },
  { title: "حقيبة جلد طبيعي", description: "حقيبة يد من الجلد الطبيعي الإيطالي", price: 450, compareAtPrice: 550, currency: "SAR", quantity: 15, images: ["https://placehold.co/400x400/8b4513/ffffff?text=Bag"], category: "حقائب", tags: ["جلد", "حقائب نسائية"], status: "ACTIVE" },
  { title: "مسك الطهارة", description: "مسك أبيض طبيعي فاخر", price: 45, compareAtPrice: null, currency: "SAR", quantity: 300, images: ["https://placehold.co/400x400/f0e68c/333333?text=Musk"], category: "عطور", tags: ["مسك", "عطور"], status: "ACTIVE" },
  { title: "كحل إثمد أصلي", description: "كحل إثمد طبيعي من الحجاز", price: 35, compareAtPrice: 50, currency: "SAR", quantity: 80, images: ["https://placehold.co/400x400/333333/ffffff?text=Kohl"], category: "مكياج", tags: ["كحل", "مكياج طبيعي"], status: "DRAFT" },
];

const shopifyProducts: Omit<MockProduct, "sku" | "platformProductId">[] = [
  { title: "Premium Wireless Headphones", description: "Noise-cancelling over-ear headphones with 30hr battery", price: 79.99, compareAtPrice: 129.99, currency: "USD", quantity: 45, images: ["https://placehold.co/400x400/1a1a2e/ffffff?text=Headphones"], category: "Electronics", tags: ["audio", "wireless"], status: "ACTIVE" },
  { title: "Organic Cotton T-Shirt", description: "Sustainable organic cotton crew neck t-shirt", price: 29.99, compareAtPrice: null, currency: "USD", quantity: 120, images: ["https://placehold.co/400x400/4682b4/ffffff?text=T-Shirt"], category: "Clothing", tags: ["organic", "basics"], status: "ACTIVE" },
  { title: "Stainless Steel Water Bottle", description: "Double-walled insulated bottle, keeps drinks cold 24hrs", price: 34.99, compareAtPrice: 44.99, currency: "USD", quantity: 200, images: ["https://placehold.co/400x400/708090/ffffff?text=Bottle"], category: "Home & Kitchen", tags: ["eco-friendly", "hydration"], status: "ACTIVE" },
  { title: "Yoga Mat Pro", description: "Non-slip TPE yoga mat with alignment lines", price: 49.99, compareAtPrice: null, currency: "USD", quantity: 60, images: ["https://placehold.co/400x400/6b8e23/ffffff?text=Yoga+Mat"], category: "Sports", tags: ["yoga", "fitness"], status: "ACTIVE" },
  { title: "Leather Minimalist Wallet", description: "Slim RFID-blocking leather wallet", price: 39.99, compareAtPrice: 59.99, currency: "USD", quantity: 85, images: ["https://placehold.co/400x400/8b4513/ffffff?text=Wallet"], category: "Accessories", tags: ["leather", "minimalist"], status: "ACTIVE" },
  { title: "Bamboo Cutting Board Set", description: "3-piece bamboo cutting board set with juice groove", price: 24.99, compareAtPrice: null, currency: "USD", quantity: 90, images: ["https://placehold.co/400x400/deb887/333333?text=Cutting+Board"], category: "Home & Kitchen", tags: ["bamboo", "kitchen"], status: "ACTIVE" },
  { title: "Scented Soy Candle Collection", description: "Set of 3 hand-poured soy candles, 40hr burn time each", price: 42.99, compareAtPrice: 54.99, currency: "USD", quantity: 70, images: ["https://placehold.co/400x400/ffd700/333333?text=Candles"], category: "Home Decor", tags: ["candles", "aromatherapy"], status: "ACTIVE" },
  { title: "Ceramic Pour-Over Coffee Set", description: "Handmade ceramic dripper with server and filters", price: 54.99, compareAtPrice: null, currency: "USD", quantity: 35, images: ["https://placehold.co/400x400/6f4e37/ffffff?text=Coffee+Set"], category: "Home & Kitchen", tags: ["coffee", "handmade"], status: "ACTIVE" },
  { title: "Wireless Charging Pad", description: "15W fast wireless charger, compatible with all Qi devices", price: 19.99, compareAtPrice: 29.99, currency: "USD", quantity: 150, images: ["https://placehold.co/400x400/333333/ffffff?text=Charger"], category: "Electronics", tags: ["charging", "wireless"], status: "ACTIVE" },
  { title: "Linen Throw Blanket", description: "Lightweight French linen throw blanket", price: 69.99, compareAtPrice: null, currency: "USD", quantity: 40, images: ["https://placehold.co/400x400/d2b48c/333333?text=Blanket"], category: "Home Decor", tags: ["linen", "cozy"], status: "DRAFT" },
  { title: "Plant-Based Protein Powder", description: "Organic pea protein blend, chocolate flavor, 2lb", price: 44.99, compareAtPrice: 54.99, currency: "USD", quantity: 100, images: ["https://placehold.co/400x400/228b22/ffffff?text=Protein"], category: "Health", tags: ["vegan", "protein"], status: "ACTIVE" },
  { title: "Minimalist Desk Lamp", description: "Adjustable LED desk lamp with USB charging port", price: 59.99, compareAtPrice: null, currency: "USD", quantity: 55, images: ["https://placehold.co/400x400/f5f5dc/333333?text=Lamp"], category: "Home Office", tags: ["lighting", "office"], status: "ACTIVE" },
];

export function generateSallaProducts(connectionId: string, userId: string) {
  return sallaProducts.map((p, i) => ({
    ...p,
    userId,
    marketplaceConnectionId: connectionId,
    sku: `SALLA-${String(i + 1).padStart(4, "0")}`,
    platformProductId: `salla_${Date.now()}_${i}`,
    platformData: { source: "salla", synced: true },
  }));
}

export function generateShopifyProducts(connectionId: string, userId: string) {
  return shopifyProducts.map((p, i) => ({
    ...p,
    userId,
    marketplaceConnectionId: connectionId,
    sku: `SHOP-${String(i + 1).padStart(4, "0")}`,
    platformProductId: `shopify_${Date.now()}_${i}`,
    platformData: { source: "shopify", synced: true },
  }));
}
