import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { env, getSystemEnvStatus } from "@/lib/env";
import { measurementContextSchema } from "@/lib/validations/telemetry";
import { fromBanglaDigits, toBanglaDigits } from "@/lib/assistant/bangla";
import { BANGLA_CLINICAL_REFUSAL, isUnsafeRequest, scrubReply } from "@/lib/assistant/safety";
import { shrinkSpeechWav } from "@/lib/assistant/wav";

/**
 * Bangla voice/photo assistant for elderly users.
 * Flash-lite models answer in ~2s; the larger flash model is a last resort when lite models are busy.
 */
export const ASSISTANT_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"];
export const TTS_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts", "gemini-3.8-flash-tts"];
const MODEL_TIMEOUT_MS = 9000;

export type AssistantMode = "talk" | "meter" | "food";

export interface AssistantInput {
  mode: AssistantMode;
  audio?: { data: Buffer; mimeType: string };
  image?: { data: Buffer; mimeType: string };
  text?: string;
  userName?: string;
}

export const assistantResultSchema = z.object({
  transcript: z.string().default(""),
  reply: z.string().min(1),
  action: z.enum(["none", "log_glucose", "call_for_help"]).default("none"),
  glucose_value: z.number().min(1).max(600).nullable().optional(),
  glucose_context: measurementContextSchema.nullable().optional(),
  food_verdict: z.enum(["good", "limit", "avoid"]).nullable().optional(),
});

export type AssistantResult = z.infer<typeof assistantResultSchema> & { source: "gemini" | "fallback"; model?: string };

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: { type: Type.STRING, description: "What the user said, written in Bangla. Empty for photos." },
    reply: { type: Type.STRING, description: "Spoken reply in very simple Bangla, at most 2 short sentences." },
    action: { type: Type.STRING, enum: ["none", "log_glucose", "call_for_help"] },
    glucose_value: { type: Type.NUMBER, nullable: true, description: "Blood glucose in mmol/L or mg/dL" },
    glucose_context: { type: Type.STRING, enum: ["fasting", "post_meal", "bedtime", "random"], nullable: true },
    food_verdict: { type: Type.STRING, enum: ["good", "limit", "avoid"], nullable: true },
  },
  required: ["transcript", "reply", "action"],
};

function systemPrompt(mode: AssistantMode, userName?: string) {
  const who = userName ? `ব্যবহারকারীর নাম ${userName}।` : "";
  const modeRule = {
    talk: "ব্যবহারকারী বাংলায় কথা বলেছেন। আগে transcript-এ ঠিক যা বলেছেন তা লিখুন।",
    meter:
      "ছবিটি একটি গ্লুকোমিটারের। পর্দার সংখ্যাটি পড়ুন। বাংলাদেশে রক্তে সুগার mmol/L (মিলিমোল/লিটার) এককে হিসাব করা হয়। যদি মিটারে সংখ্যাটি mg/dL এ থাকে (যেমন: ১২০, ১৪০), তবে ১৮ দিয়ে ভাগ করে mmol/L মান দিন। পড়া গেলে action=log_glucose, glucose_value দিন (যেমন: 6.5), glucose_context=random। পড়া না গেলে action=none এবং বলুন মিটারটি কাছে ও আলোতে ধরে আবার ছবি তুলতে।",
    food:
      "ছবিটি খাবার বা বাজারের জিনিসের। কী কী দেখছেন বাংলায় নাম বলুন এবং ডায়াবেটিসের জন্য কেমন তা বলুন। food_verdict: good (ভালো), limit (অল্প খান), avoid (এড়িয়ে চলুন)। পরিমাণ বলতে মুঠো, কাপ, চামচ ব্যবহার করুন, গ্রাম নয়।",
  }[mode];

  return `আপনি "সুগার সাথী", একজন বয়স্ক ডায়াবেটিস রোগীর বাংলা সহায়ক। ${who}
নিয়ম:
- সবসময় খুব সহজ, সম্মানজনক বাংলায় (আপনি) উত্তর দিন। সর্বোচ্চ দুইটি ছোট বাক্য। কঠিন বা ইংরেজি শব্দ নয়।
- নাম ধরে ডাকলে শুধু নামটি বলুন; চাচা, খালা, ভাই, আপা, দাদা ইত্যাদি সম্বোধন যোগ করবেন না, কারণ আপনি ব্যবহারকারীর লিঙ্গ বা সম্পর্ক জানেন না।
- সংখ্যা বাংলা অঙ্কে লিখুন।
- বাংলাদেশে ডায়াবেটিস ও রক্তের সুগার mmol/L (মিলিমোল) এককে হিসাব করা হয় (যেমন: ৬.৫, ৭.২, ৮.০)।
- ব্যবহারকারী সুগারের মান বললে: action=log_glucose, glucose_value দিন (যদি mmol/L এ বলে যেমন ৬.৫, সেটাই দিন; যদি mg/dL এ বলে যেমন ১৪০, ১৮ দিয়ে ভাগ করে mmol/L দিন), glucose_context (খালি পেটে=fasting, খাওয়ার পরে=post_meal, ঘুমানোর আগে=bedtime, না বললে random)। reply-তে মানটি মিলিমোল এককে নিশ্চিত হতে চান (যেমন: "আপনার সুগার ৬.৫ মিলিমোল, তাই তো?")।
- মাথা ঘোরা, কাঁপুনি, ঘাম, বুক ধড়ফড়, অজ্ঞান লাগা, বুকে ব্যথা, শ্বাসকষ্ট বললে: action=call_for_help এবং বলুন এখনই কাউকে ডাকতে।
- ওষুধ বা ইনসুলিনের মাত্রা, ওষুধ বন্ধ/বাড়ানো/কমানো নিয়ে কখনো পরামর্শ দেবেন না; বলুন ডাক্তারের সাথে কথা বলতে।
- আপনি ডাক্তার নন। নিশ্চিত না হলে ডাক্তারের কাছে যেতে বলুন।
${modeRule}`;
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms))]);

function buildParts(input: AssistantInput) {
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
  if (input.audio) parts.push({ inlineData: { mimeType: input.audio.mimeType, data: input.audio.data.toString("base64") } });
  if (input.image) parts.push({ inlineData: { mimeType: input.image.mimeType, data: input.image.data.toString("base64") } });
  if (input.text) parts.push({ text: input.text });
  return parts;
}

/** Applies safety rules and validation to a raw model result. */
export function finalizeResult(raw: z.infer<typeof assistantResultSchema>, inputText?: string): z.infer<typeof assistantResultSchema> {
  const result = { ...raw };
  const heard = [inputText, result.transcript].filter(Boolean).join(" ");

  if (heard && isUnsafeRequest(heard)) {
    // Emergencies still go through; everything else becomes the refusal
    result.reply = BANGLA_CLINICAL_REFUSAL;
    if (result.action !== "call_for_help") result.action = "none";
  } else {
    result.reply = scrubReply(result.reply);
  }

  if (result.action === "log_glucose" && !result.glucose_value) result.action = "none";
  if (result.action === "log_glucose" && !result.glucose_context) result.glucose_context = "random";
  return result;
}

/** Offline / no-key fallback: understands typed numbers so manual logging still works. */
export function fallbackResult(input: AssistantInput): AssistantResult {
  const raw = input.text ? fromBanglaDigits(input.text) : "";
  const match = raw.match(/\d+(?:[.,]\d+)?/);
  const num = match ? parseFloat(match[0].replace(",", ".")) : NaN;
  if (!isNaN(num)) {
    if (num >= 20 && num <= 600) {
      return {
        transcript: input.text ?? "",
        reply: "ঠিক আছে, সংখ্যাটি দেখে নিন।",
        action: "log_glucose",
        glucose_value: num,
        glucose_context: "random",
        source: "fallback",
      };
    }
    if (num >= 1.5 && num < 20) {
      return {
        transcript: input.text ?? "",
        reply: `আপনার সুগার ${toBanglaDigits(num)} মিলিমোল, তাই তো?`,
        action: "log_glucose",
        glucose_value: num,
        glucose_context: "random",
        source: "fallback",
      };
    }
  }
  return {
    transcript: input.text ?? "",
    reply: "দুঃখিত, এখন উত্তর দিতে পারছি না। একটু পরে আবার চেষ্টা করুন।",
    action: "none",
    source: "fallback",
  };
}

export async function runElderAssistant(input: AssistantInput): Promise<AssistantResult> {
  if (input.text && isUnsafeRequest(input.text)) {
    return { transcript: input.text, reply: BANGLA_CLINICAL_REFUSAL, action: "none", source: "gemini" };
  }
  if (!getSystemEnvStatus().gemini.isLive) return fallbackResult(input);

  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  const contents = [{ role: "user", parts: buildParts(input) }];

  for (const model of ASSISTANT_MODELS) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: systemPrompt(input.mode, input.userName),
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.3,
          },
        }),
        MODEL_TIMEOUT_MS
      );
      const parsed = assistantResultSchema.safeParse(JSON.parse(response.text || "{}"));
      if (!parsed.success) {
        console.warn(`[Elder Assistant] ${model} returned an invalid shape:`, parsed.error.issues[0]?.message);
        continue;
      }
      return { ...finalizeResult(parsed.data, input.text), source: "gemini", model };
    } catch (err: unknown) {
      console.warn(`[Elder Assistant] ${model} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return fallbackResult(input);
}

/** Bangla speech for phones without a Bangla system voice. Returns a 12 kHz WAV or null. */
export async function synthesizeBanglaSpeech(text: string): Promise<Buffer | null> {
  if (!getSystemEnvStatus().gemini.isLive) return null;
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

  for (const model of TTS_MODELS) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
          },
        }),
        3000
      );
      const audio = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (audio?.data) return shrinkSpeechWav(Buffer.from(audio.data, "base64"), audio.mimeType);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Elder TTS] ${model} failed:`, errMsg);
      if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        break;
      }
    }
  }
  return null;
}
