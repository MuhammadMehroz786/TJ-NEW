/**
 * Bilingual EN/AR strings for the WhatsApp bot. Each key maps to a pair; the
 * runtime helper `t(lang, key, vars)` picks the right one and interpolates
 * `{placeholders}`.
 *
 * Rules:
 * - Arabic strings are RTL-friendly, use Arabic digits where appropriate.
 * - Emoji works identically in both scripts.
 * - Slash commands stay ASCII on both sides (`/help`, `/start`, etc.) — we
 *   don't translate command names, users type them the same way.
 * - Example hints (e.g. "_clean white studio_") are untranslated markdown
 *   italics so users can copy-paste if they prefer.
 */

export type Lang = "en" | "ar";

type Dict = Record<string, { en: string; ar: string }>;

const dict: Dict = {
  // ── Welcome / account choice ───────────────────────────────────────────────
  welcome_body: {
    en: "Welcome to TijarFlow AI Assistant! 🛍️\n\nSend us your product photos and we'll enhance them with a professional studio background.\n\nAre you already registered on TijarFlow as a merchant?",
    ar: "أهلاً بك في مساعد تجار فلو الذكي! 🛍️\n\nأرسل لنا صور منتجاتك وسنحسّنها بخلفية استوديو احترافية.\n\nهل أنت مسجّل مسبقاً في تجار فلو كتاجر؟",
  },
  btn_registered_yes: { en: "Yes, I'm registered", ar: "نعم، أنا مسجّل" },
  btn_registered_no: { en: "No, use free trial", ar: "لا، جرّب مجاناً" },

  // ── Language gate (new) ────────────────────────────────────────────────────
  language_gate: {
    en: "👋 Welcome to TijarFlow! Please pick your language:\n\n*1* · English\n*2* · العربية\n\nReply with 1 or 2.",
    ar: "👋 أهلاً بك في تجار فلو! الرجاء اختيار اللغة:\n\n*1* · English\n*2* · العربية\n\nردّ بـ 1 أو 2.",
  },
  language_set_en: {
    en: "✅ English selected.",
    ar: "✅ تم اختيار الإنجليزية.",
  },
  language_set_ar: {
    en: "✅ Arabic selected.",
    ar: "✅ تم اختيار العربية.",
  },

  // ── Help ───────────────────────────────────────────────────────────────────
  help: {
    en:
      "🤖 *TijarFlow Bot Commands*\n\n" +
      "/start — Restart the conversation\n" +
      "/clear — Reset your session\n" +
      "/credits — Check your credit balance\n" +
      "/new — Start fresh with a new image\n" +
      "/language — Change language (EN/AR)\n" +
      "/logout — Unlink your merchant account\n" +
      "/help — Show this menu\n\n" +
      "📸 *How to use:*\n" +
      "• Send one or multiple product images — I'll enhance them all together after 5 seconds.\n" +
      "• *Reply* to any enhanced image with instructions like _make background darker_ to refine just that one.\n" +
      "• Or type a new refinement to tweak your most recent image.",
    ar:
      "🤖 *أوامر مساعد تجار فلو*\n\n" +
      "/start — إعادة بدء المحادثة\n" +
      "/clear — إعادة تعيين الجلسة\n" +
      "/credits — عرض رصيد الإشتراك\n" +
      "/new — بدء محادثة جديدة بصورة جديدة\n" +
      "/language — تغيير اللغة (EN/AR)\n" +
      "/logout — إلغاء ربط حساب التاجر\n" +
      "/help — عرض هذه القائمة\n\n" +
      "📸 *طريقة الاستخدام:*\n" +
      "• أرسل صورة أو عدة صور للمنتج — سأحسّنها جميعاً بعد ٥ ثوانٍ من توقّف الإرسال.\n" +
      "• *ردّ* على أي صورة محسّنة بتعليمات مثل _اجعل الخلفية أغمق_ لتعديل تلك الصورة تحديداً.\n" +
      "• أو اكتب تعديلاً جديداً لتحسين آخر صورة.",
  },

  // ── Command responses ──────────────────────────────────────────────────────
  session_reset_logged_in: {
    en: "✅ Session reset — you're still logged in.\n\nSend your product image(s) or type /help.",
    ar: "✅ تم إعادة تعيين الجلسة — لا تزال مسجّل الدخول.\n\nأرسل صور منتجاتك أو اكتب /help.",
  },
  credits_guest: {
    en: "💳 Guest credits: *{remaining}* of {limit} remaining.\n\nType /start to link a merchant account.",
    ar: "💳 أرصدة الضيف: *{remaining}* من أصل {limit}.\n\nاكتب /start لربط حساب تاجر.",
  },
  credits_verified: {
    en: "💳 *Your credit balance*\n• Weekly: {weekly} (resets Monday)\n• Purchased: {purchased}\n• Total: {total}",
    ar: "💳 *رصيد حسابك*\n• الأسبوعي: {weekly} (يتجدد يوم الاثنين)\n• المشترى: {purchased}\n• المجموع: {total}",
  },
  credits_fetch_failed: {
    en: "Could not fetch your credit balance. Please try again.",
    ar: "تعذّر جلب رصيدك. حاول مرة أخرى.",
  },
  logged_out: {
    en: "✅ You've been logged out. Type /start to begin again.",
    ar: "✅ تم تسجيل خروجك. اكتب /start للبدء من جديد.",
  },
  unknown_command: {
    en: "Unknown command: {cmd}\n\nType /help to see available commands.",
    ar: "أمر غير معروف: {cmd}\n\nاكتب /help لرؤية الأوامر المتاحة.",
  },

  // ── /new and refinement ────────────────────────────────────────────────────
  new_image_ready_verified: {
    en: "✨ Ready for a new image. Send your next product photo.",
    ar: "✨ جاهز لصورة جديدة. أرسل صورة المنتج التالية.",
  },
  new_image_ready_guest: {
    en: "✨ Ready for a new image. Send your next product photo. *{remaining}* free enhancement{plural} remaining.",
    ar: "✨ جاهز لصورة جديدة. أرسل صورة المنتج التالية. *{remaining}* تحسين{plural} مجاني متبقي.",
  },

  // ── Email / OTP verification flow ──────────────────────────────────────────
  enter_email: {
    en: "Please enter the email address you used to register on TijarFlow. We'll send a 6-digit code to verify it's you.",
    ar: "الرجاء إدخال البريد الإلكتروني المسجّل في تجار فلو. سنرسل رمزاً من 6 أرقام للتحقق.",
  },
  enter_email_text_only: {
    en: "Please type your registered TijarFlow merchant email address.",
    ar: "الرجاء كتابة بريدك الإلكتروني المسجّل كتاجر في تجار فلو.",
  },
  email_not_found_final: {
    en: "We could not find a merchant account with that email after 3 attempts.\n\nType /start to try again or visit {signup} to create an account.",
    ar: "لم نعثر على حساب تاجر بهذا البريد بعد 3 محاولات.\n\nاكتب /start للمحاولة مجدداً أو زر {signup} لإنشاء حساب.",
  },
  email_not_found_retry: {
    en: "❌ No merchant account found for that email. {left} attempt{plural} remaining.",
    ar: "❌ لا يوجد حساب تاجر بهذا البريد. {left} محاولة{plural} متبقية.",
  },
  otp_email_send_failed: {
    en: "⚠️ We can't send verification emails right now. Please try again in a few minutes or contact support.",
    ar: "⚠️ تعذّر إرسال رموز التحقق الآن. حاول بعد قليل أو تواصل مع الدعم.",
  },
  otp_sent: {
    en: "📧 A 6-digit verification code has been sent to *{email}*.\n\nReply with the code to link your account (valid for {ttl} minutes).",
    ar: "📧 تم إرسال رمز تحقق من 6 أرقام إلى *{email}*.\n\nردّ بالرمز لربط حسابك (صالح لمدة {ttl} دقائق).",
  },
  otp_enter_digits: {
    en: "Please enter the 6-digit verification code sent to your email.",
    ar: "الرجاء إدخال رمز التحقق المكوّن من 6 أرقام المرسل إلى بريدك.",
  },
  otp_must_be_6: {
    en: "The code must be 6 digits. Please try again.",
    ar: "يجب أن يكون الرمز مكوّن من 6 أرقام. حاول مرة أخرى.",
  },
  otp_expired: {
    en: "⏰ That code has expired. Type /start to try again.",
    ar: "⏰ انتهت صلاحية الرمز. اكتب /start للمحاولة من جديد.",
  },
  otp_too_many_attempts: {
    en: "❌ Too many invalid codes. Type /start to begin again.",
    ar: "❌ محاولات خاطئة كثيرة. اكتب /start للبدء من جديد.",
  },
  otp_incorrect: {
    en: "❌ Incorrect code. {left} attempt{plural} remaining.",
    ar: "❌ رمز غير صحيح. {left} محاولة{plural} متبقية.",
  },
  account_unavailable: {
    en: "That account is no longer available. Type /start to try again.",
    ar: "هذا الحساب لم يعد متاحاً. اكتب /start للمحاولة من جديد.",
  },
  verified_welcome: {
    en: "✅ Welcome back, {name}! Your account is now linked.{creditsInfo}\n\nSend your product image(s). After you're done I'll ask what theme to apply.",
    ar: "✅ أهلاً بعودتك يا {name}! تم ربط حسابك.{creditsInfo}\n\nأرسل صور منتجاتك. بعدها سأسألك عن الثيم المطلوب.",
  },
  credits_info_verified: {
    en: "\n\n💳 Credits: {weekly} weekly{purchased}.",
    ar: "\n\n💳 الأرصدة: {weekly} أسبوعي{purchased}.",
  },
  credits_info_purchased_suffix: {
    en: " + {purchased} purchased",
    ar: " + {purchased} مشترى",
  },

  // ── Guest trial ────────────────────────────────────────────────────────────
  guest_trial_started: {
    en: "Great! You have *{remaining}* free AI enhancement{plural} left. 🎨\n\nSend me your product image(s) — one or many. After I receive them I'll ask what theme to apply.",
    ar: "رائع! متبقي لديك *{remaining}* تحسين{plural} مجاني. 🎨\n\nأرسل لي صور منتجاتك — واحدة أو أكثر. بعدها سأسألك عن الثيم المطلوب.",
  },
  guest_trial_exhausted: {
    en: "You've already used your 5 free enhancements. 🎉\n\nSign up for TijarFlow to get 50 AI credits every week:\n{signup}\n\nOr type /start and pick \"Yes, I'm registered\" to link an existing account.",
    ar: "لقد استخدمت التحسينات الخمسة المجانية. 🎉\n\nسجّل في تجار فلو للحصول على 50 رصيد ذكاء اصطناعي كل أسبوع:\n{signup}\n\nأو اكتب /start واختر \"نعم، أنا مسجّل\" لربط حساب موجود.",
  },
  guest_exhausted_inline: {
    en: "Your 5 free enhancements are used up! 🎉\n\nSign up for TijarFlow to get 50 AI credits every week:\n{signup}\n\nAlready have an account? Type /start and pick \"Yes, I'm registered\".",
    ar: "انتهت تحسيناتك المجانية الخمسة! 🎉\n\nسجّل في تجار فلو للحصول على 50 رصيد كل أسبوع:\n{signup}\n\nلديك حساب مسبقاً؟ اكتب /start واختر \"نعم، أنا مسجّل\".",
  },
  guest_remaining_hint: {
    en: "You have *{remaining}* free enhancement{plural} remaining.\n\nSend a product image to use one! 📸",
    ar: "متبقي لديك *{remaining}* تحسين{plural} مجاني.\n\nأرسل صورة منتج لاستخدام واحد! 📸",
  },
  verified_idle_prompt: {
    en: "✅ Send your product image(s) — one or many. After I receive them I'll ask what theme to apply.\n\nType /help for commands.",
    ar: "✅ أرسل صور منتجاتك — واحدة أو أكثر. بعدها سأسألك عن الثيم المطلوب.\n\nاكتب /help لرؤية الأوامر.",
  },

  // ── Batch collection + theme ask ───────────────────────────────────────────
  batch_first_image: {
    en: "✨ Got your image! Send more if you want — I'll ask for the theme after a few seconds of silence.",
    ar: "✨ وصلتني صورتك! أرسل المزيد إذا أردت — سأسألك عن الثيم بعد توقّف الإرسال بعدة ثوانٍ.",
  },
  ask_theme: {
    en: "Got {count} image{plural}! 📸\n\nWhat theme or background would you like?\n\nExamples:\n• _clean white studio_\n• _marble kitchen counter_\n• _outdoor sunset scene_\n• _minimal black background_\n\nSend your theme as a text message.",
    ar: "وصلتني {count} صورة{plural}! 📸\n\nما الثيم أو الخلفية التي تريدها؟\n\nأمثلة:\n• _استوديو أبيض نظيف_\n• _طاولة مطبخ رخامية_\n• _مشهد غروب في الخارج_\n• _خلفية سوداء بسيطة_\n\nأرسل الثيم كرسالة نصية.",
  },
  theme_text_only: {
    en: "Please describe the theme as a text message. Example: _clean white studio background_",
    ar: "الرجاء وصف الثيم برسالة نصية. مثال: _خلفية استوديو بيضاء_",
  },
  theme_too_short: {
    en: "Please provide a more descriptive theme (at least 3 characters).",
    ar: "الرجاء تقديم وصف أكثر تفصيلاً (3 أحرف على الأقل).",
  },
  theme_no_images: {
    en: "I don't have any pending images — please send an image first.",
    ar: "لا توجد صور معلّقة — الرجاء إرسال صورة أولاً.",
  },
  batch_added: {
    en: "✨ Added to your batch ({count} total). Send the theme text to start enhancement.",
    ar: "✨ تمت الإضافة إلى الدفعة ({count} إجمالاً). أرسل نص الثيم لبدء التحسين.",
  },

  // ── Enhancement processing & results ───────────────────────────────────────
  enhancing_count: {
    en: "🎨 Enhancing {count} image{plural}... This may take a moment.",
    ar: "🎨 جارٍ تحسين {count} صورة{plural}... قد يستغرق هذا لحظة.",
  },
  enhancing_count_partial: {
    en: "🎨 Enhancing {enhanceCount} of {total} images ({skipped} skipped — not enough credits). This may take a moment...",
    ar: "🎨 جارٍ تحسين {enhanceCount} من أصل {total} ({skipped} تم تخطيها — رصيد غير كافٍ). قد يستغرق هذا لحظة...",
  },
  caption_image_of: {
    en: "Image {i} of {total}",
    ar: "الصورة {i} من {total}",
  },
  credits_exhausted_weekly: {
    en: "⚠️ You've used all your AI credits for this week. They reset every Monday.\n\nVisit {signup} to purchase more credits.",
    ar: "⚠️ استخدمت كل أرصدة هذا الأسبوع. يتجدد الرصيد يوم الاثنين.\n\nزر {signup} لشراء المزيد.",
  },

  // ── Summary footers after batch ────────────────────────────────────────────
  summary_enhanced: { en: "✅ {n} enhanced", ar: "✅ {n} تم تحسينها" },
  summary_failed: { en: "⚠️ {n} failed", ar: "⚠️ {n} فشلت" },
  summary_skipped: { en: "⏭️ {n} skipped (no credits)", ar: "⏭️ {n} تم تخطيها (لا رصيد)" },
  summary_done_fallback: { en: "Done", ar: "تم" },
  summary_footer_verified: {
    en: "\n\n💳 Credits left: {weekly} weekly{purchased}.\n\n💡 *Reply* to any image above to refine just that one, or type /new to start over.",
    ar: "\n\n💳 الرصيد المتبقي: {weekly} أسبوعي{purchased}.\n\n💡 *ردّ* على أي صورة لتحسينها فقط، أو اكتب /new للبدء من جديد.",
  },
  summary_footer_guest: {
    en: "\n\n💳 Free enhancements left: {remaining}.\n\n💡 *Reply* to any image above to refine just that one, or type /new to start over.",
    ar: "\n\n💳 التحسينات المجانية المتبقية: {remaining}.\n\n💡 *ردّ* على أي صورة لتحسينها فقط، أو اكتب /new للبدء من جديد.",
  },

  // ── Errors ─────────────────────────────────────────────────────────────────
  enhance_failed_generic: {
    en: "Sorry, we could not enhance your image right now. Please try again.",
    ar: "عذراً، تعذّر تحسين الصورة الآن. حاول مرة أخرى.",
  },
  refine_applying: {
    en: "🎨 Applying your refinement... one moment.",
    ar: "🎨 جارٍ تطبيق التعديل... لحظة واحدة.",
  },
  refine_no_source: {
    en: "I don't have the previous image anymore. Send a new product photo to start fresh.",
    ar: "لم تعد لديّ الصورة السابقة. أرسل صورة منتج جديدة للبدء من جديد.",
  },
  refine_failed: {
    en: "Sorry, I couldn't apply that refinement. Try rephrasing it, or send a new image.",
    ar: "عذراً، لم أستطع تطبيق التعديل. أعد صياغته أو أرسل صورة جديدة.",
  },
  refine_applied_verified: {
    en: "✅ Refinement applied. Credits remaining: {weekly} weekly{purchased}.",
    ar: "✅ تم تطبيق التعديل. الرصيد المتبقي: {weekly} أسبوعي{purchased}.",
  },
  refine_applied_guest: {
    en: "✅ Refinement applied. *{remaining}* free enhancement{plural} remaining.",
    ar: "✅ تم تطبيق التعديل. متبقي *{remaining}* تحسين{plural} مجاني.",
  },
  refine_applied_fallback: {
    en: "✅ Refinement applied.",
    ar: "✅ تم تطبيق التعديل.",
  },

  // ── Refinement quick-reply buttons body text ───────────────────────────────
  refinement_buttons_body: {
    en: "Want to tweak it? Pick a quick refinement or type your own (e.g. _brighter lighting_, _closer crop_, _warmer tones_).",
    ar: "تريد تعديلها؟ اختر تحسيناً سريعاً أو اكتب تعديلك (مثل _إضاءة أوضح_، _قصّ أقرب_، _ألوان أدفأ_).",
  },
  btn_refine_bg: { en: "Change background", ar: "تغيير الخلفية" },
  btn_refine_light: { en: "Softer lighting", ar: "إضاءة أنعم" },
  btn_refine_new: { en: "New image", ar: "صورة جديدة" },

  refine_hint_fallback: {
    en: "Type a refinement (e.g. _brighter_), tap a button, or send a new image. /new to start over.",
    ar: "اكتب تعديلاً (مثل _أوضح_)، أو اضغط زراً، أو أرسل صورة جديدة. /new للبدء من جديد.",
  },
  post_enh_followup: {
    en: "✨ Send your next product image.",
    ar: "✨ أرسل صورة منتجك التالية.",
  },
  post_enh_followup_guest: {
    en: "✨ Send your next product image. *{remaining}* free enhancement{plural} remaining.",
    ar: "✨ أرسل صورة منتجك التالية. متبقي *{remaining}* تحسين{plural} مجاني.",
  },
};

// ── Runtime helpers ──────────────────────────────────────────────────────────

function isLang(x: string | null | undefined): x is Lang {
  return x === "en" || x === "ar";
}

function pluralHint(n: number): string {
  // For Arabic, we keep a single "تحسين" and the spec is good enough to drop
  // the "s"; full plural rules are more complex but not worth it here.
  return n === 1 ? "" : "s";
}

export function resolveLang(x: string | null | undefined): Lang {
  return isLang(x) ? x : "en";
}

export function t(lang: Lang | string | null | undefined, key: keyof typeof dict, vars?: Record<string, string | number>): string {
  const l = resolveLang(lang);
  const entry = dict[key];
  if (!entry) return `[${String(key)}]`;
  let s = entry[l] ?? entry.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  // Auto-plural: if `{plural}` placeholder survived, drop it (ar & en=1) or to "s"
  if (vars && "plural" in vars === false && s.includes("{plural}")) {
    s = s.replace(/\{plural\}/g, "");
  }
  return s;
}

// Convenience: produce the {plural} value for a given count
export function plural(n: number, lang: Lang | string | null | undefined): string {
  const l = resolveLang(lang);
  if (l === "ar") return ""; // Arabic plural handling simplified
  return pluralHint(n);
}
