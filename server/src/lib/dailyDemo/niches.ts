/**
 * Niche rotation for the Daily Demo Video.
 *
 * One video per day. The cron picks the niche from the day-of-week so the
 * full 7-niche cycle plays out across one week, then repeats. Admins can
 * manually override the niche from the dashboard "Generate now" button.
 *
 * Each niche carries:
 *   - displayName: English label (admin UI)
 *   - displayNameAr: Arabic label (captions, voiceover)
 *   - hookCaptionAr: top-of-video Arabic hook caption (frame 1)
 *   - product: the example product the AI shows in the before/after
 *     (frames 2 + 3). Worded for prompt clarity, not user display.
 *   - shopPrompt / beforePrompt / afterPrompt: scene-specific prompts that
 *     get appended to the global anchor block (see prompts.ts).
 *
 * Niches were chosen to cover the most common Saudi e-commerce categories
 * on Salla/Zid: gold/jewelry, perfume, abaya/modest fashion, dates/sweets,
 * oud/bakhoor, cosmetics, and watches/accessories.
 */
export type Niche =
  | "gold"
  | "perfume"
  | "abaya"
  | "dates"
  | "oud"
  | "cosmetics"
  | "watches";

export interface NicheConfig {
  niche: Niche;
  displayName: string;
  displayNameAr: string;
  hookCaptionAr: string;
  product: string;
  shopPrompt: string;
  beforePrompt: string;
  afterPrompt: string;
}

export const NICHES: Record<Niche, NicheConfig> = {
  gold: {
    niche: "gold",
    displayName: "Gold seller",
    displayNameAr: "بائع ذهب",
    hookCaptionAr: "هل أنت بائع ذهب؟",
    product: "a 21-karat yellow gold bracelet with intricate filigree work",
    shopPrompt:
      "interior of a traditional Saudi gold souk shop, glass display cases filled with gold bracelets, necklaces, and rings under warm spot lighting, brass scales on the counter",
    beforePrompt:
      "a poorly-lit dim phone photo of a 21-karat gold bracelet lying on a plain dark wooden surface, harsh fluorescent overhead light, unflattering shadows, amateur snapshot quality",
    afterPrompt:
      "a beautifully enhanced studio product shot of the same 21-karat gold bracelet on an elegant cream marble background with soft directional lighting, gentle reflections, magazine-quality product photography",
  },
  perfume: {
    niche: "perfume",
    displayName: "Perfume seller",
    displayNameAr: "بائع عطور",
    hookCaptionAr: "هل أنت بائع عطور؟",
    product: "a tall amber-colored Arabic perfume bottle with a gold cap and gold Arabic calligraphy label",
    shopPrompt:
      "interior of an upscale Saudi perfume boutique, wooden shelves lined with amber and crystal perfume bottles, warm ambient lighting, a glass diffuser releasing visible scent mist",
    beforePrompt:
      "a poorly-lit dim phone photo of an amber Arabic perfume bottle on a cluttered desk, harsh shadows, reflections distorting the gold label, amateur snapshot",
    afterPrompt:
      "a beautifully enhanced studio product shot of the same amber perfume bottle on a soft beige silk background with golden bokeh highlights, gold calligraphy crisp and readable, luxury fragrance ad aesthetic",
  },
  abaya: {
    niche: "abaya",
    displayName: "Abaya seller",
    displayNameAr: "بائعة عبايات",
    hookCaptionAr: "هل أنتِ بائعة عبايات؟",
    product: "a flowing black silk abaya with delicate gold embroidery along the sleeves and hem",
    shopPrompt:
      "interior of a modern Saudi abaya boutique, rows of black abayas hanging on polished wooden hangers, soft beige walls, gentle ambient lighting, a velvet seating bench in soft focus",
    beforePrompt:
      "a poorly-lit dim phone photo of a black abaya on a basic plastic hanger against a plain wall, harsh overhead light, wrinkled fabric, amateur snapshot quality",
    afterPrompt:
      "a beautifully enhanced studio product shot of the same black abaya elegantly displayed on a premium mannequin against an elegant cream marble background, soft side lighting revealing the gold embroidery, editorial fashion photography quality",
  },
  dates: {
    niche: "dates",
    displayName: "Dates / sweets seller",
    displayNameAr: "بائع تمور وحلويات",
    hookCaptionAr: "هل أنت بائع تمور وحلويات؟",
    product: "a wooden box filled with plump Medjool dates arranged in neat rows",
    shopPrompt:
      "interior of a Saudi sweets shop, wooden boxes filled with premium Medjool dates, traditional Arabic sweets like maamoul and baklava arranged on brass trays, warm spotlight on the counter",
    beforePrompt:
      "a poorly-lit dim phone photo of a wooden box of Medjool dates on a kitchen counter, harsh overhead light, unflattering shadows on the dates, amateur snapshot quality",
    afterPrompt:
      "a beautifully enhanced studio product shot of the same wooden box of Medjool dates on a warm beige linen background, soft side lighting revealing the rich caramel tones of the dates, premium gourmet food photography",
  },
  oud: {
    niche: "oud",
    displayName: "Oud / bakhoor seller",
    displayNameAr: "بائع عود وبخور",
    hookCaptionAr: "هل أنت بائع عود وبخور؟",
    product: "a small ornate glass jar of premium oud chips next to a brass bakhoor incense burner",
    shopPrompt:
      "interior of a Saudi oud shop, wooden shelves lined with ornate glass jars of oud chips and bakhoor, a brass mabkhara incense burner releasing visible fragrant smoke, warm amber lighting",
    beforePrompt:
      "a poorly-lit dim phone photo of a glass jar of oud chips and a brass incense burner on a basic wooden table, harsh fluorescent light, unflattering reflections on the glass, amateur snapshot",
    afterPrompt:
      "a beautifully enhanced studio product shot of the same oud jar and brass incense burner on a rich dark walnut background, soft warm directional lighting highlighting the texture of the oud chips and the engraving on the brass, luxury heritage product photography",
  },
  cosmetics: {
    niche: "cosmetics",
    displayName: "Cosmetics seller",
    displayNameAr: "بائعة مستحضرات تجميل",
    hookCaptionAr: "هل أنتِ بائعة مستحضرات تجميل؟",
    product: "a sleek matte rose-gold lipstick tube and a small glass jar of luxury face cream",
    shopPrompt:
      "interior of a modern Saudi cosmetics boutique, white marble counters, sleek display shelves with rose-gold and pearl-white cosmetic packaging, soft pink ambient lighting, large mirrors in soft focus",
    beforePrompt:
      "a poorly-lit dim phone photo of a rose-gold lipstick and small face cream jar on a basic kitchen counter, harsh overhead light, unflattering reflections, amateur snapshot quality",
    afterPrompt:
      "a beautifully enhanced studio product shot of the same rose-gold lipstick and face cream jar on a soft pink marble background with delicate floral petals around them, soft beauty-counter lighting, luxury cosmetics ad quality",
  },
  watches: {
    niche: "watches",
    displayName: "Watches / accessories seller",
    displayNameAr: "بائع ساعات وإكسسوارات",
    hookCaptionAr: "هل أنت بائع ساعات وإكسسوارات؟",
    product: "an elegant men's silver wristwatch with a navy leather strap",
    shopPrompt:
      "interior of an upscale Saudi watch boutique, glass display cases showcasing premium men's wristwatches, polished wooden counters, warm directional spotlights, leather watch boxes stacked artfully",
    beforePrompt:
      "a poorly-lit dim phone photo of a silver wristwatch with navy leather strap on a basic desk, harsh overhead light, reflections distorting the watch face, amateur snapshot",
    afterPrompt:
      "a beautifully enhanced studio product shot of the same silver wristwatch on a rich dark walnut surface with soft directional lighting, the watch face crisp and readable, premium horology magazine quality",
  },
};

/**
 * Day-of-week → niche rotation. Index 0 = Sunday (KSA work week starts Sunday).
 * Mapping was chosen so the heavy-purchase niches (gold, perfume, abaya) land
 * mid-week when scrolling engagement peaks.
 */
const ROTATION: Niche[] = [
  "watches",   // Sun
  "gold",      // Mon
  "perfume",   // Tue
  "abaya",     // Wed
  "dates",     // Thu
  "oud",       // Fri
  "cosmetics", // Sat
];

/**
 * Pick the niche for a given KSA date. Pass the date you want the video to
 * represent; the function reads only year/month/day (timezone-safe).
 */
export function nicheForDate(date: Date): Niche {
  const dow = date.getUTCDay();
  return ROTATION[dow];
}

/**
 * Convenience: today in KSA timezone, normalized to midnight (matches the
 * @db.Date column in Postgres which strips time).
 */
export function todayKsaDate(): Date {
  const now = new Date();
  // KSA is UTC+3, no DST. Shift to KSA wall-clock then strip time.
  const ksaMs = now.getTime() + 3 * 60 * 60 * 1000;
  const ksa = new Date(ksaMs);
  return new Date(Date.UTC(ksa.getUTCFullYear(), ksa.getUTCMonth(), ksa.getUTCDate()));
}
