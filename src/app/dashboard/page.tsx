"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Droplet,
  ScanLine,
  Utensils,
  ChefHat,
  Salad,
  Plus,
  ArrowRight,
  MessageCircleQuestion,
  UserRound,
  Sparkles,
  Mic,
} from "lucide-react";
import type { GlucoseLog } from "@/lib/validations/telemetry";
import type { OnboardingFormData } from "@/lib/validations/onboarding";
import { calculateTimeInRange } from "@/utils/telemetry";
import ProgressRing from "@/components/app/ProgressRing";

const CONTEXT_LABELS: Record<string, string> = {
  fasting: "Fasting",
  post_meal: "After meal",
  bedtime: "Bedtime",
  random: "Random",
};

function readingStatus(value: number) {
  const valMg = value <= 35 ? value * 18 : value;
  if (valMg < 70) return "Low";
  if (valMg <= 140) return "In range";
  if (valMg <= 180) return "Elevated";
  return "High";
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** A pastel tile whose whole surface links somewhere, with an optional round "+" action. */
function Tile({
  href,
  label,
  icon: Icon,
  className,
  fabHref,
  fabLabel,
  fabClass,
  children,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  className: string;
  fabHref?: string;
  fabLabel?: string;
  fabClass?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`tile flex flex-col ${className}`}>
      <Link href={href} aria-label={label} className="absolute inset-0 rounded-[28px] active:bg-black/5" />
      <span className="chip pointer-events-none relative self-start">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <div className="pointer-events-none relative mt-3 flex-1">{children}</div>
      {fabHref && (
        <Link href={fabHref} aria-label={fabLabel} className={`fab relative z-10 self-end ${fabClass}`}>
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </Link>
      )}
    </div>
  );
}

const FOOD_ROWS = [
  { href: "/scanner", label: "Jotno Live Scan", icon: ScanLine },
  { href: "/scanner", label: "Auto Food & Menu", icon: Utensils },
  { href: "/recipes", label: "Make a recipe", icon: ChefHat },
];

export default function DashboardPage() {
  const [profile, setProfile] = useState<Partial<OnboardingFormData> | null>(null);
  const [logs, setLogs] = useState<GlucoseLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Date depends on the viewer's locale/timezone, so compute it client-side only
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    setToday(new Date().toLocaleDateString(undefined, { day: "numeric", month: "long" }));
    try {
      const p = localStorage.getItem("glucovision_profile");
      if (p) setProfile(JSON.parse(p));
      const l = localStorage.getItem("glucovision_glucose_logs");
      if (l) setLogs(JSON.parse(l));
    } catch {
      // Ignore corrupt local data; the home screen falls back to empty states
    }
    setLoaded(true);
  }, []);

  const firstName = profile?.fullName?.split(" ")[0];
  const sorted = [...logs].sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());
  const latest = sorted[0];
  const tir = Math.round(calculateTimeInRange(sorted.slice(0, 14).map((l) => l.glucose_value)));

  return (
    <main className="px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4">
      {/* Greeting */}
      <header className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-soft">Hello{firstName ? ` ${firstName}` : ""},</p>
          <h1 className="text-2xl font-extrabold text-ink">
            Today{today ? `, ${today}` : ""}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            lang="bn"
            className="flex h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-bold text-white active:bg-black"
          >
            <Mic className="h-4 w-4" />
            সহজ মোড
          </Link>
          <Link
            href="/onboarding"
            aria-label="Profile"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-soft active:bg-canvas"
          >
            {firstName ? (
              <span className="text-base font-extrabold">{firstName[0].toUpperCase()}</span>
            ) : (
              <UserRound className="h-5 w-5" />
            )}
          </Link>
        </div>
      </header>

      {/* Bento grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left column */}
        <div className="flex flex-col gap-3">
          <Tile
            href="/telemetry"
            label="Glucose"
            icon={Droplet}
            className="min-h-[208px] bg-pastel-blue text-pastel-blue-ink"
            fabHref="/telemetry?log=1"
            fabLabel="Log a reading"
            fabClass="bg-pastel-blue-strong"
          >
            {latest ? (
              <>
                <p className="text-4xl font-extrabold leading-none text-pastel-blue-ink">
                  {latest.glucose_value <= 35 ? latest.glucose_value : Number((latest.glucose_value / 18).toFixed(1))}
                </p>
                <p className="mt-1 text-xs font-bold">
                  mmol/L · {readingStatus(latest.glucose_value)}
                  {latest.glucose_value > 35 && <span className="opacity-70"> ({latest.glucose_value} mg/dL)</span>}
                </p>
                <p className="mt-1 text-xs font-medium opacity-75">
                  {CONTEXT_LABELS[latest.context] ?? latest.context} · {timeAgo(latest.measured_at)}
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold leading-snug">No readings yet. Tap + to log one.</p>
            )}
          </Tile>

          <Tile
            href="/deficits"
            label="Nutrition"
            icon={Salad}
            className="min-h-[176px] bg-pastel-peach text-pastel-peach-ink"
            fabHref="/deficits"
            fabLabel="See nutrition gaps"
            fabClass="bg-pastel-peach-strong"
          >
            <p className="text-sm font-semibold leading-snug">See what your diet is missing this week</p>
          </Tile>

          <Tile
            href="/safety"
            label="Ask"
            icon={MessageCircleQuestion}
            className="min-h-[150px] bg-pastel-coral text-pastel-coral-ink"
          >
            <p className="text-sm font-semibold leading-snug">Questions about food & your routine</p>
            <ArrowRight className="mt-3 h-5 w-5" />
          </Tile>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3">
          {/* Food actions: one tall tile with a row per action, like meal slots */}
          <div className="tile flex min-h-[352px] flex-col justify-between bg-pastel-lime text-pastel-lime-ink">
            {FOOD_ROWS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="flex flex-1 flex-col justify-between py-1 active:opacity-70">
                <span className="chip self-start">
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
                <span className="fab mt-2 self-end bg-pastel-lime-strong">
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </span>
              </Link>
            ))}
          </div>

          {loaded && !profile ? (
            <Tile
              href="/onboarding"
              label="Profile"
              icon={Sparkles}
              className="min-h-[182px] bg-pastel-lilac text-pastel-lilac-ink"
              fabHref="/onboarding"
              fabLabel="Set up your profile"
              fabClass="bg-pastel-lilac-strong"
            >
              <p className="text-sm font-semibold leading-snug">Set up your profile to personalise advice</p>
            </Tile>
          ) : (
            <Tile
              href="/telemetry"
              label="In range"
              icon={LineChartIcon}
              className="min-h-[182px] bg-pastel-lilac text-pastel-lilac-ink"
            >
              {latest ? (
                <div className="flex items-center gap-3">
                  <ProgressRing value={tir} color="#9F88EA" size={64} stroke={8} label={`${tir}%`} />
                  <p className="text-xs font-semibold leading-snug">of recent readings in target</p>
                </div>
              ) : (
                <p className="text-sm font-semibold leading-snug">Your time in range shows up here</p>
              )}
            </Tile>
          )}
        </div>
      </div>

      <p className="mt-6 px-2 text-center text-xs leading-relaxed text-ink-muted">
        Jotno gives general nutrition guidance and is not a substitute for medical advice.
      </p>
    </main>
  );
}

function LineChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 8 8" strokeWidth={3} />
    </svg>
  );
}
