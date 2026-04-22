import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import { setLanguage, type SupportedLang } from "@/i18n";
import api from "@/lib/api";
import { useSidebarState } from "./sidebarState";

export function TopBar() {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language?.slice(0, 2) || "en") as SupportedLang;
  const { mobileOpen, setMobileOpen } = useSidebarState();

  const handleChange = async (lang: SupportedLang) => {
    if (lang === currentLang) return;
    setLanguage(lang);
    try {
      await api.patch("/user/language", { language: lang });
    } catch { /* non-critical */ }
  };

  return (
    <div className="h-14 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* Hamburger — mobile only; desktop uses the in-sidebar collapse toggle instead */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          className="lg:hidden h-9 w-9 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* Placeholder spacer on desktop so the pill sticks to the right */}
        <div className="hidden lg:block" />
        <LanguagePill currentLang={currentLang} onChange={handleChange} />
      </div>
    </div>
  );
}

function LanguagePill({
  currentLang,
  onChange,
}: {
  currentLang: SupportedLang;
  onChange: (lang: SupportedLang) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Language"
      dir="ltr"
      className="relative inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium select-none"
    >
      {/* Animated selection pill — uses translate instead of position math so
          it transitions smoothly between the two sides. */}
      <span
        aria-hidden="true"
        className={`absolute top-0.5 bottom-0.5 w-[50%] rounded-full bg-white shadow-sm ring-1 ring-slate-200 transition-transform duration-200 ease-out ${
          currentLang === "ar" ? "translate-x-full" : "translate-x-0"
        }`}
        style={{ left: "2px", width: "calc(50% - 2px)" }}
      />
      <button
        type="button"
        onClick={() => onChange("en")}
        aria-pressed={currentLang === "en"}
        className={`relative z-10 px-3 py-1 rounded-full transition-colors ${
          currentLang === "en" ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => onChange("ar")}
        aria-pressed={currentLang === "ar"}
        className={`relative z-10 px-3 py-1 rounded-full transition-colors ${
          currentLang === "ar" ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        AR
      </button>
    </div>
  );
}
