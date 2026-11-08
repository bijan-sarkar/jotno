"use client";

import { useState } from "react";
import { fromBanglaDigits } from "@/lib/assistant/bangla";

interface NumberEntrySheetProps {
  onSubmit: (value: number) => void;
  onClose: () => void;
}

/** Manual fallback that works offline and when voice or photo fails. */
export default function NumberEntrySheet({ onSubmit, onClose }: NumberEntrySheetProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const raw = fromBanglaDigits(text).replace(/[^\d.]/g, "");
    const value = parseFloat(raw);
    if (isNaN(value) || value < 1.5 || value > 600) {
      setError("১.৫ থেকে ৩৫.০ mmol/L বা ২০ থেকে ৬০০ এর মধ্যে সংখ্যা লিখুন।");
      return;
    }
    onSubmit(value);
  };

  return (
    <div lang="bn" className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" role="dialog" aria-modal="true" aria-labelledby="entry-title" onClick={onClose}>
      <div
        className="animate-in slide-in-from-bottom w-full max-w-md rounded-t-[32px] bg-white px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line" />
        <h2 id="entry-title" className="text-center text-2xl font-bold text-ink">
          মিটারে কত দেখাচ্ছে?
        </h2>
        <input
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          inputMode="decimal"
          aria-label="সুগারের সংখ্যা"
          placeholder="৬.৫"
          className="input mt-5 h-20 text-center text-5xl font-bold"
        />
        <p className="mt-1.5 text-center text-sm font-semibold text-ink-muted">একক: mmol/L (মিলিমোল) বা mg/dL</p>
        {error && <p className="mt-2 text-center text-lg font-semibold text-risk-dangerInk">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="btn-secondary h-16 text-xl">
            বাতিল
          </button>
          <button type="button" onClick={submit} className="btn-primary h-16 text-xl">
            পরের ধাপ
          </button>
        </div>
      </div>
    </div>
  );
}
