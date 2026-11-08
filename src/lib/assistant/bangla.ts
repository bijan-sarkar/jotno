/**
 * Bangla language helpers for the elder voice assistant.
 */

import type { MeasurementContext } from "@/lib/validations/telemetry";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** 160 → "১৬০" */
export function toBanglaDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** "১৬০" → "160" (leaves Latin digits untouched) */
export function fromBanglaDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

export const CONTEXT_LABELS_BN: Record<MeasurementContext, string> = {
  fasting: "খালি পেটে",
  post_meal: "খাওয়ার পরে",
  bedtime: "ঘুমানোর আগে",
  random: "যেকোনো সময়",
};

export type GlucoseLevel = "low" | "good" | "slightly_high" | "high" | "very_high";

export const GLUCOSE_LOW = 70;
export const GLUCOSE_VERY_HIGH = 300;

/** Bands in mmol/L or mg/dL (low < 3.9 mmol/L, good <= 7.8 mmol/L, slightly_high <= 10.0 mmol/L, high < 16.7 mmol/L). `low` and `very_high` trigger the help screen. */
export function classifyGlucose(value: number): GlucoseLevel {
  const valMg = value <= 35 ? value * 18 : value;
  if (valMg < GLUCOSE_LOW) return "low";
  if (valMg <= 140) return "good";
  if (valMg <= 180) return "slightly_high";
  if (valMg < GLUCOSE_VERY_HIGH) return "high";
  return "very_high";
}

export const LEVEL_LABELS_BN: Record<GlucoseLevel, string> = {
  low: "কম",
  good: "ভালো",
  slightly_high: "একটু বেশি",
  high: "বেশি",
  very_high: "অনেক বেশি",
};

/** Spoken feedback after a reading is saved. Never mentions medication doses. */
export function readingFeedbackBn(value: number): string {
  const n = toBanglaDigits(value);
  const unitSuffix = value <= 35 ? " মিলিমোল" : "";
  switch (classifyGlucose(value)) {
    case "low":
      return `আপনার সুগার ${n}${unitSuffix}, এটা কম। এখনই আধা গ্লাস ফলের রস বা এক চামচ চিনি পানিতে গুলে খান। ১৫ মিনিট পরে আবার মাপুন।`;
    case "good":
      return `আপনার সুগার ${n}${unitSuffix}। এটা ভালো আছে। এভাবেই চালিয়ে যান।`;
    case "slightly_high":
      return `আপনার সুগার ${n}${unitSuffix}, একটু বেশি। পানি খান আর পারলে একটু হাঁটুন।`;
    case "high":
      return `আপনার সুগার ${n}${unitSuffix}, এটা বেশি। পানি খান, মিষ্টি ও ভাত কম খান। কয়েক ঘণ্টা পরে আবার মাপুন।`;
    case "very_high":
      return `আপনার সুগার ${n}${unitSuffix}, এটা অনেক বেশি। আজই আপনার ডাক্তার বা পরিবারের কাউকে জানান। বমি বা খুব ঘুম ঘুম লাগলে এখনই ফোন করুন।`;
  }
}

/** Formats any glucose reading to standard Bangladesh mmol/L string */
export function toMmolString(value: number): string {
  const mmol = value <= 35 ? value : Number((value / 18).toFixed(1));
  return `${toBanglaDigits(mmol)} mmol/L`;
}

export function greetingBn(hour: number): string {
  if (hour < 12) return "শুভ সকাল";
  if (hour < 17) return "শুভ দুপুর";
  return "শুভ সন্ধ্যা";
}
