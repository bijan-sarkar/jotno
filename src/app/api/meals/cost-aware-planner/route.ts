import { NextRequest, NextResponse } from "next/server";
import { estimateRecipeCost, formatCost } from "@/lib/pricing/cost-estimator";
import { queryNutritionSources } from "@/lib/rag/nutrition-fetcher";

interface MealPlanRequest {
  budget_limit_usd?: number;
  available_ingredients?: string[];
  dietary_focus?: "strict_glycemic_control" | "high_protein" | "cardioprotective";
  target_calories?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: MealPlanRequest = await req.json();
    const budgetLimit = body.budget_limit_usd || 4.50;
    const focus = body.dietary_focus || "strict_glycemic_control";

    // Representative diabetic-safe ingredients with suggested gram weights
    const plannedIngredients = [
      { name: "bitter gourd", amount_g: 150 },
      { name: "red lentils", amount_g: 120 },
      { name: "spinach", amount_g: 100 },
      { name: "green chilies", amount_g: 15 },
      { name: "mustard oil", amount_g: 15 },
    ];

    // If user provided available ingredients, mix them in safely
    if (body.available_ingredients && body.available_ingredients.length > 0) {
      body.available_ingredients.forEach((ing) => {
        if (!plannedIngredients.some((p) => p.name.toLowerCase().includes(ing.toLowerCase()))) {
          plannedIngredients.push({ name: ing, amount_g: 100 });
        }
      });
    }

    // 1. Calculate Cost with Kaggle benchmark estimator
    const costEstimate = await estimateRecipeCost(plannedIngredients);

    // 2. Query RAG Nutrition for primary components
    const primaryNutrition = await queryNutritionSources("red lentils");
    const veggieNutrition = await queryNutritionSources("bitter gourd");

    const totalProtein = (primaryNutrition[0]?.protein_g || 9) * 1.2 + (veggieNutrition[0]?.protein_g || 1) * 1.5;
    const totalFiber = (primaryNutrition[0]?.fiber_g || 8) * 1.2 + (veggieNutrition[0]?.fiber_g || 3) * 1.5;

    const withinBudget = costEstimate.total_cost_usd <= budgetLimit;

    return NextResponse.json({
      success: true,
      data: {
        recipe_title: "Budget-Optimized Karela & Masoor Dal Thali",
        dietary_focus: focus,
        target_budget_usd: budgetLimit,
        target_budget_bdt: Math.round(budgetLimit * 120),
        total_estimated_cost_usd: costEstimate.total_cost_usd,
        total_estimated_cost_bdt: costEstimate.total_cost_bdt,
        formatted_cost: formatCost(costEstimate.total_cost_usd),
        formatted_cost_bdt: `৳${costEstimate.total_cost_bdt} টাকা`,
        currency: "BDT",
        within_budget: withinBudget,
        budget_tier: costEstimate.budgetTier,
        cost_breakdown: costEstimate.breakdown,
        clinical_sequencing: [
          {
            step: 1,
            phase: "Fiber Preload",
            item: "Sautéed Bitter Gourd with Turmeric",
            instruction: "Consume first to coat the intestinal villi and blunt glucose absorption.",
          },
          {
            step: 2,
            phase: "Protein Buffer",
            item: "Slow-Simmered Red Lentil Soup with Spinach",
            instruction: "Consume second to stimulate GLP-1 and satiety hormones.",
          },
          {
            step: 3,
            phase: "Controlled Complex Starch",
            item: "Optional 1/2 cup parboiled brown rice (if caloric target allows)",
            instruction: "Consume last and keep serving strictly under 50g net carbs.",
          },
        ],
        nutritional_summary: {
          estimated_calories: 340,
          protein_g: Math.round(totalProtein),
          fiber_g: Math.round(totalFiber),
          net_carbs_g: 38,
          glycemic_index_rating: "low (GI < 35)",
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
