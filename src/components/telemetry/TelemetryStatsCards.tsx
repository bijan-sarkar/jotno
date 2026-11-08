"use client";

import React from "react";
import type { TelemetrySummary } from "@/lib/validations/telemetry";
import ProgressRing from "@/components/app/ProgressRing";

interface TelemetryStatsCardsProps {
  summary: TelemetrySummary;
}

export default function TelemetryStatsCards({ summary }: TelemetryStatsCardsProps) {
  const isTirOptimal = summary.time_in_range_percent >= 70;
  const isHba1cOptimal = summary.estimated_hba1c > 0 && summary.estimated_hba1c <= 7.0;

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* 1. Estimated HbA1c Card */}
      <div className="tile bg-pastel-blue text-pastel-blue-ink">
        <p className="text-sm font-bold">Estimated HbA1c</p>
        <p className="mt-2 text-3xl font-extrabold leading-none">
          {summary.estimated_hba1c > 0 ? summary.estimated_hba1c : "--"}
          <span className="ml-0.5 text-base font-bold">%</span>
        </p>
        <p className="mt-2 text-sm font-semibold opacity-80">
          {isHba1cOptimal ? "On target" : "Above 7% target"}
        </p>
      </div>

      {/* 2. Time In Range (TIR) Card */}
      <div className="tile bg-pastel-lime text-pastel-lime-ink">
        <p className="text-sm font-bold">Time in range</p>
        <div className="mt-2 flex items-center gap-3">
          <ProgressRing
            value={summary.total_readings > 0 ? summary.time_in_range_percent : 0}
            color={isTirOptimal ? "#9DB98C" : "#E9A440"}
            size={56}
            stroke={7}
            label={summary.total_readings > 0 ? `${Math.round(summary.time_in_range_percent)}%` : "--"}
          />
          <p className="text-sm font-semibold leading-snug opacity-80">
            {summary.readings_in_range} of {summary.total_readings} readings
          </p>
        </div>
      </div>

      {/* 3. Mean Glucose Card */}
      <div className="tile bg-pastel-peach text-pastel-peach-ink">
        <p className="text-sm font-bold">Average</p>
        <p className="mt-2 text-3xl font-extrabold leading-none">
          {summary.mean_glucose > 0 ? (summary.mean_glucose <= 35 ? summary.mean_glucose : (summary.mean_glucose / 18).toFixed(1)) : "--"}
          <span className="ml-1 text-sm font-bold">mmol/L</span>
        </p>
        <p className="mt-2 text-sm font-semibold opacity-80">
          {summary.mean_glucose > 35 ? `${summary.mean_glucose} mg/dL · ` : ""}Goal: 3.9–7.8 mmol/L
        </p>
      </div>

      {/* 4. Target Trajectory Card */}
      <div className="tile bg-pastel-lilac text-pastel-lilac-ink">
        <p className="text-sm font-bold">Fasting goal</p>
        <p className="mt-2 text-3xl font-extrabold leading-none">
          {summary.target_fbs > 0 ? (summary.target_fbs <= 35 ? summary.target_fbs : (summary.target_fbs / 18).toFixed(1)) : "--"}
          <span className="ml-1 text-sm font-bold">mmol/L</span>
        </p>
        <p className="mt-2 text-sm font-semibold opacity-80">
          From {summary.baseline_fbs <= 35 ? summary.baseline_fbs : (summary.baseline_fbs / 18).toFixed(1)} mmol/L over {summary.horizon_days} days
        </p>
      </div>
    </div>
  );
}
