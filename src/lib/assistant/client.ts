/**
 * Browser-side helpers for the elder assistant: recording, speech playback,
 * photo compression and local persistence. Import only from client components.
 */

import type { GlucoseLog, MeasurementContext } from "@/lib/validations/telemetry";

// ---------- Settings ----------

export interface ElderSettings {
  name: string;
  contactName?: string;
  contactPhone?: string;
}

const SETTINGS_KEY = "glucovision_elder_settings";
const LOGS_KEY = "glucovision_glucose_logs";

export function loadSettings(): ElderSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSettings(settings: ElderSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ---------- Glucose logs (same storage as the Glucose tab) ----------

export function loadLogs(): GlucoseLog[] {
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGlucoseReading(value: number, context: MeasurementContext): GlucoseLog {
  const mgValue = value <= 35 ? Math.round(value * 18.0182) : Math.round(value);
  const log: GlucoseLog = {
    id: "log-" + Date.now(),
    glucose_value: mgValue,
    context,
    measured_at: new Date().toISOString(),
    day_offset: 0,
    notes: value <= 35 ? `${value} mmol/L` : undefined,
  };
  localStorage.setItem(LOGS_KEY, JSON.stringify([...loadLogs(), log]));
  // Best-effort server sync; the local copy is the source of truth when offline
  fetch("/api/telemetry/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(log),
  }).catch(() => {});
  return log;
}

// ---------- Recording ----------

const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export interface Recording {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

/** Starts recording mono speech at a low bitrate (~2 KB/s). */
export async function startRecording(maxMs: number, onAutoStop: () => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const mimeType = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 16000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
    };
  });
  const timer = setTimeout(onAutoStop, maxMs);
  recorder.start();

  return {
    stop: () => {
      clearTimeout(timer);
      if (recorder.state !== "inactive") recorder.stop();
      return done;
    },
    cancel: () => {
      clearTimeout(timer);
      if (recorder.state !== "inactive") recorder.stop();
    },
  };
}

// ---------- Photos ----------

/** Downscales a camera photo (often 3–5 MB) to ≤1024px JPEG (~100 KB). */
export async function compressImage(file: File, maxSide = 1024, quality = 0.7): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

// ---------- Speech ----------

let currentAudio: HTMLAudioElement | null = null;
const ttsCache = new Map<string, string>();

function femaleBanglaVoice(): SpeechSynthesisVoice | undefined {
  if (typeof speechSynthesis === "undefined") return undefined;
  const voices = speechSynthesis.getVoices();
  // 1. Look for a Bangla female voice
  const bnVoices = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("bn"));
  const femaleBn = bnVoices.find((v) => /female|woman|lady|tanisha|nabami|google/i.test(v.name));
  if (femaleBn) return femaleBn;
  if (bnVoices.length > 0) return bnVoices[0];

  // 2. Fallback to any available female voice (to prevent deep male David voice)
  return voices.find((v) => /female|woman|lady|zira|samantha|karen/i.test(v.name));
}

/** Voices load asynchronously on Android/Windows; call once on mount. */
export function warmUpVoices() {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();
}

export function stopSpeaking() {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  currentAudio = null;
}

/**
 * Speaks Bangla text using an authentic Bangla lady voice.
 * Prioritizes the neural Gemini "Kore" Bangla lady voice from /api/tts.
 * Falls back to browser SpeechSynthesis with high female pitch modulation.
 */
export async function speak(text: string): Promise<boolean> {
  stopSpeaking();
  if (!text || !text.trim()) return false;

  // 1. Try neural Bangla lady voice via /api/tts when online
  if (typeof navigator === "undefined" || navigator.onLine) {
    try {
      let url = ttsCache.get(text);
      if (!url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1800);
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (res.ok) {
            url = URL.createObjectURL(await res.blob());
            ttsCache.set(text, url);
          }
        } catch {
          clearTimeout(timeout);
        }
      }

      if (url) {
        const audio = new Audio(url);
        currentAudio = audio;
        await audio.play();
        return true;
      }
    } catch {
      // Fall through to browser speech synthesis
    }
  }

  // 2. Offline / local fallback via browser Web Speech API (configured for lady pitch)
  if (typeof speechSynthesis !== "undefined") {
    try {
      const voice = femaleBanglaVoice();
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang.startsWith("bn") ? voice.lang : "bn-BD";
      } else {
        utterance.lang = "bn-BD";
      }
      utterance.pitch = 1.25; // Gentle female pitch to prevent deep robotic voice
      utterance.rate = 0.9;   // Clear, warm pacing
      speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
