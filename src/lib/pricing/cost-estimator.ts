import { createClient } from "@supabase/supabase-js";
import { env, getSystemEnvStatus } from "@/lib/env";

export interface IngredientCostDetail {
  ingredient: string;
  quantity_g: number;
  estimated_cost_usd: number;
  estimated_cost_bdt: number;
  unit_price_per_kg_usd: number;
  unit_price_per_kg_bdt: number;
  source: string;
}

export interface RecipeCostEstimate {
  total_cost_usd: number;
  total_cost_bdt: number;
  breakdown: IngredientCostDetail[];
  currency: string;
  currency_symbol: string;
  budget_tier: "budget_friendly" | "moderate" | "premium";
  budgetTier: "budget_friendly" | "moderate" | "premium";
}

/**
 * Built-in Kaggle Global Food Prices benchmark dictionary.
 * Price reference in USD per kilogram (or liter/unit).
 */
const KAGGLE_PRICE_BENCHMARKS: Record<string, number> = {
  "red lentils": 1.80,
  "masoor dal": 1.80,
  "lentils": 1.75,
  "dal": 1.75,
  "bitter gourd": 1.40,
  "karela": 1.40,
  "spinach": 1.20,
  "palak": 1.20,
  "white potatoes": 0.85,
  "potatoes": 0.85,
  "potato": 0.85,
  "white rice": 1.10,
  "rice": 1.10,
  "brown rice": 1.60,
  "green chilies": 2.10,
  "chilies": 2.10,
  "onion": 0.90,
  "onions": 0.90,
  "garlic": 3.20,
  "ginger": 2.80,
  "chicken breast": 4.50,
  "chicken": 4.20,
  "eggs": 2.40, // ~12 eggs per kg
  "egg": 2.40,
  "mustard oil": 2.40,
  "olive oil": 6.50,
  "oil": 2.50,
  "okra": 1.50,
  "bhindi": 1.50,
  "cucumber": 0.95,
  "tomatoes": 1.30,
  "tomato": 1.30,
  "fish": 5.20,
  "salmon": 9.50,
  "turmeric": 4.00,
  "salt": 0.40,
  "flour": 0.80,
  "atta": 0.85,
};

function getLocalBenchmarkPrice(name: string): number {
  const lower = name.toLowerCase().trim();
  for (const [key, price] of Object.entries(KAGGLE_PRICE_BENCHMARKS)) {
    if (lower.includes(key) || key.includes(lower)) {
      return price;
    }
  }
  return 2.50; // Default reference price: $2.50 / kg
}

export async function estimateRecipeCost(
  ingredients: { name: string; amount_g: number }[]
): Promise<RecipeCostEstimate> {
  let totalCost = 0;
  const breakdown: IngredientCostDetail[] = [];

  const envStatus = getSystemEnvStatus();
  const isSupabaseUsable =
    envStatus.supabase.isLive &&
    Boolean(env.supabaseServiceRoleKey) &&
    !env.supabaseServiceRoleKey.includes("placeholder");

  let supabaseClient: ReturnType<typeof createClient> | null = null;
  if (isSupabaseUsable) {
    try {
      supabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
    } catch {
      supabaseClient = null;
    }
  }

  for (const item of ingredients) {
    let pricePerKg = getLocalBenchmarkPrice(item.name);
    let source = "kaggle_global_benchmark";

    // Attempt querying Supabase price benchmarks if available
    if (supabaseClient) {
      try {
        const queryResult = (await supabaseClient
          .from("ingredient_price_benchmarks")
          .select("average_unit_price, standard_unit")
          .ilike("ingredient_key", `%${item.name.toLowerCase()}%`)
          .limit(1)
          .maybeSingle()) as { data: { average_unit_price?: number | string } | null };

        if (queryResult.data?.average_unit_price) {
          pricePerKg = Number(queryResult.data.average_unit_price);
          source = "supabase_price_benchmarks";
        }
      } catch {
        // Fall back cleanly to Kaggle local benchmark
      }
    }

    const BDT_PER_USD = 120;
    const costUsd = (item.amount_g / 1000) * pricePerKg;
    const costBdt = Math.round(costUsd * BDT_PER_USD);
    const unitPriceBdt = Math.round(pricePerKg * BDT_PER_USD);
    totalCost += costUsd;

    breakdown.push({
      ingredient: item.name,
      quantity_g: item.amount_g,
      estimated_cost_usd: parseFloat(costUsd.toFixed(2)),
      estimated_cost_bdt: costBdt,
      unit_price_per_kg_usd: parseFloat(pricePerKg.toFixed(2)),
      unit_price_per_kg_bdt: unitPriceBdt,
      source,
    });
  }

  const BDT_PER_USD = 120;
  const finalTotal = parseFloat(totalCost.toFixed(2));
  const finalTotalBdt = Math.round(finalTotal * BDT_PER_USD);

  let budgetTier: "budget_friendly" | "moderate" | "premium" = "moderate";
  if (finalTotal < 2.50) {
    budgetTier = "budget_friendly";
  } else if (finalTotal > 6.00) {
    budgetTier = "premium";
  }

  return {
    total_cost_usd: finalTotal,
    total_cost_bdt: finalTotalBdt,
    breakdown,
    currency: "BDT",
    currency_symbol: "৳",
    budget_tier: budgetTier,
    budgetTier,
  };
}

export function formatCost(amount: number, currency: string = "USD"): string {
  if (currency === "BDT" || currency === "taka" || currency === "Tk") {
    return `৳${Math.round(amount).toLocaleString("en-IN")}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatBdt(amountInTaka: number): string {
  return `৳${Math.round(amountInTaka).toLocaleString("en-IN")}`;
}
