export const THEME_STORAGE_KEY = "elhadidy-theme-mode";

export const webThemes = {
  dark: {
    mode: "dark",
    bg: "#000000",        // أسود صريح للخلفية ليعطي فخامة مطلقة
    surface: "#0a0a0a",   // أسود فاتح قليلاً لتمييز البطاقات
    surfaceAlt: "#121212", 
    card: "#0d0d0d",
    border: "#1c1c1c",    // حدود رمادية داكنة جداً
    borderSoft: "#262626",
    text: "#ffffff",      // أبيض نقي (أعلى درجة وضوح للخطوط)
    subText: "#d1d1d1",   // رمادي فاتح جداً (واضح تماماً للقراءة)
    muted: "#888888",     // رمادي متوسط
    accent: "#D4AF37",    // الذهبي الأساسي (اللامع)
    accentAlt: "#B8860B", // الذهبي العميق (للظلال)
    danger: "#ff4444",
    success: "#00c851",
    info: "#33b5e5",
    buttonText: "#000000", // نص أسود على الزر الذهبي ليكون حاد الوضوح
    overlay: "rgba(0,0,0,0.98)",
    gradient: "linear-gradient(135deg, #D4AF37, #B8860B)",
    panelGradient: "linear-gradient(135deg, #1a1a1a, #000000)",
  },
  light: {
    mode: "light",
    bg: "#ffffff",        // أبيض نقي
    surface: "#fcfcfc", 
    surfaceAlt: "#f5f5f5", 
    card: "#ffffff",
    border: "#e0e0e0", 
    borderSoft: "#f0f0f0",
    text: "#000000",      // أسود صريح للنصوص
    subText: "#444444", 
    muted: "#777777",
    accent: "#B8860B", 
    accentAlt: "#D4AF37", 
    danger: "#cc0000",
    success: "#007e33",
    info: "#0099cc",
    buttonText: "#ffffff", 
    overlay: "rgba(255,255,255,0.95)",
    gradient: "linear-gradient(135deg, #D4AF37, #B8860B)",
    panelGradient: "linear-gradient(135deg, #ffffff, #f0f0f0)",
  },
};

export const mobileThemes = {
  dark: {
    mode: "dark",
    bg: "#000000",
    card: "#0d0d0d",
    cardAlt: "#121212",
    border: "#1c1c1c",
    borderSoft: "#262626",
    text: "#ffffff",      // خطوط بيضاء ناصعة
    subText: "#d1d1d1", 
    muted: "#888888",
    accent: "#D4AF37",
    accentAlt: "#B8860B",
    danger: "#ff4444",
    success: "#00c851",
    info: "#33b5e5",
    headerStart: "#000000",
    headerEnd: "#121212",
    buttonText: "#000000",
  },
  light: {
    mode: "light",
    bg: "#ffffff",
    card: "#ffffff",
    cardAlt: "#f5f5f5",
    border: "#e0e0e0",
    borderSoft: "#f0f0f0",
    text: "#000000",
    subText: "#444444",
    muted: "#777777",
    accent: "#B8860B",
    accentAlt: "#D4AF37",
    danger: "#cc0000",
    success: "#007e33",
    info: "#0099cc",
    headerStart: "#ffffff",
    headerEnd: "#f5f5f5",
    buttonText: "#ffffff",
  },
};

export function resolveWebTheme(mode) {
  return webThemes[mode] || webThemes.dark;
}

export function resolveMobileTheme(mode) {
  return mobileThemes[mode] || mobileThemes.dark;
}