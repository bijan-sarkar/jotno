"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Mic,
  MicOff,
  Camera,
  Loader2,
  DollarSign,
  AlertTriangle,
  Utensils,
  Volume2,
  VolumeX,
  Upload,
  Sparkles,
  ShoppingBag,
} from "lucide-react";

export type ScanMode = "grocery_bazaar" | "restaurant_menu" | "prepared_food";

interface IdentifiedItem {
  name: string;
  quantity: string;
  category?: string;
  gi_index: number;
  gl_load: number;
  risk_level?: "green" | "yellow" | "red";
  verified_rag_data?: { source: string } | null;
}

interface RecipeSuggestion {
  title: string;
  rationale: string;
  missing_ingredients?: string[];
  estimated_budget_level: "low" | "moderate" | "high";
}

interface MultimodalResult {
  identified_items: IdentifiedItem[];
  nutritional_summary: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    fiber_g: number;
    sodium_mg: number;
  };
  health_risk_alerts: string[];
  recipe_or_menu_suggestions: RecipeSuggestion[];
  voice_assistant_response: string;
  cost_estimate?: {
    total_cost_usd: number;
    budgetTier?: string;
    budget_tier?: string;
  };
}

export default function MultimodalScanner() {
  const [scanMode, setScanMode] = useState<ScanMode>("grocery_bazaar");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<MultimodalResult | null>(null);
  const [textPrompt, setTextPrompt] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize camera stream
  const startCamera = async () => {
    setCameraError(null);
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
    } catch (err: unknown) {
      console.warn("Camera access failed or unavailable:", err);
      setCameraError(
        "Camera inactive (using snapshot upload or presets for instant analysis)"
      );
      setCameraActive(false);
    }
  };

  useEffect(() => {
    // Attempt camera startup on mount if supported
    if (typeof navigator !== "undefined" && Boolean(navigator.mediaDevices)) {
      startCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Text-to-speech helper
  const speakResponse = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
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

  // Push-to-Talk handlers
  const handleVoiceStart = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices) {
        alert("Audio recording is not supported in this environment. You can type in the prompt box.");
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
    } catch (err) {
      console.error("Audio capture error:", err);
      // Fallback instruction
      setIsRecording(false);
    }
  };

  const handleVoiceStopAndSubmit = async () => {
    if (!mediaRecorderRef.current) {
      // If recorder was not initialized, perform standard submission
      submitMultimodalScan(null);
      return;
    }

    mediaRecorderRef.current.onstop = async () => {
      setIsRecording(false);
      const audioBlob =
        audioChunksRef.current.length > 0
          ? new Blob(audioChunksRef.current, { type: "audio/webm" })
          : null;
      await submitMultimodalScan(audioBlob);
    };

    if (mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const captureVideoSnapshot = async (): Promise<Blob | null> => {
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

  const submitMultimodalScan = async (audioBlob: Blob | null) => {
    setIsProcessing(true);
    try {
      const imageBlob: Blob | null = await captureVideoSnapshot();

      const formData = new FormData();
      formData.append("scan_mode", scanMode);
      if (textPrompt) {
        formData.append("query", textPrompt);
      }

      if (imageBlob) {
        formData.append("image", imageBlob, "capture.jpg");
      } else if (selectedImagePreview) {
        // If user uploaded a photo file
        formData.append("image", selectedImagePreview);
      }

      if (audioBlob) {
        formData.append("audio", audioBlob, "query.webm");
      }

      const res = await fetch("/api/scanner/multimodal", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (json.success && json.data) {
        setResult(json.data);
        if (json.data.voice_assistant_response) {
          speakResponse(json.data.voice_assistant_response);
        }
      }
    } catch (e) {
      console.error("Error during multimodal scan:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const loadSampleBasket = () => {
    setSelectedImagePreview("mock-preset");
    submitMultimodalScan(null);
  };

  return (
    <div className="flex flex-col h-full max-w-md mx-auto bg-slate-950 text-white rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
      {/* Mode Selector Tabs */}
      <div className="flex bg-slate-900 border-b border-slate-800 p-2 gap-1 text-xs font-semibold">
        {(["grocery_bazaar", "restaurant_menu", "prepared_food"] as const).map(
          (mode) => (
            <button
              key={mode}
              onClick={() => {
                setScanMode(mode);
                setResult(null);
              }}
              className={`flex-1 py-2 px-1 text-center rounded-lg transition-all capitalize text-[11px] ${
                scanMode === mode
                  ? "bg-emerald-600 text-white shadow font-bold"
                  : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              {mode.replace("_", " ")}
            </button>
          )
        )}
      </div>

      {/* Camera Viewfinder / Preview */}
      <div className="relative bg-black overflow-hidden flex items-center justify-center min-h-[300px] max-h-[360px]">
        {cameraActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-emerald-400">
              <Camera className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-300">
                {scanMode === "grocery_bazaar" && "Grocery & Produce Vision Mode"}
                {scanMode === "restaurant_menu" && "Restaurant Menu OCR & Diet Safety"}
                {scanMode === "prepared_food" && "Cooked Plate & Nutrition Sequence"}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {cameraError || "Hold the mic button below to ask about your food"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg flex items-center gap-1.5 border border-slate-700"
              >
                <Upload className="w-3.5 h-3.5" /> Upload Photo
              </button>
              <button
                onClick={loadSampleBasket}
                className="px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 text-xs rounded-lg flex items-center gap-1.5 border border-emerald-700/50"
              >
                <Sparkles className="w-3.5 h-3.5" /> Sample Preset
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
            <p className="text-xs font-medium text-slate-200">
              Querying USDA & RAG Knowledge Bases...
            </p>
          </div>
        )}

        {/* Live Audio Indicator */}
        {isRecording && (
          <div className="absolute top-4 left-4 right-4 bg-red-600/90 text-white text-xs px-3 py-2 rounded-full flex items-center justify-center gap-2 animate-pulse z-20">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            Listening to your question while scanning...
          </div>
        )}
      </div>

      {/* Query Bar */}
      <div className="px-4 py-2 bg-slate-900/90 border-t border-slate-800/80">
        <input
          type="text"
          value={textPrompt}
          onChange={(e) => setTextPrompt(e.target.value)}
          placeholder={
            scanMode === "restaurant_menu"
              ? "Ask: What on this menu won't spike my blood sugar?"
              : scanMode === "prepared_food"
              ? "Ask: How should I eat this plate to avoid a spike?"
              : "Ask: Is this diabetic-safe? What can I cook with this?"
          }
          className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              submitMultimodalScan(null);
            }
          }}
        />
      </div>

      {/* Push-to-Talk Dock */}
      <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-col gap-2">
        <div className="flex items-center justify-center gap-4">
          <button
            onMouseDown={handleVoiceStart}
            onMouseUp={handleVoiceStopAndSubmit}
            onTouchStart={handleVoiceStart}
            onTouchEnd={handleVoiceStopAndSubmit}
            disabled={isProcessing}
            aria-label="Push to Talk"
            className={`w-20 h-20 rounded-full flex flex-col items-center justify-center border-4 transition-all select-none ${
              isRecording
                ? "bg-red-500 border-red-300 scale-105 shadow-lg shadow-red-500/50"
                : "bg-emerald-600 border-emerald-400 hover:bg-emerald-500 active:scale-95"
            }`}
          >
            {isRecording ? (
              <MicOff className="w-8 h-8 text-white" />
            ) : (
              <Mic className="w-8 h-8 text-white" />
            )}
            <span className="text-[10px] uppercase font-bold mt-1 text-white tracking-wider">
              {isRecording ? "Release" : "Hold Mic"}
            </span>
          </button>
        </div>
        <div className="flex justify-between items-center text-[11px] text-slate-400 px-2">
          <span>Hold to speak & scan</span>
          <button
            onClick={() => submitMultimodalScan(null)}
            className="text-emerald-400 hover:underline font-medium"
          >
            Analyze Now →
          </button>
        </div>
      </div>

      {/* Results Drawer */}
      {result && (
        <div className="p-4 bg-slate-900/95 border-t border-slate-800 max-h-[420px] overflow-y-auto space-y-4">
          {/* Audio Response with Speech Readout */}
          {result.voice_assistant_response && (
            <div className="bg-emerald-950/70 border border-emerald-500/40 rounded-xl p-3 text-sm text-emerald-200 relative">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> GlucoVision Coach
                </span>
                <button
                  onClick={() =>
                    isSpeaking
                      ? stopSpeaking()
                      : speakResponse(result.voice_assistant_response)
                  }
                  className="text-emerald-300 hover:text-white p-1 rounded-md bg-emerald-900/50"
                  title={isSpeaking ? "Stop speech" : "Read aloud"}
                >
                  {isSpeaking ? (
                    <VolumeX className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-xs leading-relaxed">
                {result.voice_assistant_response}
              </p>
            </div>
          )}

          {/* Health Risk Alerts */}
          {result.health_risk_alerts?.length > 0 && (
            <div className="bg-amber-950/50 border border-amber-500/40 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4" /> Health & Glycemic Alerts
              </div>
              {result.health_risk_alerts.map((alert: string, i: number) => (
                <p key={i} className="text-xs text-amber-200/90 pl-5">
                  • {alert}
                </p>
              ))}
            </div>
          )}

          {/* Macro Breakdown */}
          {result.nutritional_summary && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-slate-800 p-2 rounded-lg border border-slate-700/50">
                <span className="text-[10px] text-slate-400 block">Calories</span>
                <span className="text-xs font-bold text-white">
                  {result.nutritional_summary.calories || 0}
                </span>
              </div>
              <div className="bg-slate-800 p-2 rounded-lg border border-slate-700/50">
                <span className="text-[10px] text-slate-400 block">Carbs</span>
                <span className="text-xs font-bold text-amber-400">
                  {result.nutritional_summary.carbs_g || 0}g
                </span>
              </div>
              <div className="bg-slate-800 p-2 rounded-lg border border-slate-700/50">
                <span className="text-[10px] text-slate-400 block">Protein</span>
                <span className="text-xs font-bold text-emerald-400">
                  {result.nutritional_summary.protein_g || 0}g
                </span>
              </div>
              <div className="bg-slate-800 p-2 rounded-lg border border-slate-700/50">
                <span className="text-[10px] text-slate-400 block">Fiber</span>
                <span className="text-xs font-bold text-blue-400">
                  {result.nutritional_summary.fiber_g || 0}g
                </span>
              </div>
            </div>
          )}

          {/* Cost Estimate from Kaggle Global Benchmarks */}
          {result.cost_estimate && (
            <div className="bg-slate-800/80 border border-emerald-600/30 rounded-xl p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Estimated Food Cost
                </span>
                <span className="text-xs font-bold text-emerald-400">
                  ${result.cost_estimate.total_cost_usd} USD
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Benchmark: {result.cost_estimate.budgetTier?.replace("_", " ")} tier based on Kaggle global food market pricing.
              </p>
            </div>
          )}

          {/* Identified Items with RAG Badges */}
          {result.identified_items?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" /> Detected Items & Glycemic Load
              </span>
              <div className="space-y-1.5">
                {result.identified_items.map((item: IdentifiedItem, idx: number) => (
                  <div
                    key={idx}
                    className="bg-slate-800/60 border border-slate-700/50 p-2 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-medium text-white">{item.name}</span>
                      <span className="text-[11px] text-slate-400 block">
                        {item.quantity}
                        {item.verified_rag_data && (
                          <span className="ml-1 text-[10px] text-emerald-400">
                            (RAG: {item.verified_rag_data.source})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          item.risk_level === "red" || item.gi_index >= 70
                            ? "bg-red-950 text-red-400 border border-red-700/50"
                            : item.risk_level === "yellow" || item.gi_index >= 55
                            ? "bg-amber-950 text-amber-400 border border-amber-700/50"
                            : "bg-emerald-950 text-emerald-400 border border-emerald-700/50"
                        }`}
                      >
                        GI {item.gi_index} · GL {item.gl_load}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recipe / Menu Suggestions */}
          {result.recipe_or_menu_suggestions?.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5 text-emerald-400" /> Actionable Recommendations
              </span>
              {result.recipe_or_menu_suggestions.map((rec: RecipeSuggestion, idx: number) => (
                <div
                  key={idx}
                  className="bg-slate-800/80 border border-slate-700/60 p-3 rounded-xl space-y-1"
                >
                  <div className="flex justify-between items-start">
                    <h4 className="text-xs font-semibold text-white">{rec.title}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-600/40 capitalize">
                      {rec.estimated_budget_level} cost
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {rec.rationale}
                  </p>
                  {(rec.missing_ingredients?.length ?? 0) > 0 && (
                    <p className="text-[11px] text-slate-400 pt-1">
                      <span className="text-amber-400 font-medium">Missing:</span>{" "}
                      {rec.missing_ingredients?.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
