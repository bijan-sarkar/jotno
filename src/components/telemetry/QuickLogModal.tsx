"use client";

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { GlucoseLog, MeasurementContext } from "@/lib/validations/telemetry";

interface QuickLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (log: GlucoseLog) => void;
  currentDayOffset?: number;
}

export default function QuickLogModal({
  isOpen,
  onClose,
  onSave,
  currentDayOffset = 7,
}: QuickLogModalProps) {
  const [glucoseValue, setGlucoseValue] = useState<string>("");
  const [context, setContext] = useState<MeasurementContext>("fasting");
  const [mealTitle, setMealTitle] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [dayOffset, setDayOffset] = useState<number>(currentDayOffset);
  const [error, setError] = useState<string | null>(null);

  // Check if a recent meal was saved from MenuSafe or Recipes
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("glucovision_current_meal");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.dish_name) {
            setMealTitle(parsed.dish_name);
            setContext("post_meal");
          } else if (parsed.title) {
            setMealTitle(parsed.title);
            setContext("post_meal");
          }
        } catch {
          // ignore
        }
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const val = parseFloat(glucoseValue);
    if (isNaN(val) || val < 1.5 || val > 600) {
      setError("Please enter a valid glucose reading between 1.5 and 35.0 mmol/L (or 30 to 600 mg/dL).");
      return;
    }

    const mgValue = val <= 35 ? Math.round(val * 18.0182) : Math.round(val);
    const newLog: GlucoseLog = {
      id: "log-" + Date.now(),
      glucose_value: mgValue,
      context,
      measured_at: new Date().toISOString(),
      notes: notes.trim() || (val <= 35 ? `${val} mmol/L` : undefined),
      linked_meal_title: mealTitle.trim() || undefined,
      day_offset: dayOffset,
    };

    onSave(newLog);
    setGlucoseValue("");
    setNotes("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 animate-in fade-in duration-200"
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-sheet-title"
        className="relative w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-[32px] bg-white px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-float animate-in slide-in-from-bottom duration-300"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />

        <div className="mb-4 flex items-center justify-between">
          <h3 id="log-sheet-title" className="text-lg font-bold text-ink">
            Log a reading
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-muted active:bg-canvas"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-2xl bg-risk-danger p-3 text-sm font-semibold text-risk-dangerInk">{error}</div>
          )}

          {/* Reading Input */}
          <div className="flex flex-col items-center justify-center rounded-[28px] bg-pastel-blue px-4 py-7">
            <div className="flex items-end justify-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="1.5"
                max="600"
                autoFocus
                required
                aria-label="Glucose level in mmol/L or mg/dL"
                value={glucoseValue}
                onChange={(e) => setGlucoseValue(e.target.value)}
                placeholder="6.5"
                className="w-44 bg-transparent text-center text-6xl font-extrabold text-pastel-blue-ink placeholder:text-pastel-blue-strong/60 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="mb-3 text-base font-bold text-pastel-blue-ink">mmol/L</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-pastel-blue-ink/75">
              Bangladesh standard (mmol/L) · or enter mg/dL (&gt; 35)
            </p>
          </div>

          {/* Context Chips */}
          <div className="space-y-2">
            <p className="section-title">When did you measure?</p>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "fasting", label: "Fasting" },
                { id: "post_meal", label: "2h after meal" },
                { id: "bedtime", label: "Bedtime" },
                { id: "random", label: "Other time" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setContext(c.id as MeasurementContext)}
                  aria-pressed={context === c.id}
                  className="chip-toggle h-11"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Linked Meal */}
          <label className="block space-y-2">
            <span className="section-title block">What did you eat? (optional)</span>
            <input
              type="text"
              value={mealTitle}
              onChange={(e) => setMealTitle(e.target.value)}
              placeholder="e.g. Grilled fish, dal"
              className="input"
            />
          </label>

          {/* Day Offset */}
          <label className="flex items-center justify-between gap-4">
            <span className="section-title">Plan day</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="84"
              value={dayOffset}
              onChange={(e) => setDayOffset(parseInt(e.target.value) || 0)}
              className="input w-24 text-center"
            />
          </label>

          <button
            type="submit"
            className="btn-primary"
          >
            Save reading
          </button>
        </form>
      </div>
    </div>
  );
}
