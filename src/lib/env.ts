/**
 * Jotno Environment Configuration Helper
 * Provides typed access and validation status for core external services.
 */

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  edamamAppId: process.env.EDAMAM_APP_ID || "",
  edamamAppKey: process.env.EDAMAM_APP_KEY || "",
  usdaFooddataApiKey: process.env.USDA_FOODDATA_API_KEY || "",
  nutriticsApiKey: process.env.NUTRITICS_API_KEY || "",
  openFoodFactsUserAgent: process.env.OPEN_FOOD_FACTS_USER_AGENT || "GlucoVision-App/1.0",
} as const;

export function isPlaceholder(val: string): boolean {
  if (!val) return true;
  return val.includes("placeholder") || val.includes("your_");
}

export function getSystemEnvStatus() {
  const isSupabaseReady =
    Boolean(env.supabaseUrl) &&
    Boolean(env.supabaseAnonKey) &&
    !isPlaceholder(env.supabaseUrl) &&
    !isPlaceholder(env.supabaseAnonKey);

  const isGeminiReady =
    Boolean(env.geminiApiKey) && !isPlaceholder(env.geminiApiKey);

  return {
    supabase: {
      configured: Boolean(env.supabaseUrl && env.supabaseAnonKey),
      isLive: isSupabaseReady,
      url: env.supabaseUrl,
    },
    gemini: {
      configured: Boolean(env.geminiApiKey),
      isLive: isGeminiReady,
    },
    appUrl: env.appUrl,
  };
}
