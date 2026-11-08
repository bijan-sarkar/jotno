import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { queryNutritionSources, type NormalizedNutrition } from "@/lib/rag/nutrition-fetcher";
import { estimateRecipeCost, type RecipeCostEstimate } from "@/lib/pricing/cost-estimator";
import { env, getSystemEnvStatus } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export type ScanMode = "auto" | "grocery_bazaar" | "restaurant_menu" | "prepared_food";

export interface MultimodalOutput {
  detected_type: "grocery_bazaar" | "restaurant_menu" | "prepared_food";
  detected_title: string;
  identified_items: Array<{
    name: string;
    quantity: string;
    category?: string;
    gi_index: number;
    gl_load: number;
    risk_level?: "green" | "yellow" | "red";
    verified_rag_data?: NormalizedNutrition | null;
  }>;
  nutritional_summary: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    fiber_g: number;
    sodium_mg: number;
  };
  health_risk_alerts: string[];
  recipe_or_menu_suggestions: Array<{
    title: string;
    rationale: string;
    missing_ingredients?: string[];
    estimated_budget_level: "low" | "moderate" | "high";
  }>;
  waiter_script?: string;
  plate_sequencing?: Array<{
    step: number;
    phase: string;
    instruction: string;
  }>;
  voice_assistant_response: string;
  cost_estimate?: RecipeCostEstimate;
}

function detectCategoryFromInput(
  query: string,
  presetIdentifier?: string
): "grocery_bazaar" | "restaurant_menu" | "prepared_food" {
  const combined = `${query} ${presetIdentifier || ""}`.toLowerCase();
  if (
    combined.includes("menu") ||
    combined.includes("restaurant") ||
    combined.includes("waiter") ||
    combined.includes("order") ||
    combined.includes("naan") ||
    combined.includes("tikka") ||
    combined.includes("tadka")
  ) {
    return "restaurant_menu";
  }
  if (
    combined.includes("cooked") ||
    combined.includes("meal") ||
    combined.includes("plate") ||
    combined.includes("dish") ||
    combined.includes("dinner") ||
    combined.includes("lunch") ||
    combined.includes("salmon") ||
    combined.includes("eating") ||
    combined.includes("portion")
  ) {
    return "prepared_food";
  }
  return "grocery_bazaar";
}

/**
 * High-fidelity fallback presets for offline/test/demo mode when Gemini API key is missing or calls time out.
 */
function getFallbackResponse(
  mode: ScanMode,
  query: string,
  presetIdentifier?: string
): MultimodalOutput {
  const resolvedMode =
    mode === "auto" ? detectCategoryFromInput(query, presetIdentifier) : mode;

  switch (resolvedMode) {
    case "restaurant_menu":
      return {
        detected_type: "restaurant_menu",
        detected_title: "Restaurant Dining Menu",
        identified_items: [
          { name: "Tandoori Chicken Tikka", quantity: "1 skewer (200g)", category: "Lean Protein", gi_index: 0, gl_load: 0, risk_level: "green" },
          { name: "Mixed Vegetable Dal Tadka", quantity: "1 bowl (180g)", category: "Legumes & Fiber", gi_index: 34, gl_load: 6, risk_level: "green" },
          { name: "Butter Garlic Naan", quantity: "1 large piece (120g)", category: "Refined Flour", gi_index: 82, gl_load: 38, risk_level: "red" },
          { name: "Shahi Paneer", quantity: "1 bowl (200g)", category: "Dairy & Gravy", gi_index: 25, gl_load: 2, risk_level: "yellow" },
        ],
        nutritional_summary: {
          calories: 520,
          protein_g: 38,
          carbs_g: 44,
          fats_g: 22,
          fiber_g: 9,
          sodium_mg: 780,
        },
        health_risk_alerts: [
          "Butter Naan is high-glycemic (GI 82, GL 38); substitute with Tandoori Roti or ask for zero butter.",
          "Creamy restaurant gravies often contain hidden cashews, cornstarch, or sugar.",
        ],
        recipe_or_menu_suggestions: [
          {
            title: "Safe Diner Pick: Tandoori Protein + Cucumber Salad",
            rationale: "Opt for charred dry tandoori protein first, pairing with raw onion and cucumber to buffer glucose spikes.",
            missing_ingredients: ["Steamed Green Veggies (Request from kitchen)"],
            estimated_budget_level: "moderate",
          },
          {
            title: "Smart Substitution: Tandoori Roti in place of Naan",
            rationale: "Whole wheat roti with dry heat causes far lower insulin spikes than white refined maida naan brushed with ghee.",
            missing_ingredients: [],
            estimated_budget_level: "low",
          },
        ],
        waiter_script:
          "Please prepare my dal tadka without extra ghee tempering, and serve sliced cucumbers without sweet dressing.",
        voice_assistant_response:
          query
            ? `মেনু সম্পর্কে আপনার প্রশ্নের উত্তর: তন্দুরি চিকেন এবং ডাল সবচেয়ে নিরাপদ। বাটার নান বা মিষ্টি গ্রেভি বাদ দিন, এগুলো রক্তে সুগার দ্রুত বাড়িয়ে দেয়।`
            : "রেস্তোরাঁর এই মেনুতে তন্দুরি চিকেন এবং ডাল সবচেয়ে নিরাপদ ও স্বাস্থ্যকর। বাটার নান বা চিনিযুক্ত গ্রেভি এড়িয়ে চলুন, এগুলো সুগার দ্রুত বাড়িয়ে দেয়।",
      };

    case "prepared_food":
      return {
        detected_type: "prepared_food",
        detected_title: "Cooked Meal Plate",
        identified_items: [
          { name: "Steamed White Rice", quantity: "1 heaped cup (~180g)", category: "Starch", gi_index: 73, gl_load: 35, risk_level: "red" },
          { name: "Pan-Seared Salmon Fillet", quantity: "1 fillet (~150g)", category: "Fat & Protein", gi_index: 0, gl_load: 0, risk_level: "green" },
          { name: "Sautéed Mustard Greens", quantity: "1 cup (~120g)", category: "Soluble Fiber", gi_index: 15, gl_load: 0.5, risk_level: "green" },
        ],
        nutritional_summary: {
          calories: 480,
          protein_g: 36,
          carbs_g: 48,
          fats_g: 14,
          fiber_g: 5.5,
          sodium_mg: 390,
        },
        health_risk_alerts: [
          "Plate contains high starch volume (180g white rice). Strict plate sequence is required.",
          "Eat the greens and salmon first to trigger GLP-1 hormone release before having any rice.",
        ],
        recipe_or_menu_suggestions: [
          {
            title: "Nutrient Sequencing Re-order",
            rationale: "Step 1: Eat all sauteed mustard greens. Step 2: Eat the salmon fillet. Step 3: Consume only half of the steamed rice.",
            missing_ingredients: ["Apple cider vinegar dressing (optional glucose buffer)"],
            estimated_budget_level: "low",
          },
        ],
        plate_sequencing: [
          {
            step: 1,
            phase: "Fiber Preload",
            instruction: "Eat the sautéed mustard greens first. Soluble fiber coats the intestinal wall and slows gastric emptying.",
          },
          {
            step: 2,
            phase: "Protein & Healthy Fat",
            instruction: "Eat the pan-seared salmon next. Amino acids stimulate early GLP-1 and insulin release.",
          },
          {
            step: 3,
            phase: "Carbohydrate Finish",
            instruction: "Eat the white rice last, capping portion to 1/2 cup to prevent a steep postprandial glucose spike.",
          },
        ],
        voice_assistant_response:
          query
            ? `খাবারের প্লেট সম্পর্কে পরামর্শ: ভাতের পরিমাণ বেশি। সুগার নিয়ন্ত্রণে রাখতে আগে সবুজ শাকসবজি ও মাছ খান, ভাত সবার শেষে অল্প পরিমাণে খাবেন।`
            : "খাবারের প্লেটে ভাতের পরিমাণ কিছুটা বেশি। সুগার নিয়ন্ত্রণে রাখতে আগে শাকসবজি ও মাছ খান, ভাত সবার শেষে অল্প পরিমাণে খাবেন।",
      };

    case "grocery_bazaar":
    default:
      return {
        detected_type: "grocery_bazaar",
        detected_title: "Raw Grocery & Bazaar Basket",
        identified_items: [
          { name: "Bitter Gourd (Karela)", quantity: "4 pieces (~400g)", category: "Therapeutic Vegetable", gi_index: 15, gl_load: 0.5, risk_level: "green" },
          { name: "Red Lentils (Masoor Dal)", quantity: "1 bag (~250g)", category: "Legume Pulses", gi_index: 32, gl_load: 5.8, risk_level: "green" },
          { name: "Spinach (Palak)", quantity: "1 fresh bunch (~300g)", category: "Leafy Greens", gi_index: 15, gl_load: 0.3, risk_level: "green" },
          { name: "White Potatoes", quantity: "3 medium tubers (~400g)", category: "High GI Starch", gi_index: 82, gl_load: 26.2, risk_level: "red" },
          { name: "Fresh Green Chilies", quantity: "6 pieces (~50g)", category: "Thermogenic Spice", gi_index: 15, gl_load: 0.3, risk_level: "green" },
        ],
        nutritional_summary: {
          calories: 390,
          protein_g: 26,
          carbs_g: 52,
          fats_g: 4,
          fiber_g: 17,
          sodium_mg: 160,
        },
        health_risk_alerts: [
          "High glycemic potatoes detected (GI 82). Cap portion to 50g or boil and refrigerate overnight to form resistant starch.",
          "Excellent high-fiber therapeutic basket: Karela actively promotes glucose uptake.",
        ],
        recipe_or_menu_suggestions: [
          {
            title: "Therapeutic Karela & Masoor Stew",
            rationale: "Slow-simmer lentils with diced bitter gourd, turmeric, and garlic. Consume fiber first to suppress the gastric emptying rate.",
            missing_ingredients: ["Mustard Oil", "Turmeric Powder"],
            estimated_budget_level: "low",
          },
          {
            title: "Garlic Palak Bhaji with Chili Tempering",
            rationale: "Quickly wilt spinach in light mustard oil with crushed garlic and green chili for a powerful micronutrient shield.",
            missing_ingredients: ["Garlic cloves"],
            estimated_budget_level: "low",
          },
        ],
        plate_sequencing: [
          {
            step: 1,
            phase: "Fiber Preload",
            instruction: "Consume bitter gourd or spinach sauté first to delay glucose absorption.",
          },
          {
            step: 2,
            phase: "Plant Protein",
            instruction: "Follow with red lentil soup to trigger satiety.",
          },
          {
            step: 3,
            phase: "Controlled Starch",
            instruction: "Limit potatoes or polished rice to the end of the meal.",
          },
        ],
        voice_assistant_response:
          query
            ? `বাজারের জিনিস সম্পর্কে পরামর্শ: করলা ও পালং শাক ডায়াবেটিসের জন্য অত্যন্ত উপকারী। তবে আলুর পরিমাণ খুব সীমিত রাখুন এবং সবার শেষে খাবেন।`
            : "বাজারের জিনিসের মধ্যে করলা ও পালং শাক ডায়াবেটিসের জন্য অত্যন্ত উপকারী। তবে আলুর পরিমাণ খুব সীমিত রাখুন এবং সবার শেষে খাবেন।",
      };
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const contentType = req.headers.get("content-type") || "";
    let imageBase64: string | null = null;
    let imageMimeType = "image/jpeg";
    let audioBase64: string | null = null;
    let audioMimeType = "audio/webm";
    let scanMode: ScanMode = "auto";
    let textQuery = "";
    let presetIdentifier: string | undefined = undefined;

    // 1. Parse Multipart Form Data
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const imageFile = formData.get("image") as File | null;
      const audioFile = formData.get("audio") as File | null;
      const modeParam = (formData.get("scan_mode") as string) || "auto";
      textQuery = (formData.get("query") as string) || "";
      presetIdentifier = (formData.get("preset") as string) || undefined;

      if (["auto", "grocery_bazaar", "restaurant_menu", "prepared_food"].includes(modeParam)) {
        scanMode = modeParam as ScanMode;
      }

      if (imageFile) {
        const imgBuffer = await imageFile.arrayBuffer();
        imageBase64 = Buffer.from(imgBuffer).toString("base64");
        imageMimeType = imageFile.type || "image/jpeg";
      }

      if (audioFile) {
        const audioBuffer = await audioFile.arrayBuffer();
        audioBase64 = Buffer.from(audioBuffer).toString("base64");
        audioMimeType = audioFile.type || "audio/webm";
      }
    }
    // 2. Parse JSON Data
    else if (contentType.includes("application/json")) {
      const json = await req.json();
      textQuery = json.query || "";
      presetIdentifier = json.preset || undefined;
      if (
        json.scan_mode &&
        ["auto", "grocery_bazaar", "restaurant_menu", "prepared_food"].includes(json.scan_mode)
      ) {
        scanMode = json.scan_mode as ScanMode;
      }

      if (json.imageBase64) {
        if (json.imageBase64.startsWith("mock-") || json.imageBase64.includes("preset")) {
          presetIdentifier = json.imageBase64;
        }
        const matches = json.imageBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        imageMimeType = matches ? matches[1] : "image/jpeg";
        imageBase64 = matches ? matches[2] : json.imageBase64;
      }

      if (json.audioBase64) {
        const matches = json.audioBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        audioMimeType = matches ? matches[1] : "audio/webm";
        audioBase64 = matches ? matches[2] : json.audioBase64;
      }
    }

    if (!imageBase64 && !audioBase64 && !textQuery && !presetIdentifier) {
      return NextResponse.json(
        { error: "Image, audio, or text query input is required for multimodal scan." },
        { status: 400 }
      );
    }

    const envStatus = getSystemEnvStatus();
    let parsedAI: MultimodalOutput | null = null;
    let isLiveAi = false;
    let modelUsed: string | null = null;

    // Call Gemini Flash models if live API key is available
    if (
      envStatus.gemini.isLive &&
      (imageBase64 || audioBase64) &&
      !presetIdentifier?.startsWith("mock-")
    ) {
      const CANDIDATE_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash-lite"];
      const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

      type ContentPart =
        | { inlineData: { mimeType: string; data: string } }
        | { text: string };

      const buildContentParts = (includeAudio: boolean): ContentPart[] => {
        const parts: ContentPart[] = [];
        if (imageBase64) {
          parts.push({
            inlineData: {
              mimeType: imageMimeType,
              data: imageBase64,
            },
          });
        }
        if (includeAudio && audioBase64 && audioBase64.length > 200) {
          parts.push({
            inlineData: {
              mimeType: audioMimeType.split(";")[0],
              data: audioBase64,
            },
          });
        }
        parts.push({ text: systemInstruction });
        return parts;
      };

      const systemInstruction = `
You are "Jotno Live Scan" (যত্ন লাইভ স্ক্যান), an expert clinical diabetic nutritionist and multimodal food analyst.
Mode: ${scanMode} (automatically identify content if "auto").
User question or spoken voice transcript: "${textQuery || "Analyze diabetes safety and recommend actions."}".

CRITICAL AUTOMATIC CLASSIFICATION INSTRUCTION:
Examine the image and voice prompt carefully and classify the type into ONE of:
- "grocery_bazaar": Raw produce, market groceries, uncooked vegetables, lentils/pulses, shopping cart/basket items.
- "restaurant_menu": Printed or written food menu, restaurant bill of fare, board, ordering sheet.
- "prepared_food": Cooked meal, plated food, bowl, soup, sandwich, or prepared cooked serving.

TAILORED OUTPUT REQUIREMENTS:
1. If "grocery_bazaar":
   - Identify raw items with GI and GL. Flag high-glycemic starches (GI >= 70).
   - Suggest safe recipes with eating sequences, missing items, and estimated budget level.
2. If "restaurant_menu":
   - Identify menu dishes, highlight hidden sugars/starches in restaurant gravies/breads.
   - Provide a natural "waiter_script" for the diner to ask the server for healthy customizations.
3. If "prepared_food":
   - Estimate portion macros (calories, carbs, protein, fats, fiber, sodium).
   - Provide a 3-step "plate_sequencing" array (Step 1: Fiber Preload, Step 2: Protein/Fats, Step 3: Complex Carbs) to flatten postprandial glucose spikes.

CRITICAL LANGUAGE REQUIREMENT FOR VOICE ASSISTANT:
- "voice_assistant_response" MUST ALWAYS be in very clear, warm, conversational spoken Bangla (বাংলা ভাষায়), delivered as a caring female clinical health companion advising a diabetic patient. Keep it to 2 concise sentences answering what is shown and how to eat safely.

CRITICAL CURRENCY & ECONOMY REQUIREMENT:
- All cost, price, and economy suggestions MUST be given in Bangladeshi Taka (৳ / টাকা). Never quote USD to the user.

Return ONLY a raw JSON object matching this schema with NO markdown code fences:
{
  "detected_type": "grocery_bazaar" | "restaurant_menu" | "prepared_food",
  "detected_title": "string",
  "identified_items": [
    { "name": "string", "quantity": "string", "category": "string", "gi_index": number, "gl_load": number, "risk_level": "green"|"yellow"|"red" }
  ],
  "nutritional_summary": {
    "calories": number,
    "protein_g": number,
    "carbs_g": number,
    "fats_g": number,
    "fiber_g": number,
    "sodium_mg": number
  },
  "health_risk_alerts": ["string"],
  "recipe_or_menu_suggestions": [
    { "title": "string", "rationale": "string", "missing_ingredients": ["string"], "estimated_budget_level": "low"|"moderate"|"high" }
  ],
  "waiter_script": "string",
  "plate_sequencing": [
    { "step": number, "phase": "string", "instruction": "string" }
  ],
  "voice_assistant_response": "string (in fluent Bangla)"
}`;

      for (const model of CANDIDATE_MODELS) {
        try {
          // Attempt 1: With audio if provided
          let parts = buildContentParts(Boolean(audioBase64));
          let generatePromise = ai.models.generateContent({
            model,
            contents: [{ role: "user", parts }],
            config: {
              responseMimeType: "application/json",
              maxOutputTokens: 1000,
              temperature: 0.2,
            },
          });

          let timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini multimodal inference timed out for ${model}`)), 12000)
          );

          let response;
          try {
            response = await Promise.race([generatePromise, timeoutPromise]);
          } catch (audioOrModelErr) {
            // If failed and audio was included, retry without audio in case audio codec failed
            if (audioBase64) {
              console.warn(`[Gemini Multimodal] Retrying ${model} without audio part:`, audioOrModelErr);
              parts = buildContentParts(false);
              generatePromise = ai.models.generateContent({
                model,
                contents: [{ role: "user", parts }],
                config: {
                  responseMimeType: "application/json",
                  maxOutputTokens: 1000,
                  temperature: 0.2,
                },
              });
              timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Gemini multimodal inference timed out for ${model} without audio`)), 10000)
              );
              response = await Promise.race([generatePromise, timeoutPromise]);
            } else {
              throw audioOrModelErr;
            }
          }

          const rawText = response.text || "{}";
          const sanitized = rawText.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
          const parsedObj = JSON.parse(sanitized);

          if (!parsedObj.detected_type) {
            parsedObj.detected_type = detectCategoryFromInput(textQuery, presetIdentifier);
          }
          if (!parsedObj.detected_title) {
            parsedObj.detected_title =
              parsedObj.detected_type === "restaurant_menu"
                ? "Restaurant Dining Menu"
                : parsedObj.detected_type === "prepared_food"
                ? "Cooked Meal Plate"
                : "Raw Grocery & Bazaar Basket";
          }
          parsedAI = parsedObj as MultimodalOutput;
          isLiveAi = true;
          modelUsed = model;
          break; // Succeeded!
        } catch (modelErr) {
          console.warn(`[Gemini Multimodal ${model} failed]:`, modelErr);
        }
      }
    }

    if (!parsedAI) {
      // Use structured clinical fallback
      parsedAI = getFallbackResponse(scanMode, textQuery, presetIdentifier);
    }

    // 3. Parallel Multimodal RAG Enrichment for Top Items
    if (parsedAI.identified_items && parsedAI.identified_items.length > 0) {
      const topItems = parsedAI.identified_items.slice(0, 4);
      const enrichedItems = await Promise.all(
        topItems.map(async (item) => {
          const matched = await queryNutritionSources(item.name);
          return {
            ...item,
            verified_rag_data: matched.length > 0 ? matched[0] : null,
          };
        })
      );
      parsedAI.identified_items = [
        ...enrichedItems,
        ...parsedAI.identified_items.slice(4),
      ];
    }

    // 4. Calculate Kaggle Global Food Price Cost Estimates
    const ingredientsForCost = (parsedAI.identified_items || []).map((it) => ({
      name: it.name,
      amount_g: 200, // standard benchmark reference portion
    }));
    const costEstimate = await estimateRecipeCost(ingredientsForCost);
    parsedAI.cost_estimate = costEstimate;

    // 5. Optionally record to Supabase Food Scans & Voice Logs if user is logged in
    try {
      const supabase = createServerSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const userId = session.user.id;
        const { data: scanInsert } = await supabase
          .from("food_scans")
          .insert({
            user_id: userId,
            scan_type: parsedAI.detected_type,
            scan_mode: parsedAI.detected_type,
            voice_prompt_transcript: textQuery || null,
            raw_ai_response: parsedAI,
            detected_items: parsedAI.identified_items,
            cost_estimate: costEstimate,
            health_risk_alerts: parsedAI.health_risk_alerts,
          })
          .select("id")
          .maybeSingle();

        if (audioBase64 && scanInsert?.id) {
          await supabase.from("voice_interaction_logs").insert({
            user_id: userId,
            scan_id: scanInsert.id,
            user_query: textQuery || "Voice audio query",
            ai_response_text: parsedAI.voice_assistant_response,
            ai_audio_latency_ms: Date.now() - startTime,
          });
        }
      }
    } catch {
      // Supabase logging is non-blocking
    }

    return NextResponse.json({
      success: true,
      data: parsedAI,
      isLive: isLiveAi,
      model: modelUsed,
      apiConfigured: envStatus.gemini.isLive,
      latencyMs: Date.now() - startTime,
      detected_type: parsedAI.detected_type,
      mode: scanMode,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process multimodal input";
    console.error("Multimodal processing handler error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
