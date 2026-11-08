"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Video,
  VideoOff,
  ArrowUp,
  Mic,
  MicOff,
  X,
  RotateCcw,
  MoreHorizontal,
  Volume2,
  VolumeX,
  Copy,
  Check,
  AlertTriangle,
  ShoppingBasket,
  Utensils,
  Salad,
  Sparkles,
  ChevronDown,
  Layers,
} from "lucide-react";
import type { MultimodalOutput } from "@/app/api/scanner/multimodal/route";
import { speak, stopSpeaking } from "@/lib/assistant/client";

const SAMPLE_PRESETS = [
  {
    key: "bazaar",
    title: "🥕 Bazaar Produce Basket",
    subtitle: "Bitter gourd, red lentils, spinach, potatoes, chilies",
    payload: "mock-preset",
    query: "Are these items diabetic-safe and what can I cook?",
  },
  {
    key: "cooked",
    title: "🍽️ Cooked Meal Plate",
    subtitle: "Steamed rice, salmon fillet, sautéed greens",
    payload: "mock-cooked-meal",
    query: "How should I sequence eating this meal to avoid a spike?",
  },
  {
    key: "menu",
    title: "📋 Restaurant Menu",
    subtitle: "Tandoori chicken, dal tadka, butter naan, paneer",
    payload: "mock-restaurant-menu",
    query: "What on this menu won't spike my blood sugar?",
  },
];

export default function GeminiLiveScanner() {
  const router = useRouter();

  // Camera state
  const [cameraActive, setCameraActive] = useState(true);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // Audio / Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Analysis & Results
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<MultimodalOutput | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLiveResult, setIsLiveResult] = useState<boolean | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [textPrompt, setTextPrompt] = useState("");
  const [sheetCollapsed, setSheetCollapsed] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Start or restart camera stream
  const [isFlashing, setIsFlashing] = useState(false);

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (typeof navigator === "undefined" || !navigator.mediaDevices) {
        setCameraActive(false);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
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
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      stopCamera();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [facingMode, startCamera, stopCamera]);

  const toggleFlipCamera = () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    startCamera(nextFacing);
  };

  const toggleCameraPower = () => {
    if (cameraActive) {
      stopCamera();
    } else {
      startCamera(facingMode);
    }
  };

  // Speech helpers using authentic neural Bangla lady voice
  const speakResponse = async (text: string) => {
    if (!text) return;
    setIsSpeaking(true);
    await speak(text);
    setIsSpeaking(false);
  };

  // Push-to-Talk voice capture handlers
  const handleVoiceStart = async () => {
    stopSpeaking();
    if (isMuted) return;
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
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

  const compressImageForFastScan = async (
    fileOrBlob: Blob,
    maxDim = 800,
    quality = 0.72
  ): Promise<Blob> => {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        const url = URL.createObjectURL(fileOrBlob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(fileOrBlob);
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((b) => resolve(b || fileOrBlob), "image/jpeg", quality);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(fileOrBlob);
        };
        img.src = url;
      } catch {
        resolve(fileOrBlob);
      }
    });
  };

  const captureFrameSnapshot = async (): Promise<Blob | null> => {
    if (videoRef.current && cameraActive) {
      try {
        const video = videoRef.current;
        const maxDim = 800;
        let w = video.videoWidth || 640;
        let h = video.videoHeight || 480;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          return await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.75)
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
    presetOverride?: { payload: string; query: string },
    fileOverride?: File | Blob
  ) => {
    setErrorMessage(null);
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);
    setIsProcessing(true);
    setSheetCollapsed(false);
    try {
      const formData = new FormData();
      formData.append("scan_mode", "auto");

      const queryToSend = presetOverride ? presetOverride.query : textPrompt;
      if (queryToSend) {
        formData.append("query", queryToSend);
      }

      if (presetOverride) {
        formData.append("preset", presetOverride.payload);
      } else if (fileOverride) {
        const compressed = await compressImageForFastScan(fileOverride, 800, 0.75);
        formData.append("image", compressed, "upload.jpg");
      } else {
        const frame = await captureFrameSnapshot();
        if (frame) {
          formData.append("image", frame, "frame.jpg");
        } else if (capturedImage) {
          formData.append("image", capturedImage);
        } else {
          formData.append("preset", "mock-preset");
        }
      }

      if (audioBlob) {
        formData.append("audio", audioBlob, "voice.webm");
      }

      const res = await fetch("/api/scanner/multimodal", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let errMessage = "স্ক্যান সম্পন্ন করা সম্ভব হয়নি।";
        try {
          const errData = await res.json();
          errMessage = errData.error || errMessage;
        } catch {
          errMessage =
            res.status === 504
              ? "সার্ভার টাইমআউট (Vercel timeout)। আবার চেষ্টা করুন।"
              : `সার্ভার ত্রুটি (${res.status})`;
        }
        setErrorMessage(errMessage);
        setIsProcessing(false);
        return;
      }

      const json = await res.json();
      if (json.success && json.data) {
        setResult(json.data);
        setIsLiveResult(json.isLive ?? null);
        setIsProcessing(false);
        if (json.data.voice_assistant_response) {
          speakResponse(json.data.voice_assistant_response);
        }
      } else {
        setErrorMessage(json.error || "স্ক্যান ফলাফল পাওয়া যায়নি।");
      }
    } catch (err: unknown) {
      console.error("Jotno Live scan error:", err);
      setErrorMessage("নেটওয়ার্ক ত্রুটি। ইন্টারনেট সংযোগ পরীক্ষা করুন।");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageForFastScan(file, 800, 0.75);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCapturedImage(event.target?.result as string);
      submitScan(null, undefined, compressed);
    };
    reader.readAsDataURL(compressed);
  };

  const handleCopyScript = (scriptText: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(scriptText);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    }
  };

  const closeLiveSession = () => {
    stopCamera();
    stopSpeaking();
    router.push("/dashboard");
  };

  return (
    <div className="relative h-[100dvh] w-full bg-black text-white overflow-hidden select-none font-sans flex flex-col justify-between">
      {/* ===================================================================== */}
      {/* 1. CAMERA BACKGROUND VIEWFINDER                                       */}
      {/* ===================================================================== */}
      <div className="absolute inset-0 z-0 bg-black flex items-center justify-center overflow-hidden">
        {cameraActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : capturedImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capturedImage}
            alt="Capture preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 text-slate-400">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white/70">
              <VideoOff className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-white">Camera is paused</p>
            <p className="text-xs text-slate-400 max-w-xs">
              Tap the blue camera button below or select a sample preset to scan food items.
            </p>
          </div>
        )}

        {/* Live scanning target crosshair / reticle lines */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-64 h-64 border-2 border-white/20 rounded-3xl">
            <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-white rounded-tl" />
            <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-white rounded-tr" />
            <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-white rounded-bl" />
            <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-white rounded-br" />
          </div>
        </div>

        {/* Shutter flash effect */}
        {isFlashing && (
          <div className="absolute inset-0 bg-white/70 z-30 pointer-events-none transition-opacity duration-200" />
        )}

        {/* Processing Spinner Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center gap-3 z-30 animate-fade-in">
            <div className="relative flex items-center justify-center">
              <span className="absolute w-20 h-20 rounded-full bg-cyan-500/20 animate-ping" />
              <div className="w-16 h-16 rounded-full border-4 border-cyan-400/30 border-t-cyan-400 animate-spin" />
              <Sparkles className="w-7 h-7 text-cyan-300 absolute" />
            </div>
            <p className="text-sm font-bold text-white tracking-wide">
              Jotno Live is analyzing…
            </p>
            <p className="text-xs text-cyan-200/80">
              বাজার, খাবার বা মেনু দ্রুত বিশ্লেষণ করা হচ্ছে…
            </p>
          </div>
        )}

        {/* Recording Voice Pulse Indicator */}
        {isRecording && (
          <div className="absolute top-20 inset-x-4 mx-auto max-w-xs bg-red-600/90 backdrop-blur-md text-white text-xs py-2 px-4 rounded-full flex items-center justify-center gap-2 shadow-2xl z-30 animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
            <span className="font-bold">Listening… Release to analyze</span>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 2. TOP FLOATING STATUS & CONTROLS HUD                                 */}
      {/* ===================================================================== */}
      <header className="relative z-20 pt-[calc(env(safe-area-inset-top)+1rem)] px-5 flex items-center justify-between">
        {/* Top-Left: Jotno Live Status Pill & Mode Badge */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPresets((p) => !p)}
            aria-label="Toggle sample presets & options"
            className="h-10 px-3.5 rounded-full bg-emerald-600/90 hover:bg-emerald-500 active:scale-95 text-white flex items-center gap-2 shadow-lg backdrop-blur-md transition-all border border-emerald-400/30"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
            <span className="text-xs font-bold tracking-wide select-none text-white">Jotno Live</span>
          </button>
          {isLiveResult === true && (
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-semibold backdrop-blur-md">
              ⚡ লাইভ AI
            </span>
          )}
          {isLiveResult === false && (
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 font-semibold backdrop-blur-md">
              ডেমো মোড
            </span>
          )}
        </div>

        {/* Top-Right: 3 Translucent Circular Buttons */}
        <div className="flex items-center gap-2.5">
          {/* Flip Camera */}
          <button
            type="button"
            onClick={toggleFlipCamera}
            aria-label="Flip camera"
            className="w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 active:scale-90 border border-white/15 backdrop-blur-xl flex items-center justify-center text-white shadow-lg transition-transform"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          {/* Camera Mute / Off toggle */}
          <button
            type="button"
            onClick={toggleCameraPower}
            aria-label="Toggle camera"
            className="w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 active:scale-90 border border-white/15 backdrop-blur-xl flex items-center justify-center text-white shadow-lg transition-transform"
          >
            {cameraActive ? <Video className="w-5 h-5 text-white" /> : <VideoOff className="w-5 h-5 text-red-400" />}
          </button>

          {/* More / Presets Menu */}
          <button
            type="button"
            onClick={() => setShowPresets((prev) => !prev)}
            aria-label="Options"
            className="w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 active:scale-90 border border-white/15 backdrop-blur-xl flex items-center justify-center text-white shadow-lg transition-transform"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Error notification banner */}
      {errorMessage && (
        <div className="relative z-30 mx-4 mt-2 bg-red-950/95 border border-red-500/60 backdrop-blur-md text-white text-xs p-3 rounded-2xl flex items-start justify-between gap-3 shadow-2xl animate-fade-in">
          <div className="flex items-start gap-2">
            <span className="text-red-400 font-bold text-sm shrink-0">⚠️</span>
            <p className="text-xs leading-relaxed text-red-100">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-300 hover:text-white p-1 text-sm font-bold shrink-0"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. PRESETS POPUP / QUICK DRAWER (ACCESSIBLE VIA TOP HUD)              */}
      {/* ===================================================================== */}
      {showPresets && (
        <div className="relative z-30 mx-4 mt-2 p-3 bg-slate-950/95 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between pb-1 border-b border-white/10">
            <span className="text-xs font-bold text-slate-300">Quick Test & Voice Question</span>
            <button
              type="button"
              onClick={() => setShowPresets(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Optional custom text query */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={textPrompt}
              onChange={(e) => setTextPrompt(e.target.value)}
              placeholder="Ask custom question (or hold capsule below)..."
              className="flex-1 bg-white/10 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setShowPresets(false);
                  submitScan(null);
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                setShowPresets(false);
                submitScan(null);
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white shrink-0 active:scale-95"
            >
              Ask
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {SAMPLE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setShowPresets(false);
                  submitScan(null, { payload: p.payload, query: p.query });
                }}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-left transition-all border border-white/10"
              >
                <p className="text-xs font-bold text-white">{p.title}</p>
                <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{p.subtitle}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hidden File Picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* ===================================================================== */}
      {/* 4. RESULTS FLOATING SHEET / TRANSLUCENT HUD                           */}
      {/* ===================================================================== */}
      {result && (
        <div className="relative z-20 mx-4 mb-2 bg-slate-950/90 backdrop-blur-2xl border border-white/20 rounded-3xl p-4 shadow-2xl max-h-[55vh] overflow-y-auto space-y-3.5 no-scrollbar">
          {/* Header & Category Badge */}
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                result.detected_type === "restaurant_menu"
                  ? "bg-blue-600/80 text-blue-100 border border-blue-400/30"
                  : result.detected_type === "prepared_food"
                  ? "bg-amber-600/80 text-amber-100 border border-amber-400/30"
                  : "bg-emerald-600/80 text-emerald-100 border border-emerald-400/30"
              }`}
            >
              {result.detected_type === "restaurant_menu" && <Utensils className="w-3.5 h-3.5" />}
              {result.detected_type === "prepared_food" && <Salad className="w-3.5 h-3.5" />}
              {result.detected_type === "grocery_bazaar" && <ShoppingBasket className="w-3.5 h-3.5" />}
              {result.detected_title || result.detected_type}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  isSpeaking
                    ? stopSpeaking()
                    : speakResponse(result.voice_assistant_response)
                }
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                title={isSpeaking ? "Mute" : "Listen"}
              >
                {isSpeaking ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-300" />}
              </button>
              <button
                type="button"
                onClick={() => setSheetCollapsed((c) => !c)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${sheetCollapsed ? "rotate-180" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-white"
                title="Dismiss result"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!sheetCollapsed && (
            <>
              {/* Voice Coach Spoken Message */}
              {result.voice_assistant_response && (
                <div className="bg-cyan-950/60 border border-cyan-500/40 rounded-2xl p-3 text-xs text-cyan-200 leading-relaxed">
                  <span className="font-bold text-white block mb-0.5">Jotno Live Coach (যত্ন লাইভ কোচ):</span>
                  {result.voice_assistant_response}
                </div>
              )}

              {/* Health Risk Alerts */}
              {result.health_risk_alerts && result.health_risk_alerts.length > 0 && (
                <div className="space-y-1.5">
                  {result.health_risk_alerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className="bg-red-950/70 border border-red-500/50 rounded-xl p-2.5 text-xs text-red-200 flex items-start gap-2 font-medium"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                      <span>{alert}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Mode 1: Cooked Food Plate Sequencing */}
              {result.detected_type === "prepared_food" && result.plate_sequencing && (
                <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-3 space-y-2">
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> Clinical Plate Eating Sequence
                  </span>
                  <div className="space-y-1.5">
                    {result.plate_sequencing.map((s) => (
                      <div key={s.step} className="bg-white/5 rounded-xl p-2 flex items-start gap-2 text-xs">
                        <span className="w-5 h-5 rounded-full bg-amber-500/30 text-amber-300 font-bold flex items-center justify-center shrink-0">
                          {s.step}
                        </span>
                        <div>
                          <p className="font-semibold text-white">{s.phase}</p>
                          <p className="text-slate-300 text-[11px] leading-tight">{s.instruction}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mode 2: Restaurant Menu Waiter Script */}
              {result.detected_type === "restaurant_menu" && result.waiter_script && (
                <div className="bg-blue-950/60 border border-blue-500/40 rounded-2xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-200 flex items-center gap-1.5">
                      <Utensils className="w-3.5 h-3.5" /> Waiter Customization Script
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyScript(result.waiter_script!)}
                      className="px-2.5 py-1 rounded-full bg-blue-600/80 hover:bg-blue-500 text-[11px] font-bold text-white flex items-center gap-1"
                    >
                      {copiedScript ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                      {copiedScript ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs italic text-blue-100 font-medium leading-relaxed">
                    &ldquo;{result.waiter_script}&rdquo;
                  </p>
                </div>
              )}

              {/* Nutritional Summary Badges */}
              {result.nutritional_summary && (
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="bg-white/10 rounded-xl p-2 border border-white/5">
                    <span className="text-[10px] text-slate-400 block">Calories</span>
                    <span className="text-xs font-bold text-white">{result.nutritional_summary.calories || 0}</span>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2 border border-white/5">
                    <span className="text-[10px] text-slate-400 block">Carbs</span>
                    <span className="text-xs font-bold text-amber-300">{result.nutritional_summary.carbs_g || 0}g</span>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2 border border-white/5">
                    <span className="text-[10px] text-slate-400 block">Protein</span>
                    <span className="text-xs font-bold text-emerald-300">{result.nutritional_summary.protein_g || 0}g</span>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2 border border-white/5">
                    <span className="text-[10px] text-slate-400 block">Fiber</span>
                    <span className="text-xs font-bold text-cyan-300">{result.nutritional_summary.fiber_g || 0}g</span>
                  </div>
                </div>
              )}

              {/* Mode 3: Local Bazaar Price Benchmark in Bangladeshi Taka */}
              {result.cost_estimate && (
                <div className="bg-white/10 border border-white/10 rounded-2xl p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-sm">৳</span>
                    <span className="text-slate-300">
                      বাজারের আনুমানিক খরচ: <strong className="text-white">৳{result.cost_estimate.total_cost_bdt || Math.round((result.cost_estimate.total_cost_usd || 0) * 120)} টাকা</strong>
                    </span>
                  </div>
                  <span className="capitalize text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold">
                    {result.cost_estimate.budget_tier === "budget_friendly"
                      ? "সাশ্রয়ী বাজার"
                      : result.cost_estimate.budget_tier === "premium"
                      ? "প্রিমিয়াম"
                      : "মাঝারি বাজেট"}
                  </span>
                </div>
              )}

              {/* Detected Items List */}
              {result.identified_items && result.identified_items.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Detected Items ({result.identified_items.length})
                  </p>
                  <div className="space-y-1">
                    {result.identified_items.map((item, idx) => {
                      const isRed = item.risk_level === "red" || item.gi_index >= 70;
                      const isYellow = item.risk_level === "yellow" || (item.gi_index >= 55 && item.gi_index < 70);
                      const badgeBg = isRed
                        ? "bg-red-950 text-red-300 border-red-700/60"
                        : isYellow
                        ? "bg-amber-950 text-amber-300 border-amber-700/60"
                        : "bg-emerald-950 text-emerald-300 border-emerald-700/60";

                      return (
                        <div
                          key={idx}
                          className="bg-white/5 border border-white/10 rounded-xl p-2 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-medium text-white">{item.name}</span>
                            <span className="text-[10px] text-slate-400 block">{item.quantity}</span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${badgeBg}`}>
                            GI {item.gi_index} · GL {item.gl_load}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. THE ICONIC GEMINI LIVE FLOATING DOCK (IDENTICAL TO USER PHOTO)     */}
      {/* ===================================================================== */}
      <footer className="relative z-40 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2 px-5 max-w-sm mx-auto w-full">
        <div className="flex items-center justify-between gap-2.5">
          {/* Button 1: Blue Video Camera Button */}
          <button
            type="button"
            onClick={toggleCameraPower}
            aria-label="Toggle camera stream"
            className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-95 ${
              cameraActive
                ? "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/40"
                : "bg-slate-800 text-slate-400 border border-white/10"
            }`}
          >
            {cameraActive ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>

          {/* Button 2: Upload / Gallery Button (Arrow Up) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload photo from gallery"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/75 hover:bg-black/90 active:scale-90 border border-white/20 backdrop-blur-xl flex items-center justify-center text-white shadow-xl transition-transform"
          >
            <ArrowUp className="w-5 h-5" />
          </button>

          {/* Button 3: THE GEMINI LIVE AUDIO CAPSULE (CENTER GLOWING PILL) */}
          <button
            type="button"
            onMouseDown={handleVoiceStart}
            onMouseUp={handleVoiceStopAndSubmit}
            onTouchStart={handleVoiceStart}
            onTouchEnd={handleVoiceStopAndSubmit}
            onClick={() => {
              if (!isRecording && !isProcessing) {
                submitScan(null);
              }
            }}
            aria-label="Jotno Live Voice Push to Talk or Instant Scan"
            className={`relative w-32 h-13 sm:w-36 sm:h-14 rounded-full bg-black border border-white/25 shadow-2xl overflow-hidden flex items-center justify-center transition-all select-none active:scale-95 ${
              isRecording
                ? "scale-105 border-cyan-400 shadow-cyan-500/50"
                : "hover:border-cyan-400/60"
            }`}
          >
            {/* Fluid Organic Glowing Capsule */}
            <div
              className={`absolute -bottom-3 inset-x-1 h-9 rounded-full blur-md transition-all ${
                isRecording
                  ? "bg-gradient-to-t from-cyan-400 via-blue-500 to-transparent opacity-100 animate-pulse"
                  : isSpeaking
                  ? "bg-gradient-to-t from-emerald-400 via-cyan-500 to-transparent opacity-90 animate-pulse"
                  : "bg-gradient-to-t from-cyan-400 via-blue-600 to-transparent opacity-85 gemini-live-glow"
              }`}
            />
            {/* Crisp curved bright rim highlight */}
            <div className="absolute -bottom-1 inset-x-4 h-3 rounded-full bg-cyan-300/80 blur-[2px] pointer-events-none" />

            {/* Inner Equalizer Waveform Soundbars */}
            <div className="relative z-10 flex items-center gap-1 px-3">
              <span
                className={`w-1 rounded-full bg-white transition-all ${
                  isRecording
                    ? "h-6 animate-pulse"
                    : isSpeaking
                    ? "h-5 animate-pulse"
                    : "h-3 opacity-80"
                }`}
              />
              <span
                className={`w-1 rounded-full bg-cyan-200 transition-all ${
                  isRecording
                    ? "h-8 animate-pulse delay-75"
                    : isSpeaking
                    ? "h-7 animate-pulse delay-75"
                    : "h-4 opacity-90"
                }`}
              />
              <span
                className={`w-1 rounded-full bg-white transition-all ${
                  isRecording
                    ? "h-7 animate-pulse delay-150"
                    : isSpeaking
                    ? "h-6 animate-pulse delay-150"
                    : "h-5 opacity-100"
                }`}
              />
              <span
                className={`w-1 rounded-full bg-cyan-200 transition-all ${
                  isRecording
                    ? "h-5 animate-pulse"
                    : isSpeaking
                    ? "h-4 animate-pulse"
                    : "h-3 opacity-80"
                }`}
              />
            </div>
          </button>

          {/* Button 4: Microphone Mute / Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border backdrop-blur-xl flex items-center justify-center shadow-xl transition-transform active:scale-90 ${
              isMuted
                ? "bg-red-950/80 border-red-500/50 text-red-400"
                : "bg-black/75 hover:bg-black/90 border-white/20 text-white"
            }`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-white" />}
          </button>

          {/* Button 5: Close 'X' Button */}
          <button
            type="button"
            onClick={closeLiveSession}
            aria-label="Close Jotno Live session"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/75 hover:bg-black/90 active:scale-90 border border-white/20 backdrop-blur-xl flex items-center justify-center text-white shadow-xl transition-transform"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}
