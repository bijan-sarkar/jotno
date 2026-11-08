"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Sparkles,
  Clock,
  Flame,
  AlertTriangle,
  Plus,
  X,
  RefreshCw,
  Lightbulb,
  ScanLine,
} from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import type { Recipe } from "@/lib/validations/recipe";

const PRESETS = [
  { label: "Bitter gourd, dal & chili", items: ["Bitter Gourd", "Masoor Dal", "Green Chili"] },
  { label: "Potatoes, spinach & eggs", items: ["Potatoes", "Spinach", "Eggs"] },
];

function RecipeContent() {
  const searchParams = useSearchParams();
  const [ingredients, setIngredients] = useState<string[]>([
    "Bitter Gourd",
    "Masoor Dal",
    "Green Chili",
  ]);
  const [newIngredient, setNewIngredient] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [selectedRecipeIndex, setSelectedRecipeIndex] = useState<number>(0);
  // Plate order is now shown as a numbered list; the tab state is kept for compatibility
  const [, setActiveStepTab] = useState<"step_1" | "step_2" | "step_3">("step_1");
  const [error, setError] = useState<string | null>(null);
  const [fromScan, setFromScan] = useState<boolean>(false);

  // Initialize from URL search parameters or session storage if available
  useEffect(() => {
    const queryItems = searchParams.get("items");
    if (queryItems) {
      const parsed = queryItems
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsed.length > 0) {
        setIngredients(parsed);
        setFromScan(true);
      }
    } else if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("glucovision_scanned_items");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setIngredients(parsed);
            setFromScan(true);
          }
        } catch {
          // Keep default
        }
      }
    }
  }, [searchParams]);

  const addIngredient = () => {
    const trimmed = newIngredient.trim();
    if (trimmed && !ingredients.some((i) => i.toLowerCase() === trimmed.toLowerCase())) {
      setIngredients((prev) => [...prev, trimmed]);
      setNewIngredient("");
    }
  };

  const removeIngredient = (indexToRemove: number) => {
    setIngredients((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const applyPreset = (preset: string[]) => {
    setIngredients(preset);
    setRecipes(null);
    setError(null);
  };

  const handleGenerate = async () => {
    if (ingredients.length === 0) {
      setError("Please add at least one available food item.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: ingredients }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate diabetic recipe.");
      }

      setRecipes(data.recipes);
      setSelectedRecipeIndex(0);
      setActiveStepTab("step_1");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const currentRecipe = recipes && recipes[selectedRecipeIndex] ? recipes[selectedRecipeIndex] : null;

  const plateSteps = currentRecipe
    ? [
        {
          ...currentRecipe.eating_sequence.step_1,
          heading: "Eat first: fiber",
          meta: `${currentRecipe.eating_sequence.step_1.duration_minutes} min`,
          tint: "bg-pastel-lime text-pastel-lime-ink",
        },
        {
          ...currentRecipe.eating_sequence.step_2,
          heading: "Then: protein & fats",
          meta: `${currentRecipe.eating_sequence.step_2.duration_minutes} min`,
          tint: "bg-pastel-blue text-pastel-blue-ink",
        },
        {
          ...currentRecipe.eating_sequence.step_3,
          heading: "Last: starch",
          meta: currentRecipe.eating_sequence.step_3.portion_limit,
          tint: "bg-pastel-peach text-pastel-peach-ink",
        },
      ]
    : [];

  return (
    <>
      <PageHeader title="Recipes" subtitle="Low-GI meals from what you have" />

      <main className="px-4 py-5 space-y-5">
        {/* Nudge to scan when ingredients didn't come from a scan */}
        {!fromScan && !currentRecipe && (
          <div className="tile flex min-h-[132px] flex-col bg-pastel-lime text-pastel-lime-ink">
            <Link href="/scanner" aria-label="Scan your groceries first" className="absolute inset-0 rounded-[28px] active:bg-black/5" />
            <span className="chip pointer-events-none relative self-start">
              <ScanLine className="h-4 w-4" />
              Scan your groceries first
            </span>
            <div className="pointer-events-none relative mt-3 flex flex-1 items-end justify-between gap-3">
              <p className="text-sm font-semibold leading-snug">We&apos;ll build recipes from exactly what you bought.</p>
              <span className="fab bg-pastel-lime-strong">
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </span>
            </div>
          </div>
        )}

        {/* Ingredient Selector */}
        <section className="card space-y-4 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold text-ink">Your ingredients</h2>
            <span className="text-sm font-semibold text-ink-muted">
              {ingredients.length} {ingredients.length === 1 ? "item" : "items"}
            </span>
          </div>

          <div className="flex min-h-[44px] flex-wrap gap-2">
            {ingredients.map((item, idx) => (
              <span
                key={idx}
                className="inline-flex h-10 items-center gap-1 rounded-full border border-line bg-white pl-4 pr-1 text-sm font-semibold text-ink shadow-sm"
              >
                <span>{item}</span>
                <button
                  type="button"
                  onClick={() => removeIngredient(idx)}
                  aria-label={`Remove ${item}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted active:bg-canvas"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            ))}
            {ingredients.length === 0 && (
              <p className="py-2 text-sm text-ink-muted">No ingredients yet. Add some below.</p>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newIngredient}
              onChange={(e) => setNewIngredient(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addIngredient();
                }
              }}
              enterKeyHint="done"
              placeholder="Add an ingredient, e.g. okra"
              className="input min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={addIngredient}
              aria-label="Add ingredient"
              className="fab h-12 w-12 bg-pastel-lime-strong"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>

          <div className="space-y-2">
            <p className="section-title">Or try a sample</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const active = p.items.join() === ingredients.join();
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.items)}
                    aria-pressed={active}
                    className="chip-toggle"
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || ingredients.length === 0}
          className="btn-primary"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="h-5 w-5 animate-spin" />
              Creating your recipe…
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              {currentRecipe ? "Create new recipes" : "Create recipes"}
            </>
          )}
        </button>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl bg-risk-danger p-3 text-sm font-semibold text-risk-dangerInk">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Recipe Results */}
        {currentRecipe && (
          <div className="space-y-5 pt-1">
            {recipes && recipes.length > 1 && (
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {recipes.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedRecipeIndex(i);
                      setActiveStepTab("step_1");
                    }}
                    aria-pressed={selectedRecipeIndex === i}
                    className="chip-toggle shrink-0"
                  >
                    {r.title}
                  </button>
                ))}
              </div>
            )}

            {/* Title */}
            <section className="card space-y-2 p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-ink-muted">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    currentRecipe.glycemic_impact === "low"
                      ? "bg-risk-safe text-risk-safeInk"
                      : "bg-risk-caution text-risk-cautionInk"
                  }`}
                >
                  <span className="capitalize">{currentRecipe.glycemic_impact}</span> GI
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {currentRecipe.prep_time_minutes + currentRecipe.cook_time_minutes} min
                </span>
                <span className="flex items-center gap-1">
                  <Flame className="h-4 w-4" />
                  {currentRecipe.macros.calories} kcal
                </span>
              </div>
              <h2 className="text-2xl font-extrabold text-ink">{currentRecipe.title}</h2>
              <p className="text-base leading-relaxed text-ink-soft">{currentRecipe.description}</p>
            </section>

            {/* Macros */}
            <section className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Net carbs", value: currentRecipe.macros.net_carbs_g, tint: "bg-pastel-peach text-pastel-peach-ink" },
                { label: "Fiber", value: currentRecipe.macros.fiber_g, tint: "bg-pastel-lime text-pastel-lime-ink" },
                { label: "Protein", value: currentRecipe.macros.protein_g, tint: "bg-pastel-blue text-pastel-blue-ink" },
                { label: "Total carbs", value: currentRecipe.macros.total_carbs_g, tint: "bg-pastel-coral text-pastel-coral-ink" },
                { label: "Healthy fats", value: currentRecipe.macros.healthy_fats_g, tint: "bg-pastel-lilac text-pastel-lilac-ink" },
              ].map((m) => (
                <div key={m.label} className={`rounded-3xl p-3 ${m.tint}`}>
                  <p className="text-xl font-extrabold">{m.value}g</p>
                  <p className="text-xs font-bold opacity-80">{m.label}</p>
                </div>
              ))}
            </section>

            {/* Plate order: fiber -> protein -> starch */}
            <section className="space-y-3">
              <div>
                <h3 className="text-base font-bold text-ink">Eat in this order</h3>
                <p className="text-sm text-ink-muted">Eating fiber and protein before starch helps blunt spikes.</p>
              </div>
              <ol className="space-y-2.5">
                {plateSteps.map((s, i) => (
                  <li key={s.heading} className="card flex gap-3 p-4">
                    <span className={`icon-badge text-base font-extrabold ${s.tint}`}>{i + 1}</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-bold text-ink">{s.heading}</p>
                        <span className="shrink-0 text-xs font-semibold text-ink-muted">{s.meta}</span>
                      </div>
                      <p className="text-sm font-semibold text-ink-soft">
                        {s.items.length > 0 ? s.items.join(", ") : "No concentrated starches"}
                      </p>
                      <p className="text-sm leading-relaxed text-ink-muted">{s.guidance}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Ingredients */}
            <section className="space-y-3">
              <h3 className="text-base font-bold text-ink">Ingredients</h3>
              <ul className="card divide-y divide-line overflow-hidden">
                {currentRecipe.ingredients.map((ing, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-base">
                    <span className="font-semibold text-ink">{ing.name}</span>
                    <span className="text-sm font-medium text-ink-muted">{ing.quantity}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Method */}
            <section className="space-y-3">
              <h3 className="text-base font-bold text-ink">Method</h3>
              <ol className="card space-y-4 p-4">
                {currentRecipe.instructions.map((ins) => (
                  <li key={ins.step_number} className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
                      {ins.step_number}
                    </span>
                    <div className="space-y-1.5">
                      <p className="text-base leading-relaxed text-ink">{ins.instruction}</p>
                      {ins.cooking_tip && (
                        <p className="flex items-start gap-1.5 rounded-2xl bg-pastel-peach/50 p-2.5 text-sm font-medium text-pastel-peach-ink">
                          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{ins.cooking_tip}</span>
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {currentRecipe.localized_buffer_pivot && (
              <section className="tile flex items-start gap-3 bg-pastel-lilac text-pastel-lilac-ink">
                <span className="icon-badge bg-white/70">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-bold">
                    Tip: add {currentRecipe.localized_buffer_pivot.item_name} (~
                    {currentRecipe.localized_buffer_pivot.estimated_cost?.includes("$")
                      ? `৳${Math.round(parseFloat(currentRecipe.localized_buffer_pivot.estimated_cost.replace(/[^0-9.]/g, '') || "0.5") * 120)} / ${currentRecipe.localized_buffer_pivot.estimated_cost}`
                      : currentRecipe.localized_buffer_pivot.estimated_cost})
                  </p>
                  <p className="mt-0.5 text-sm font-medium opacity-80">{currentRecipe.localized_buffer_pivot.benefit}</p>
                </div>
              </section>
            )}

            <p className="text-center text-sm text-ink-muted">Uses only the ingredients you listed, with no hidden starches added.</p>
          </div>
        )}
      </main>
    </>
  );
}

export default function RecipesPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Recipes" subtitle="Low-GI meals from what you have" />
          <div className="px-4 py-10 text-center text-sm text-ink-muted">Loading…</div>
        </>
      }
    >
      <RecipeContent />
    </Suspense>
  );
}
