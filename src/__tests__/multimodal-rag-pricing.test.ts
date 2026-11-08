import { describe, it, expect } from "vitest";
import { queryNutritionSources } from "@/lib/rag/nutrition-fetcher";
import { estimateRecipeCost, formatCost } from "@/lib/pricing/cost-estimator";
import { POST as multimodalHandler } from "@/app/api/scanner/multimodal/route";
import { POST as costPlannerHandler } from "@/app/api/meals/cost-aware-planner/route";
import { GET as nutritionLookupHandler } from "@/app/api/rag/nutrition-lookup/route";
import { NextRequest } from "next/server";

describe("GlucoVision Multimodal RAG & Cost Engine Suite", () => {
  describe("Phase B: Multi-Source Nutrition Fetcher (RAG Adapter)", () => {
    it("should retrieve clinical baseline nutrition for diabetic staples (e.g., lentils, bitter gourd)", async () => {
      const results = await queryNutritionSources("red lentils");
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      const top = results[0];
      expect(top.name.toLowerCase()).toContain("lentil");
      expect(top.protein_g).toBeGreaterThan(5);
      expect(top.fiber_g).toBeGreaterThan(5);
      expect(top.glycemic_index_est).toBeLessThanOrEqual(55); // low glycemic
    });

    it("should retrieve bitter gourd with low glycemic index", async () => {
      const results = await queryNutritionSources("bitter gourd");
      expect(results.length).toBeGreaterThan(0);
      const bg = results[0];
      expect(bg.glycemic_index_est).toBeLessThanOrEqual(20);
      expect(bg.glycemic_load_est).toBeLessThanOrEqual(5);
    });

    it("should provide graceful fallback estimation for unrecognized food queries", async () => {
      const results = await queryNutritionSources("unknown-rare-berry-x99");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].calories).toBeGreaterThan(0);
      expect(results[0].source).toBe("estimated_clinical_model");
    });
  });

  describe("Phase E: Kaggle Price Benchmark Cost Estimator", () => {
    it("should estimate cost breakdown and total USD for recipe ingredients", async () => {
      const ingredients = [
        { name: "red lentils", amount_g: 200 }, // 0.2 kg * 1.80 = 0.36
        { name: "spinach", amount_g: 300 },    // 0.3 kg * 1.20 = 0.36
        { name: "bitter gourd", amount_g: 250 },// 0.25 kg * 1.40 = 0.35
      ];

      const cost = await estimateRecipeCost(ingredients);
      expect(cost.total_cost_usd).toBeGreaterThan(0.5);
      expect(cost.total_cost_usd).toBeLessThan(3.0);
      expect(cost.budgetTier).toBe("budget_friendly");
      expect(cost.breakdown.length).toBe(3);
      expect(cost.breakdown[0].estimated_cost_usd).toBeGreaterThan(0);
    });

    it("should format cost strings into proper currency format", () => {
      const formatted = formatCost(3.45);
      expect(formatted).toBe("$3.45");
    });
  });

  describe("Phase C: Multimodal Scanner API Endpoint", () => {
    it("should process grocery_bazaar scan mode with RAG enrichment and cost estimate", async () => {
      const req = new NextRequest("http://localhost:3000/api/scanner/multimodal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_mode: "grocery_bazaar",
          query: "What are the safest items here for my glucose?",
          imageBase64: "mock-preset",
        }),
      });

      const res = await multimodalHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.identified_items.length).toBeGreaterThan(0);
      expect(json.data.nutritional_summary).toBeDefined();
      expect(json.data.health_risk_alerts.length).toBeGreaterThan(0);
      expect(json.data.recipe_or_menu_suggestions.length).toBeGreaterThan(0);
      expect(json.data.voice_assistant_response.length).toBeGreaterThan(10);
      expect(json.data.cost_estimate).toBeDefined();
    });

    it("should process restaurant_menu mode and provide waiter customization scripts", async () => {
      const req = new NextRequest("http://localhost:3000/api/scanner/multimodal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_mode: "restaurant_menu",
          query: "Which dishes are dangerous for diabetes?",
          imageBase64: "mock-preset",
        }),
      });

      const res = await multimodalHandler(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.recipe_or_menu_suggestions.some((s: { title: string }) => s.title.toLowerCase().includes("waiter") || s.title.toLowerCase().includes("menu") || s.title.toLowerCase().includes("safe"))).toBe(true);
    });

    it("should auto-detect cooked meal plate from query and provide plate sequencing", async () => {
      const req = new NextRequest("http://localhost:3000/api/scanner/multimodal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_mode: "auto",
          query: "I have a cooked plate of salmon and rice. How to eat?",
          preset: "mock-cooked-meal",
        }),
      });

      const res = await multimodalHandler(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.detected_type).toBe("prepared_food");
      expect(json.data.plate_sequencing.length).toBeGreaterThan(0);
      expect(json.data.plate_sequencing[0].phase).toContain("Fiber");
    });

    it("should auto-detect restaurant menu from query and provide waiter script", async () => {
      const req = new NextRequest("http://localhost:3000/api/scanner/multimodal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_mode: "auto",
          query: "What can I order from this restaurant menu?",
          preset: "mock-restaurant-menu",
        }),
      });

      const res = await multimodalHandler(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.detected_type).toBe("restaurant_menu");
      expect(json.data.waiter_script).toBeDefined();
    });

    it("should auto-detect raw bazaar groceries and provide cost and recipes", async () => {
      const req = new NextRequest("http://localhost:3000/api/scanner/multimodal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_mode: "auto",
          query: "Here are vegetables from the bazaar. Can I cook with this?",
          preset: "mock-preset",
        }),
      });

      const res = await multimodalHandler(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.detected_type).toBe("grocery_bazaar");
      expect(json.data.cost_estimate.total_cost_usd).toBeGreaterThan(0);
    });
  });

  describe("Phase E: Cost-Aware Meal Planner Route", () => {
    it("should generate a budget-optimized meal plan with clinical sequencing", async () => {
      const req = new NextRequest("http://localhost:3000/api/meals/cost-aware-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget_limit_usd: 5.0,
          dietary_focus: "strict_glycemic_control",
          available_ingredients: ["bitter gourd", "spinach"],
        }),
      });

      const res = await costPlannerHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.within_budget).toBe(true);
      expect(json.data.total_estimated_cost_usd).toBeLessThanOrEqual(5.0);
      expect(json.data.clinical_sequencing.length).toBe(3);
      expect(json.data.clinical_sequencing[0].phase).toBe("Fiber Preload");
    });
  });

  describe("RAG Nutrition Lookup Route", () => {
    it("should return nutrition data for query via GET request", async () => {
      const req = new NextRequest("http://localhost:3000/api/rag/nutrition-lookup?q=spinach");
      const res = await nutritionLookupHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.count).toBeGreaterThan(0);
      expect(json.data[0].name.toLowerCase()).toContain("spinach");
    });
  });
});
