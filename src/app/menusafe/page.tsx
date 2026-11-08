"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import {
  Utensils,
  Camera,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Maximize2,
  X,
  ShoppingBasket,
  Search,
  Sparkles,
} from "lucide-react";
import type { MenuItem, MenuScanResponse } from "@/lib/validations/menusafe";
import PageHeader from "@/components/app/PageHeader";

export default function MenuSafePage() {
  const [textInput, setTextInput] = useState<string>("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<MenuScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);
  const [showWaiterModalItem, setShowWaiterModalItem] = useState<MenuItem | null>(null);
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImagePreview(base64);
      executeScan({ imageBase64: base64 });
    };
    reader.readAsDataURL(file);
  };

  const executeScan = async (payload: { text?: string; imageBase64?: string }) => {
    setIsScanning(true);
    setError(null);

    try {
      const res = await fetch("/api/scan/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Menu scan failed");
      }

      setScanResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to scan menu.");
    } finally {
      setIsScanning(false);
    }
  };

  const handlePreset = (presetText: string) => {
    setTextInput(presetText);
    setImagePreview(null);
    executeScan({ text: presetText });
  };

  const handleCopyScript = (item: MenuItem) => {
    navigator.clipboard.writeText(item.waiter_script);
    setCopiedScriptId(item.id);
    setTimeout(() => {
      setCopiedScriptId(null);
    }, 2000);
  };

  const handleSelectCurrentMeal = (item: MenuItem) => {
    setSelectedMealId(item.id);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("glucovision_current_meal", JSON.stringify(item));
    }
  };

  const renderDish = (item: MenuItem, risky: boolean) => {
    const selected = selectedMealId === item.id;
    const copied = copiedScriptId === item.id;
    const chips = risky ? item.flagged_traps : item.safe_elements;
    const riskBg = risky ? "bg-risk-danger" : "bg-risk-safe";
    const riskInk = risky ? "text-risk-dangerInk" : "text-risk-safeInk";

    return (
      <div key={item.id} className="card space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span className={`icon-badge ${riskBg} ${riskInk}`}>
            {risky ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-snug text-ink">{item.dish_name}</p>
            <p className={`text-xs font-bold ${riskInk}`}>{risky ? "High spike risk" : "Good choice"}</p>
          </div>
        </div>

        {chips && chips.length > 0 && (
          <div className="space-y-1.5">
            <p className="section-title">{risky ? "Hidden sugars & starches" : "What makes it a good pick"}</p>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip, idx) => (
                <span key={idx} className={`rounded-full px-3 py-1 text-xs font-bold ${riskBg} ${riskInk}`}>
                  {risky ? "⚠ " : "✓ "}
                  {chip}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm leading-relaxed text-ink-soft">{item.clinical_rationale}</p>

        {/* Waiter script (TC-P4-02) */}
        <div className="space-y-2.5 rounded-2xl bg-pastel-blue/50 p-3.5 text-pastel-blue-ink">
          <p className="text-xs font-bold">{risky ? "Ask your waiter" : "Tip for your waiter"}</p>
          <p className="text-sm font-semibold italic leading-relaxed">&ldquo;{item.waiter_script}&rdquo;</p>

          {risky && item.suggested_side_swap && (
            <p className="text-sm">
              <span className="font-bold">Swap: </span>
              {item.suggested_side_swap}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleCopyScript(item)}
              className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-white text-sm font-bold text-ink active:bg-canvas"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-risk-safeInk" />
                  <span className="text-risk-safeInk">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowWaiterModalItem(item)}
              className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-white text-sm font-bold text-ink active:bg-canvas"
            >
              <Maximize2 className="h-4 w-4" />
              Show waiter
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleSelectCurrentMeal(item)}
          aria-pressed={selected}
          className={selected ? "btn-primary" : "btn-secondary"}
        >
          {selected ? (
            <>
              <Check className="h-5 w-5" /> Ordering
            </>
          ) : (
            "I'm having this"
          )}
        </button>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Scan" subtitle="Check foods before you buy or order" />

      <main className="px-4 py-4 space-y-5">
        {/* Groceries / Menu / Live Voice segmented control */}
        <div className="grid grid-cols-3 gap-1 rounded-full bg-white p-1 shadow-soft">
          <Link
            href="/scanner"
            className="flex h-11 items-center justify-center gap-1.5 rounded-full text-xs font-semibold text-ink-soft active:bg-canvas"
          >
            <ShoppingBasket className="h-4 w-4" />
            Groceries
          </Link>
          <span
            aria-current="page"
            className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-ink text-xs font-bold text-white"
          >
            <Utensils className="h-4 w-4" />
            Menu
          </span>
          <Link
            href="/live"
            className="flex h-11 items-center justify-center gap-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-emerald-50 active:bg-emerald-100"
          >
            <Sparkles className="h-4 w-4 text-emerald-600" />
            Live Voice
          </Link>
        </div>

        {/* Photo upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileUpload}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isScanning}
          className="tile flex w-full flex-col items-center justify-center gap-3 bg-pastel-peach p-5 text-center text-pastel-peach-ink active:brightness-95 disabled:opacity-50"
        >
          {imagePreview ? (
            <span className="block h-36 w-full overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Menu photo" className="h-full w-full object-cover" />
            </span>
          ) : (
            <span className="fab h-16 w-16 bg-pastel-peach-strong">
              <Camera className="h-7 w-7" />
            </span>
          )}
          <span>
            <span className="block text-lg font-extrabold">
              {imagePreview ? "Use a different photo" : "Take a photo of the menu"}
            </span>
            {!imagePreview && (
              <span className="mt-1 block text-sm font-semibold opacity-80">
                We&apos;ll flag dishes with hidden sugars and starches
              </span>
            )}
          </span>
        </button>

        {/* Text input */}
        <div className="space-y-2">
          <label htmlFor="menu-text" className="section-title">
            Or type a dish name
          </label>
          <div className="flex gap-2">
            <input
              id="menu-text"
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && textInput.trim()) {
                  e.preventDefault();
                  executeScan({ text: textInput });
                }
              }}
              placeholder="e.g. Honey glazed chicken"
              className="input min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={() => textInput.trim() && executeScan({ text: textInput })}
              disabled={isScanning || !textInput.trim()}
              aria-label="Check dish"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-white active:bg-black disabled:opacity-40"
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Example dishes (TC-P4-01 presets) */}
        <div className="space-y-2">
          <p className="section-title">Try an example</p>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <button
              type="button"
              onClick={() => handlePreset("Crispy Honey Glazed Chicken in Sweet Corn Gravy")}
              className="chip-toggle shrink-0"
            >
              <AlertTriangle className="h-4 w-4 text-pastel-coral-strong" />
              Honey glazed chicken
            </button>
            <button
              type="button"
              onClick={() => handlePreset("Tandoori Grilled Fish with Mint Yoghurt & Steamed Broccoli")}
              className="chip-toggle shrink-0"
            >
              <ShieldCheck className="h-4 w-4 text-pastel-lime-strong" />
              Tandoori grilled fish
            </button>
          </div>
        </div>

        {isScanning && (
          <div className="card flex items-center justify-center gap-3 p-4 text-sm font-bold text-ink">
            <RefreshCw className="h-4 w-4 animate-spin text-pastel-peach-strong" />
            <span>Reading the menu…</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-2xl bg-risk-danger p-4 text-sm font-semibold text-risk-dangerInk">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Results */}
        {scanResult && !isScanning && (
          <section className="space-y-5 pt-1">
            <div className="card space-y-2 p-4">
              <div className="flex items-center gap-3">
                <span className="icon-badge bg-pastel-blue text-pastel-blue-ink">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">Summary</p>
                  <p className="truncate text-xs font-semibold text-ink-muted">{scanResult.restaurant_type}</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-ink-soft">{scanResult.overall_menu_verdict}</p>
            </div>

            {scanResult.risky_traps.length > 0 && (
              <div className="space-y-3">
                <h2 className="section-title flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-pastel-coral-strong" />
                  Watch out ({scanResult.risky_traps.length})
                </h2>
                {scanResult.risky_traps.map((item) => renderDish(item, true))}
              </div>
            )}

            {scanResult.safe_selections.length > 0 && (
              <div className="space-y-3">
                <h2 className="section-title flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-pastel-lime-strong" />
                  Good choices ({scanResult.safe_selections.length})
                </h2>
                {scanResult.safe_selections.map((item) => renderDish(item, false))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* "Show to waiter" high-contrast bottom sheet for loud/dim restaurants */}
      {showWaiterModalItem && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 animate-in fade-in"
          onClick={() => setShowWaiterModalItem(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Show to waiter"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-5 rounded-t-[32px] bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-ink shadow-float animate-in slide-in-from-bottom"
          >
            <div className="mx-auto h-1.5 w-12 rounded-full bg-line" />
            <div className="flex items-center justify-between">
              <span className="section-title">Show this to your waiter</span>
              <button
                type="button"
                onClick={() => setShowWaiterModalItem(null)}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full text-ink active:bg-canvas"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-bold text-ink-soft">{showWaiterModalItem.dish_name}</p>
              <p className="text-2xl font-extrabold leading-snug text-ink">
                &ldquo;{showWaiterModalItem.waiter_script}&rdquo;
              </p>
            </div>

            <p className="border-t border-line pt-3 text-sm text-ink-muted">
              I&apos;m diabetic — thank you for helping me order safely!
            </p>

            <button type="button" onClick={() => setShowWaiterModalItem(null)} className="btn-primary">
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
