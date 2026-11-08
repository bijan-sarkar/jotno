"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  Camera,
  Loader2,
  Sparkles,
  ShoppingBasket,
  Utensils,
  Salad,
  Volume2,
  VolumeX,
  Upload,
  Copy,
  Check,
  RotateCcw,
  AlertTriangle,
  DollarSign,
  ShieldCheck,
  Layers,
} from "lucide-react";
import type { MultimodalOutput } from "@/app/api/scanner/multimodal/route";

const PRESETS = [
  {
    key: "bazaar",
    label: "Bazaar Basket",
    icon: ShoppingBasket,
    badgeBg: "bg-pastel-lime",
    badgeInk: "text-pastel-lime-ink",
    desc: "Bitter gourd, red lentils, spinach, white potatoes, green chilies",
    presetPayload: "mock-preset",
    defaultQuery: "Is this diabetic-safe and what can I cook with this?",
  },
  {
    key: "cooked",
    label: "Cooked Meal Plate",
    icon: Salad,
    badgeBg: "bg-pastel-peach",
    badgeInk: "text-pastel-peach-ink",
    desc: "Steamed white rice, pan-seared salmon, sautéed mustard greens",
    presetPayload: "mock-cooked-meal",
    defaultQuery: "How should I sequence eating this meal to avoid a spike?",
  },
  {
    key: "menu",
    label: "Restaurant Menu",
    icon: Utensils,
    badgeBg: "bg-pastel-blue",
    badgeInk: "text-pastel-blue-ink",
    desc: "Tandoori chicken, dal tadka, butter naan, shahi paneer",
    presetPayload: "mock-restaurant-menu",
    defaultQuery: "What on this menu won't spike my blood sugar?",
  },
];

export default function UnifiedAutoScanner() {
  const [isRecording, setIsRecording] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<MultimodalOutput | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [textPrompt, setTextPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch {
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopCamera]);

  // SpeechSynthesis helpers
  const speakResponse = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Push-to-Talk recording handlers
  const handleVoiceStart = async () => {
    stopSpeaking();
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices) {
        setError("Audio recording unavailable. You can type in your prompt below.");
        return;
      }
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(audioStream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      setIsRecording(false);
      setError("Please allow microphone permissions to use voice instructions.");
    }
  };

  const handleVoiceStopAndSubmit = async () => {
    if (!mediaRecorderRef.current) {
      submitScan(null);
      return;
    }

    mediaRecorderRef.current.onstop = async () => {
      setIsRecording(false);
      const audioBlob =
        audioChunksRef.current.length > 0
          ? new Blob(audioChunksRef.current, { type: "audio/webm" })
          : null;
      await submitScan(audioBlob);
    };

    if (mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const captureFrameSnapshot = async (): Promise<Blob | null> => {
    if (videoRef.current && cameraActive) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          return await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.85)
          );
        }
      } catch {
        return null;
      }
    }
    return null;
  };

  const submitScan = async (
    audioBlob: Blob | null,
    presetOverride?: { payload: string; query: string }
  ) => {
    setIsScanning(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("scan_mode", "auto");

      const effectiveQuery = presetOverride ? presetOverride.query : textPrompt;
      if (effectiveQuery) {
        formData.append("query", effectiveQuery);
      }

      if (presetOverride) {
        formData.append("preset", presetOverride.payload);
      } else {
        const liveFrame = await captureFrameSnapshot();
        if (liveFrame) {
          formData.append("image", liveFrame, "camera_frame.jpg");
        } else if (imagePreview && !imagePreview.startsWith("data:image/svg")) {
          formData.append("image", imagePreview);
        } else {
          formData.append("preset", "mock-preset");
        }
      }

      if (audioBlob) {
        formData.append("audio", audioBlob, "query.webm");
      }

      const res = await fetch("/api/scanner/multimodal", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to analyze food scan");
      }

      setScanResult(json.data);
      if (json.data.voice_assistant_response) {
        speakResponse(json.data.voice_assistant_response);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error analyzing scan";
      setError(msg);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCopyScript = (scriptText: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(scriptText);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2200);
    }
  };

  const resetScan = () => {
    setScanResult(null);
    setImagePreview(null);
    setTextPrompt("");
    setError(null);
    stopSpeaking();
  };

  return (
    <div className="space-y-4">
      {/* Auto-detect Mode Banner */}
      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-2.5 shadow-soft border border-line">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-bold text-ink">Smart Universal Scanner</p>
            <p className="text-[11px] text-ink-muted">Auto-detects: Bazaar · Cooked Meals · Menus</p>
          </div>
        </div>
        <span className="rounded-full bg-pastel-lime px-2.5 py-1 text-[10px] font-bold text-pastel-lime-ink uppercase tracking-wide">
          Auto AI
        </span>
      </div>

      {/* Main Viewfinder / Photo Container */}
      {!scanResult && (
        <div className="relative overflow-hidden rounded-[32px] bg-white p-4 shadow-soft border border-line">
          {cameraActive ? (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={stopCamera}
                className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm"
              >
                Close Camera
              </button>
            </div>
          ) : imagePreview ? (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-900 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Scan preview"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => setImagePreview(null)}
                className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm"
              >
                Change Photo
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-pastel-blue/60 p-8 text-center text-pastel-blue-ink">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pastel-blue-strong text-white shadow-soft">
                <Camera className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-xl font-bold leading-snug">Take or upload a photo</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft max-w-xs">
                Scan fresh groceries, a cooked meal plate, or a restaurant menu — GlucoVision auto-identifies what it is.
              </p>

              <div className="mt-5 flex gap-2.5">
                <button
                  type="button"
                  onClick={startCamera}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-4 text-xs font-bold text-white shadow-soft active:scale-95 transition-transform"
                >
                  <Camera className="h-4 w-4" />
                  Open Camera
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-xs font-bold text-ink shadow-soft active:bg-canvas"
                >
                  <Upload className="h-4 w-4" />
                  Gallery Photo
                </button>
              </div>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Voice Audio Recording Pulse Indicator */}
          {isRecording && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30 animate-fade-in">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-pastel-coral-strong text-white">
                <span className="absolute inset-0 animate-ping rounded-full bg-pastel-coral-strong/50" />
                <Mic className="h-10 w-10 relative z-10" />
              </div>
              <p className="text-sm font-bold text-white">Recording your voice…</p>
              <p className="text-xs text-slate-200">Release the button to submit voice + photo</p>
            </div>
          )}

          {/* Processing Indicator */}
          {isScanning && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
              <Loader2 className="h-10 w-10 text-ink animate-spin" />
              <p className="text-sm font-bold text-ink">Analyzing food & querying RAG databases…</p>
              <p className="text-xs text-ink-muted">Auto-classifying Bazaar, Cooked Plate, or Menu</p>
            </div>
          )}
        </div>
      )}

      {/* Voice Prompt Text Bar (Optional Typing Alternative) */}
      {!scanResult && (
        <div className="card p-3 shadow-soft space-y-2">
          <label htmlFor="scan-text-query" className="text-xs font-bold text-ink block">
            Add a voice or text question (optional):
          </label>
          <div className="flex gap-2">
            <input
              id="scan-text-query"
              type="text"
              value={textPrompt}
              onChange={(e) => setTextPrompt(e.target.value)}
              placeholder="e.g. 'Can I eat this for dinner?' or 'What can I cook?'"
              className="input flex-1 h-11 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitScan(null);
              }}
            />
            <button
              type="button"
              onClick={() => submitScan(null)}
              disabled={isScanning}
              className="btn-primary h-11 px-4 text-xs font-bold shrink-0"
            >
              Analyze
            </button>
          </div>
        </div>
      )}

      {/* Primary Push-to-Talk Action Dock */}
      {!scanResult && (
        <div className="flex flex-col items-center justify-center py-2 space-y-3">
          <button
            type="button"
            onMouseDown={handleVoiceStart}
            onMouseUp={handleVoiceStopAndSubmit}
            onTouchStart={handleVoiceStart}
            onTouchEnd={handleVoiceStopAndSubmit}
            disabled={isScanning}
            aria-label="Hold to speak and scan"
            className={`relative flex h-28 w-28 flex-col items-center justify-center rounded-full text-white shadow-float transition-all select-none active:scale-95 ${
              isRecording
                ? "bg-pastel-coral-strong scale-110 shadow-lg"
                : "bg-ink hover:bg-slate-800"
            }`}
          >
            <Mic className={`h-10 w-10 ${isRecording ? "text-white" : "text-emerald-400"}`} />
            <span className="mt-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
              {isRecording ? "Release" : "Hold to Talk"}
            </span>
          </button>
          <p className="text-center text-xs font-semibold text-ink-muted">
            {isRecording
              ? "Listening to your question… Release to scan!"
              : "Hold button to ask: 'Is this diabetic-safe?' or tap presets below"}
          </p>
        </div>
      )}

      {/* Preset Pills: Test Auto-Detection with 1 Click */}
      {!scanResult && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-bold text-ink-muted uppercase tracking-wider px-1">
            Or test with a sample scan:
          </p>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() =>
                    submitScan(null, {
                      payload: p.presetPayload,
                      query: p.defaultQuery,
                    })
                  }
                  disabled={isScanning}
                  className={`flex flex-col items-start justify-between p-3 rounded-2xl ${p.badgeBg} ${p.badgeInk} text-left transition-transform active:scale-95 shadow-soft border border-line/40`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 shadow-sm">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="mt-3">
                    <p className="text-xs font-bold leading-tight">{p.label}</p>
                    <p className="text-[10px] opacity-80 mt-0.5 line-clamp-1">{p.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl bg-risk-danger p-4 text-xs font-bold text-risk-dangerInk">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RICH RESULTS SECTION ACCORDING TO AUTO-DETECTED TYPE                      */}
      {/* ========================================================================= */}
      {scanResult && (
        <div className="space-y-4 animate-fade-in pb-16">
          {/* Top Reset & Detection Bar */}
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold shadow-soft ${
                scanResult.detected_type === "restaurant_menu"
                  ? "bg-pastel-blue text-pastel-blue-ink"
                  : scanResult.detected_type === "prepared_food"
                  ? "bg-pastel-peach text-pastel-peach-ink"
                  : "bg-pastel-lime text-pastel-lime-ink"
              }`}
            >
              {scanResult.detected_type === "restaurant_menu" && <Utensils className="h-3.5 w-3.5" />}
              {scanResult.detected_type === "prepared_food" && <Salad className="h-3.5 w-3.5" />}
              {scanResult.detected_type === "grocery_bazaar" && <ShoppingBasket className="h-3.5 w-3.5" />}
              Auto-Detected: {scanResult.detected_title || scanResult.detected_type}
            </span>

            <button
              type="button"
              onClick={resetScan}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-soft active:bg-canvas"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New Scan
            </button>
          </div>

          {/* Voice Coach Spoken Response Card */}
          {scanResult.voice_assistant_response && (
            <div className="card p-4 space-y-2 border-emerald-500/30 bg-emerald-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  GlucoVision Coach Audio Feedback
                </span>
                <button
                  type="button"
                  onClick={() =>
                    isSpeaking
                      ? stopSpeaking()
                      : speakResponse(scanResult.voice_assistant_response)
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-emerald-800 shadow-soft active:bg-canvas"
                  aria-label={isSpeaking ? "Stop speech" : "Read aloud"}
                >
                  {isSpeaking ? <VolumeX className="h-4 w-4 text-red-500" /> : <Volume2 className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-sm font-semibold leading-relaxed text-ink">
                {scanResult.voice_assistant_response}
              </p>
            </div>
          )}

          {/* Health & Glycemic Risk Alerts */}
          {scanResult.health_risk_alerts && scanResult.health_risk_alerts.length > 0 && (
            <div className="space-y-2">
              {scanResult.health_risk_alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-2xl bg-risk-danger p-3.5 text-xs font-bold text-risk-dangerInk"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="leading-snug">{alert}</span>
                </div>
              ))}
            </div>
          )}

          {/* Mode 1 Specific: Cooked Meal Plate Sequencing */}
          {scanResult.detected_type === "prepared_food" && scanResult.plate_sequencing && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pastel-peach text-pastel-peach-ink">
                  <Layers className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-ink">Clinical Plate Sequencing</h3>
                  <p className="text-[11px] text-ink-muted">Eat in this exact order to flatten glucose spikes</p>
                </div>
              </div>
              <div className="space-y-2 pt-1">
                {scanResult.plate_sequencing.map((seq) => (
                  <div
                    key={seq.step}
                    className="flex items-start gap-3 rounded-2xl bg-canvas p-3 border border-line"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white shrink-0 mt-0.5">
                      {seq.step}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-ink">{seq.phase}</p>
                      <p className="text-xs text-ink-soft leading-relaxed mt-0.5">{seq.instruction}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mode 2 Specific: Restaurant Menu Waiter Script */}
          {scanResult.detected_type === "restaurant_menu" && scanResult.waiter_script && (
            <div className="card p-4 space-y-3 bg-pastel-blue/40 border border-pastel-blue-strong/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-pastel-blue-ink flex items-center gap-1.5">
                  <Utensils className="h-4 w-4" />
                  Ask Your Waiter (Customization Script)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyScript(scanResult.waiter_script!)}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink shadow-soft active:bg-canvas"
                >
                  {copiedScript ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy Script
                    </>
                  )}
                </button>
              </div>
              <p className="text-sm italic font-semibold text-pastel-blue-ink leading-relaxed">
                &ldquo;{scanResult.waiter_script}&rdquo;
              </p>
            </div>
          )}

          {/* Nutritional Macro Summary */}
          {scanResult.nutritional_summary && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="card p-3 shadow-soft">
                <span className="text-[10px] font-bold text-ink-muted uppercase block">Calories</span>
                <span className="text-base font-bold text-ink">{scanResult.nutritional_summary.calories || 0}</span>
              </div>
              <div className="card p-3 shadow-soft">
                <span className="text-[10px] font-bold text-ink-muted uppercase block">Carbs</span>
                <span className="text-base font-bold text-amber-700">{scanResult.nutritional_summary.carbs_g || 0}g</span>
              </div>
              <div className="card p-3 shadow-soft">
                <span className="text-[10px] font-bold text-ink-muted uppercase block">Protein</span>
                <span className="text-base font-bold text-emerald-700">{scanResult.nutritional_summary.protein_g || 0}g</span>
              </div>
              <div className="card p-3 shadow-soft">
                <span className="text-[10px] font-bold text-ink-muted uppercase block">Fiber</span>
                <span className="text-base font-bold text-blue-700">{scanResult.nutritional_summary.fiber_g || 0}g</span>
              </div>
            </div>
          )}

          {/* Mode 3 Specific: Kaggle Global Food Price Cost Estimate */}
          {scanResult.cost_estimate && (
            <div className="card p-3.5 shadow-soft border border-line flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <DollarSign className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-ink">Estimated Market Cost</p>
                  <p className="text-[11px] text-ink-muted">
                    Tier: <span className="capitalize font-semibold text-ink">{scanResult.cost_estimate.budget_tier?.replace("_", " ")}</span>
                  </p>
                </div>
              </div>
              <span className="text-base font-extrabold text-emerald-700">
                ${scanResult.cost_estimate.total_cost_usd} USD
              </span>
            </div>
          )}

          {/* Detected Items List with Traffic-Light GI & GL Badges */}
          {scanResult.identified_items && scanResult.identified_items.length > 0 && (
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Detected Food Items ({scanResult.identified_items.length})
              </p>
              <div className="space-y-2">
                {scanResult.identified_items.map((item, idx) => {
                  const isRed = item.risk_level === "red" || item.gi_index >= 70;
                  const isYellow = item.risk_level === "yellow" || (item.gi_index >= 55 && item.gi_index < 70);
                  const badgeClass = isRed
                    ? "bg-risk-danger text-risk-dangerInk"
                    : isYellow
                    ? "bg-risk-caution text-risk-cautionInk"
                    : "bg-risk-safe text-risk-safeInk";

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-2xl bg-canvas p-3 border border-line"
                    >
                      <div>
                        <p className="text-xs font-bold text-ink">{item.name}</p>
                        <p className="text-[11px] text-ink-muted">
                          {item.quantity}
                          {item.verified_rag_data && (
                            <span className="ml-1 text-[10px] font-semibold text-emerald-700">
                              · RAG: {item.verified_rag_data.source}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${badgeClass}`}>
                        GI {item.gi_index} · GL {item.gl_load}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recipe or Menu Recommendations */}
          {scanResult.recipe_or_menu_suggestions && scanResult.recipe_or_menu_suggestions.length > 0 && (
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Recommendations & Actionable Meals
              </p>
              <div className="space-y-2.5">
                {scanResult.recipe_or_menu_suggestions.map((rec, idx) => (
                  <div key={idx} className="rounded-2xl bg-canvas p-3.5 border border-line space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-ink">{rec.title}</h4>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-ink-soft border border-line capitalize">
                        {rec.estimated_budget_level} budget
                      </span>
                    </div>
                    <p className="text-xs text-ink-soft leading-relaxed">{rec.rationale}</p>
                    {rec.missing_ingredients && rec.missing_ingredients.length > 0 && (
                      <p className="text-[11px] text-ink-muted pt-1">
                        <span className="font-bold text-amber-700">Missing ingredients:</span>{" "}
                        {rec.missing_ingredients.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Action: Scan Another */}
          <button
            type="button"
            onClick={resetScan}
            className="btn-primary h-14 w-full text-sm font-bold shadow-soft"
          >
            Scan Another Food Item
          </button>
        </div>
      )}
    </div>
  );
}
