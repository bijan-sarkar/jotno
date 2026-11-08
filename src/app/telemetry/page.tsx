"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, RefreshCw, Utensils, Salad, Droplet } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import GlucoseChart from "@/components/telemetry/GlucoseChart";
import TelemetryStatsCards from "@/components/telemetry/TelemetryStatsCards";
import QuickLogModal from "@/components/telemetry/QuickLogModal";
import type { GlucoseLog, TelemetrySummary, TrajectoryPoint } from "@/lib/validations/telemetry";
import {
  MOCK_TC_P5_01_LOGS,
  generateTelemetrySummary,
  generateTrajectoryDataset,
} from "@/utils/telemetry";

const CONTEXT_LABELS: Record<string, string> = {
  fasting: "Fasting",
  post_meal: "After meal",
  bedtime: "Bedtime",
  random: "Random",
};

export default function TelemetryPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<GlucoseLog[]>(MOCK_TC_P5_01_LOGS);
  const [horizonDays, setHorizonDays] = useState<number>(84);
  const [baselineFBS] = useState<number>(160);
  const [targetFBS, setTargetFBS] = useState<number>(100);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [summary, setSummary] = useState<TelemetrySummary>(() =>
    generateTelemetrySummary(MOCK_TC_P5_01_LOGS, 160, 100, 84)
  );
  const [trajectoryData, setTrajectoryData] = useState<TrajectoryPoint[]>(() =>
    generateTrajectoryDataset({
      logs: MOCK_TC_P5_01_LOGS,
      baselineFBS: 160,
      targetFBS: 100,
      horizonDays: 84,
    })
  );
  const [benchmarkActive, setBenchmarkActive] = useState<boolean>(true);

  // Sync state and compute analytics on change
  useEffect(() => {
    const newSummary = generateTelemetrySummary(logs, baselineFBS, targetFBS, horizonDays);
    const newPoints = generateTrajectoryDataset({
      logs,
      baselineFBS,
      targetFBS,
      horizonDays,
    });
    setSummary(newSummary);
    setTrajectoryData(newPoints);
  }, [logs, horizonDays, baselineFBS, targetFBS]);

  // Load from localStorage if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("glucovision_glucose_logs");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setLogs(parsed);
            setBenchmarkActive(false);
          }
        } catch {
          // keep initial mock
        }
      }
    }
  }, []);

  // Home screen links to /telemetry?log=1 to open the log sheet directly
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("log") === "1") {
      setIsModalOpen(true);
      router.replace("/telemetry");
    }
  }, [router]);

  const handleSaveLog = async (newLog: GlucoseLog) => {
    const updated = [newLog, ...logs];
    setLogs(updated);
    setBenchmarkActive(false);

    if (typeof window !== "undefined") {
      localStorage.setItem("glucovision_glucose_logs", JSON.stringify(updated));
    }

    // Attempt server sync
    try {
      await fetch("/api/telemetry/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLog),
      });
    } catch {
      // non-blocking
    }
  };

  const handleLoadBenchmark = () => {
    setLogs(MOCK_TC_P5_01_LOGS);
    setHorizonDays(84);
    setTargetFBS(100);
    setBenchmarkActive(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("glucovision_glucose_logs", JSON.stringify(MOCK_TC_P5_01_LOGS));
    }
  };

  return (
    <>
      <PageHeader
        title="Glucose"
        subtitle="Your readings vs. your target path"
        actions={
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            aria-label="Log a reading"
            className="fab h-10 w-10 bg-pastel-blue-strong"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </button>
        }
      />

      <main className="px-4 py-5 space-y-5">
        {/* Horizon selector */}
        <div className="flex justify-center gap-2">
          {[
            { days: 7, label: "1W" },
            { days: 14, label: "2W" },
            { days: 30, label: "1M" },
            { days: 84, label: "12W" },
          ].map((h) => (
            <button
              key={h.days}
              type="button"
              onClick={() => setHorizonDays(h.days)}
              aria-pressed={horizonDays === h.days}
              className="chip-toggle h-11 min-w-[64px] justify-center"
            >
              {h.label}
            </button>
          ))}
        </div>

        {/* Sample data notice */}
        {benchmarkActive ? (
          <div className="card p-4 text-sm font-medium text-ink-soft">
            You&apos;re viewing a sample week. Log your own reading to replace it.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleLoadBenchmark}
            className="flex h-11 items-center gap-2 rounded-full px-1 text-sm font-bold text-ink-soft active:text-ink"
          >
            <RefreshCw className="h-4 w-4" />
            Load sample week
          </button>
        )}

        <TelemetryStatsCards summary={summary} />

        <GlucoseChart data={trajectoryData} height={260} />

        {/* Reading history */}
        <section>
          <h2 className="section-title mb-3">Readings ({logs.length})</h2>
          <ul className="space-y-2.5">
            {logs.map((log) => {
              const valMg = log.glucose_value <= 35 ? log.glucose_value * 18 : log.glucose_value;
              const isInRange = valMg >= 70 && valMg <= 140;
              const mmolVal = log.glucose_value <= 35 ? log.glucose_value : Number((log.glucose_value / 18).toFixed(1));

              return (
                <li key={log.id} className="card flex items-center gap-3 p-3.5">
                  <div className="icon-badge bg-pastel-blue text-pastel-blue-ink">
                    <Droplet className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink">
                      {mmolVal} <span className="text-sm font-semibold text-ink-muted">mmol/L</span>
                      {log.glucose_value > 35 && (
                        <span className="ml-1.5 text-xs font-normal text-ink-muted">({log.glucose_value} mg/dL)</span>
                      )}
                    </p>
                    <p className="text-sm font-medium text-ink-muted">
                      {CONTEXT_LABELS[log.context] ?? log.context} · Day {log.day_offset}
                    </p>
                    {log.linked_meal_title && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
                        <Utensils className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{log.linked_meal_title}</span>
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      isInRange ? "bg-risk-safe text-risk-safeInk" : "bg-risk-caution text-risk-cautionInk"
                    }`}
                  >
                    {isInRange ? "In range" : "Elevated"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <Link
          href="/deficits"
          className="card flex items-center gap-3 p-3.5 active:bg-canvas"
        >
          <div className="icon-badge bg-pastel-lime text-pastel-lime-ink">
            <Salad className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-ink">Check your nutrition gaps</p>
            <p className="text-sm font-medium text-ink-muted">See which foods could help steady your levels</p>
          </div>
          <ChevronRight className="h-5 w-5 text-ink-muted" />
        </Link>
      </main>

      <QuickLogModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveLog}
        currentDayOffset={logs.length}
      />
    </>
  );
}
