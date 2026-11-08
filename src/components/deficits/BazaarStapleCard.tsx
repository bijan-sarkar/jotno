'use client';

import React from 'react';
import { BazaarStapleItem } from '@/lib/validations/deficits';
import { Plus, Sparkles, ChefHat, Leaf } from 'lucide-react';

interface BazaarStapleCardProps {
  item: BazaarStapleItem;
  onAddToCart: (item: BazaarStapleItem) => void;
}

export function BazaarStapleCard({ item, onAddToCart }: BazaarStapleCardProps) {
  return (
    <div data-testid={`staple-card-${item.id}`} className="card p-4">
      {/* Goals-style header row: icon badge, name + local name, price */}
      <div className="flex items-center gap-3">
        <div className="icon-badge bg-pastel-lime text-pastel-lime-ink">
          <Leaf className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-bold text-ink">{item.name}</h4>
          {item.localNameBengali && <p className="text-sm text-ink-muted">{item.localNameBengali}</p>}
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-ink">৳{Math.round(item.pricePerUnit * 120)} <span className="text-xs font-normal text-ink-muted">({item.priceEstimate})</span></p>
          <p className="text-xs text-ink-muted">বাজারের দাম</p>
        </div>
      </div>

      {/* Badges */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-bold text-ink-soft">
          GI {item.glycemicIndex}
        </span>
        <span className="rounded-full bg-pastel-lilac px-2.5 py-1 text-xs font-bold text-pastel-lilac-ink">
          {item.primaryNutrient}
        </span>
        {item.isHighMucilage && (
          <span className="rounded-full bg-pastel-blue px-2.5 py-1 text-xs font-bold text-pastel-blue-ink">
            High Mucilage
          </span>
        )}
      </div>

      {/* Mechanism */}
      <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-ink-soft">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-pastel-peach-strong" />
        <span>{item.mechanism}</span>
      </p>

      {/* Culinary Tip */}
      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-canvas p-3 text-sm text-ink-soft">
        <ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-pastel-lime-ink" />
        <span className="leading-snug">{item.culinaryTip}</span>
      </div>

      {/* Button: + Add to Bazaar List (TC-P6-02) — label text is asserted by tests */}
      <button
        type="button"
        data-testid={`add-to-cart-${item.id}`}
        onClick={() => onAddToCart(item)}
        aria-label={`Add ${item.name} to shopping list`}
        className="mt-4 flex h-12 w-full items-center justify-between rounded-full bg-pastel-lime pl-5 pr-1 text-sm font-bold text-pastel-lime-ink transition-colors active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-pastel-lime-strong"
      >
        <span>+ Add to Bazaar List</span>
        <span className="fab h-10 w-10 bg-pastel-lime-strong" aria-hidden="true">
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </span>
      </button>
    </div>
  );
}
