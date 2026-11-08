"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Square, Loader2, Camera, Salad, Droplet, Keyboard, Volume2, Phone, Settings, LayoutGrid } from "lucide-react";
import type { GlucoseLog, MeasurementContext } from "@/lib/validations/telemetry";
import type { AssistantResult } from "@/lib/ai/elder-assistant";
import {
  CONTEXT_LABELS_BN,
  LEVEL_LABELS_BN,
  classifyGlucose,
  greetingBn,
  readingFeedbackBn,
  toBanglaDigits,
} from "@/lib/assistant/bangla";
import {
  type ElderSettings,
  type Recording,
  compressImage,
  loadLogs,
  loadSettings,
  saveGlucoseReading,
  saveSettings,
  speak,
  startRecording,
  stopSpeaking,
  warmUpVoices,
} from "@/lib/assistant/client";
import ElderSetup from "@/components/elder/ElderSetup";
import ConfirmReadingSheet from "@/components/elder/ConfirmReadingSheet";
import NumberEntrySheet from "@/components/elder/NumberEntrySheet";
import HelpScreen, { type HelpKind } from "@/components/elder/HelpScreen";

const MAX_RECORDING_MS = 15000;

type Phase = "idle" | "recording" | "thinking";
type Verdict = "good" | "limit" | "avoid";

const VERDICT_STYLES: Record<Verdict, { label: string; className: string }> = {
  good: { label: "ভালো", className: "bg-risk-safe text-risk-safeInk" },
  limit: { label: "অল্প খান", className: "bg-risk-caution text-risk-cautionInk" },
  avoid: { label: "এড়িয়ে চলুন", className: "bg-risk-danger text-risk-dangerInk" },
};

const LEVEL_STYLES = {
  low: "bg-risk-danger text-risk-dangerInk",
  good: "bg-risk-safe text-risk-safeInk",
  slightly_high: "bg-risk-caution text-risk-cautionInk",
  high: "bg-risk-danger text-risk-dangerInk",
  very_high: "bg-risk-danger text-risk-dangerInk",
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return `আজ ${time}`;
  return `${d.toLocaleDateString("bn-BD", { day: "numeric", month: "long" })}, ${time}`;
}

export default function ElderHomePage() {
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<ElderSettings | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [logs, setLogs] = useState<GlucoseLog[]>([]);
  const [greeting, setGreeting] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [reply, setReply] = useState<{ text: string; verdict?: Verdict | null } | null>(null);
  const [pending, setPending] = useState<{ value: number; context: MeasurementContext } | null>(null);
  const [help, setHelp] = useState<{ kind: HelpKind; message: string } | null>(null);
  const [numberEntry, setNumberEntry] = useState(false);

  const recordingRef = useRef<Recording | null>(null);
  const meterInputRef = useRef<HTMLInputElement>(null);
  const foodInputRef = useRef<HTMLInputElement>(null);

  // Everything here depends on the browser (storage, locale, clock), so load after mount
  useEffect(() => {
    setSettings(loadSettings());
    setLogs(loadLogs());
    setGreeting(greetingBn(new Date().getHours()));
    warmUpVoices();
    setMounted(true);
    return () => {
      recordingRef.current?.cancel();
      stopSpeaking();
    };
  }, []);

  const say = useCallback((text: string, verdict?: Verdict | null) => {
    setReply({ text, verdict });
    speak(text);
  }, []);

  const handleResult = useCallback(
    (result: AssistantResult) => {
      if (result.action === "log_glucose" && result.glucose_value) {
        const context = result.glucose_context ?? "random";
        setPending({ value: result.glucose_value, context });
        setReply(null);
        const displayMmol = result.glucose_value > 35 ? Number((result.glucose_value / 18).toFixed(1)) : result.glucose_value;
        speak(`${toBanglaDigits(displayMmol)} মিলিমোল, ${CONTEXT_LABELS_BN[context]}। ঠিক আছে?`);
        return;
      }
      if (result.action === "call_for_help") {
        setHelp({ kind: "symptoms", message: result.reply });
        speak(result.reply);
        return;
      }
      say(result.reply, result.food_verdict);
    },
    [say]
  );

  const ask = useCallback(
    async (mode: "talk" | "meter" | "food", payload: { audio?: Blob; image?: Blob }) => {
      if (!navigator.onLine) {
        say("ইন্টারনেট নেই। সুগার নিজে লিখতে নিচের বোতাম চাপুন।");
        return;
      }
      setPhase("thinking");
      setReply(null);
      try {
        const form = new FormData();
        form.append("mode", mode);
        if (settings?.name) form.append("name", settings.name);
        if (payload.audio) form.append("audio", payload.audio, "speech");
        if (payload.image) form.append("image", payload.image, "photo.jpg");
        const res = await fetch("/api/assistant", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error);
        handleResult(json.data as AssistantResult);
      } catch {
        say("সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
      } finally {
        setPhase("idle");
      }
    },
    [handleResult, say, settings?.name]
  );

  const finishRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    const blob = await recording.stop();
    setPhase("idle");
    if (blob.size < 1500) {
      say("কিছু শুনতে পাইনি। বড় বোতাম চেপে আবার বলুন।");
      return;
    }
    ask("talk", { audio: blob });
  }, [ask, say]);

  const toggleMic = async () => {
    if (phase === "recording") return finishRecording();
    if (phase === "thinking") return;
    stopSpeaking();
    setReply(null);
    try {
      recordingRef.current = await startRecording(MAX_RECORDING_MS, finishRecording);
      setPhase("recording");
    } catch {
      say("মাইক্রোফোন চালু করা যায়নি। ফোনের সেটিংসে মাইক্রোফোনের অনুমতি দিন।");
    }
  };

  const onPhoto = (mode: "meter" | "food") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    stopSpeaking();
    ask(mode, { image: await compressImage(file) });
  };

  const confirmReading = () => {
    if (!pending) return;
    saveGlucoseReading(pending.value, pending.context);
    setLogs(loadLogs());
    const feedback = readingFeedbackBn(pending.value);
    const level = classifyGlucose(pending.value);
    setPending(null);
    if (level === "low" || level === "very_high") {
      setHelp({ kind: level, message: feedback });
      speak(feedback);
    } else {
      say(feedback);
    }
  };

  const rejectReading = () => {
    setPending(null);
    say("ঠিক আছে, রাখলাম না। সংখ্যাটি আবার বলুন বা নিজে লিখুন।");
  };

  if (!mounted) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pastel-blue text-pastel-blue-ink animate-pulse">
          <Droplet className="h-8 w-8" />
        </div>
        <p className="mt-4 text-base font-semibold text-ink-muted">লোড হচ্ছে…</p>
      </main>
    );
  }

  if (!settings || editingSettings) {
    return (
      <ElderSetup
        initial={settings}
        onCancel={settings ? () => setEditingSettings(false) : undefined}
        onDone={(s) => {
          saveSettings(s);
          setSettings(s);
          setEditingSettings(false);
          say(`ধন্যবাদ, ${s.name}। কথা বলতে বড় কালো বোতামটি চাপুন।`);
        }}
      />
    );
  }

  const latest = [...logs].sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime())[0];
  const latestLevel = latest ? classifyGlucose(latest.glucose_value) : null;
  const welcome = `${greeting}, ${settings.name}। কথা বলতে বড় কালো বোতামটি চাপুন।`;

  return (
    <main lang="bn" className="flex min-h-dvh flex-col px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      {/* Greeting + quick call */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-ink-soft">{greeting},</p>
          <h1 className="text-3xl font-bold text-ink">{settings.name}</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => say(welcome)}
            aria-label="শুনুন"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink shadow-soft active:bg-canvas"
          >
            <Volume2 className="h-6 w-6" />
          </button>
          {settings.contactPhone && (
            <a
              href={`tel:${settings.contactPhone}`}
              aria-label={`${settings.contactName ?? "পরিবার"}-কে ফোন করুন`}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-pastel-lime-strong text-white shadow-soft active:scale-95"
            >
              <Phone className="h-6 w-6" />
            </a>
          )}
        </div>
      </header>

      {/* Last reading */}
      <section className="card mt-5 flex items-center gap-4 p-5">
        <div className="icon-badge h-14 w-14 bg-pastel-blue text-pastel-blue-ink">
          <Droplet className="h-7 w-7" />
        </div>
        {latest && latestLevel ? (
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-ink-muted">শেষ সুগার · {formatWhen(latest.measured_at)}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="text-4xl font-bold text-ink">
                {toBanglaDigits(latest.glucose_value <= 35 ? latest.glucose_value : Number((latest.glucose_value / 18).toFixed(1)))}
              </span>
              <span className="text-lg font-bold text-ink-muted">mmol/L</span>
              <span className={`rounded-full px-3 py-1 text-base font-bold ${LEVEL_STYLES[latestLevel]}`}>
                {LEVEL_LABELS_BN[latestLevel]}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-lg font-semibold text-ink-soft">এখনো কোনো সুগার রাখা হয়নি। বোতাম চেপে বলুন বা মিটারের ছবি তুলুন।</p>
        )}
      </section>

      {/* Big talk button */}
      <section className="flex flex-1 flex-col items-center justify-center py-8">
        <button
          type="button"
          onClick={toggleMic}
          disabled={phase === "thinking"}
          aria-label={phase === "recording" ? "বলা শেষ" : "কথা বলুন"}
          className={`relative flex h-44 w-44 items-center justify-center rounded-full text-white shadow-float transition-transform active:scale-95 disabled:opacity-80 ${
            phase === "recording" ? "bg-pastel-coral-strong" : "bg-ink"
          }`}
        >
          {phase === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-pastel-coral-strong/40" />}
          {phase === "thinking" ? (
            <Loader2 className="h-16 w-16 animate-spin" />
          ) : phase === "recording" ? (
            <Square className="relative h-14 w-14 fill-current" />
          ) : (
            <Mic className="h-20 w-20" />
          )}
        </button>
        <p className="mt-5 text-center text-2xl font-bold text-ink" aria-live="polite">
          {phase === "recording" ? "শুনছি… বলা শেষ হলে আবার চাপুন" : phase === "thinking" ? "একটু অপেক্ষা করুন…" : "কথা বলুন"}
        </p>

        {reply && phase === "idle" && (
          <div className="card mt-6 w-full p-5" aria-live="polite">
            {reply.verdict && (
              <span className={`mb-3 inline-block rounded-full px-4 py-1.5 text-lg font-bold ${VERDICT_STYLES[reply.verdict].className}`}>
                {VERDICT_STYLES[reply.verdict].label}
              </span>
            )}
            <p className="text-xl font-semibold leading-relaxed text-ink">{reply.text}</p>
            <button
              type="button"
              onClick={() => speak(reply.text)}
              className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-canvas px-5 text-lg font-semibold text-ink active:bg-line"
            >
              <Volume2 className="h-5 w-5" />
              আবার শুনুন
            </button>
          </div>
        )}
      </section>

      {/* Photo actions */}
      <section className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={phase !== "idle"}
          onClick={() => meterInputRef.current?.click()}
          className="tile flex min-h-[132px] flex-col items-start justify-between bg-pastel-blue text-left text-pastel-blue-ink active:opacity-80 disabled:opacity-60"
        >
          <span className="fab bg-pastel-blue-strong">
            <Camera className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold leading-snug">সুগার মিটারের ছবি</span>
        </button>
        <button
          type="button"
          disabled={phase !== "idle"}
          onClick={() => foodInputRef.current?.click()}
          className="tile flex min-h-[132px] flex-col items-start justify-between bg-pastel-lime text-left text-pastel-lime-ink active:opacity-80 disabled:opacity-60"
        >
          <span className="fab bg-pastel-lime-strong">
            <Salad className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold leading-snug">খাবারের ছবি</span>
        </button>
        <input ref={meterInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto("meter")} />
        <input ref={foodInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto("food")} />
      </section>

      <button
        type="button"
        disabled={phase !== "idle"}
        onClick={() => setNumberEntry(true)}
        className="btn-secondary mt-3 h-16 text-xl"
      >
        <Keyboard className="h-6 w-6" />
        সুগার নিজে লিখুন
      </button>

      <nav className="mt-5 flex items-center justify-between text-base font-semibold text-ink-muted">
        <button type="button" onClick={() => setEditingSettings(true)} className="inline-flex h-12 items-center gap-2 px-1">
          <Settings className="h-5 w-5" />
          নাম ও ফোন নম্বর
        </button>
        <Link href="/dashboard" className="inline-flex h-12 items-center gap-2 px-1">
          <LayoutGrid className="h-5 w-5" />
          আরও
        </Link>
      </nav>

      {pending && (
        <ConfirmReadingSheet
          value={pending.value}
          context={pending.context}
          onContextChange={(context) => setPending({ ...pending, context })}
          onConfirm={confirmReading}
          onReject={rejectReading}
        />
      )}
      {numberEntry && (
        <NumberEntrySheet
          onClose={() => setNumberEntry(false)}
          onSubmit={(value) => {
            setNumberEntry(false);
            setPending({ value, context: "random" });
            const displayMmol = value > 35 ? Number((value / 18).toFixed(1)) : value;
            speak(`${toBanglaDigits(displayMmol)} মিলিমোল। ঠিক আছে?`);
          }}
        />
      )}
      {help && (
        <HelpScreen
          kind={help.kind}
          message={help.message}
          contactName={settings.contactName}
          contactPhone={settings.contactPhone}
          onReplay={() => speak(help.message)}
          onClose={() => {
            stopSpeaking();
            setHelp(null);
          }}
        />
      )}
    </main>
  );
}
