"use client";

import { Check, X } from "lucide-react";
import type { MeasurementContext } from "@/lib/validations/telemetry";
import { CONTEXT_LABELS_BN, toBanglaDigits } from "@/lib/assistant/bangla";

interface ConfirmReadingSheetProps {
  value: number;
  context: MeasurementContext;
  onContextChange: (context: MeasurementContext) => void;
  onConfirm: () => void;
  onReject: () => void;
}

const CONTEXTS: MeasurementContext[] = ["fasting", "post_meal", "bedtime", "random"];

/** Nothing is saved until the user taps ঠিক আছে — speech and photo reading can be wrong. */
export default function ConfirmReadingSheet({ value, context, onContextChange, onConfirm, onReject }: ConfirmReadingSheetProps) {
  return (
    <div lang="bn" className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="animate-in slide-in-from-bottom w-full max-w-md rounded-t-[32px] bg-white px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line" />
        <h2 id="confirm-title" className="text-center text-2xl font-bold text-ink">
          এই সুগারটি রাখব?
        </h2>

        <div className="mt-4 rounded-[28px] bg-pastel-blue py-6 text-center text-pastel-blue-ink">
          <p className="text-7xl font-bold leading-none">{toBanglaDigits(value)}</p>
          <p className="mt-2 text-lg font-semibold">{value <= 35 ? "mmol/L (মিলিমোল)" : `${(value / 18).toFixed(1)} mmol/L (${value} mg/dL)`}</p>
        </div>

        <p className="mt-5 text-lg font-semibold text-ink-soft">কখন মেপেছেন?</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {CONTEXTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={context === c}
              onClick={() => onContextChange(c)}
              className={`h-14 rounded-2xl border-2 text-lg font-semibold transition-colors ${
                context === c ? "border-ink bg-ink text-white" : "border-line bg-white text-ink active:bg-canvas"
              }`}
            >
              {CONTEXT_LABELS_BN[c]}
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onReject} className="btn-secondary h-16 text-xl">
            <X className="h-6 w-6" />
            না, ভুল
          </button>
          <button type="button" onClick={onConfirm} className="btn-primary h-16 text-xl">
            <Check className="h-6 w-6" />
            ঠিক আছে
          </button>
        </div>
      </div>
    </div>
  );
}
