'use client';

import React, { useState } from 'react';
import { BazaarCartItem } from '@/lib/validations/deficits';
import {
  X,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Copy,
  Check,
  Share2,
} from 'lucide-react';

interface BazaarCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: BazaarCartItem[];
  totalItemCount: number;
  estimatedTotalCost: number;
  onUpdateQuantity: (itemId: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearCart: () => void;
  getExportText: () => string;
}

export function BazaarCartDrawer({
  isOpen,
  onClose,
  cart,
  totalItemCount,
  estimatedTotalCost,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  getExportText,
}: BazaarCartDrawerProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      const text = getExportText();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="bazaar-cart-drawer"
      aria-label="Shopping list"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30"
    >
      {/* Tap backdrop to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Bottom sheet */}
      <div className="relative mx-auto flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-[32px] bg-white shadow-float animate-in slide-in-from-bottom">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="icon-badge bg-pastel-lime text-pastel-lime-ink">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink">Shopping list</h3>
              <p className="text-sm text-ink-muted">
                {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} planned
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-ink-soft active:bg-line"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 space-y-2 overflow-y-auto px-5 pb-4 pt-1">
          {cart.length === 0 ? (
            <div className="py-16 text-center">
              <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-ink-muted" />
              <p className="font-bold text-ink">Your list is empty</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
                Add foods from the suggestions to build your shopping list.
              </p>
            </div>
          ) : (
            cart.map((cartItem) => (
              <div
                key={cartItem.item.id}
                data-testid={`cart-row-${cartItem.item.id}`}
                className="flex items-center justify-between rounded-2xl bg-canvas p-3"
              >
                <div className="flex-1 pr-3">
                  <div className="text-sm font-bold text-ink">
                    {cartItem.item.name}
                  </div>
                  <div className="text-sm font-semibold text-ink-soft">
                    ৳{Math.round(cartItem.item.pricePerUnit * 120)} <span className="text-xs font-normal text-ink-muted">({cartItem.item.priceEstimate})</span>
                  </div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {cartItem.item.primaryNutrient}
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-full bg-white shadow-sm">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() =>
                        onUpdateQuantity(cartItem.item.id, cartItem.quantity - 1)
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft active:bg-canvas"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-7 text-center text-sm font-bold text-ink">
                      {cartItem.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() =>
                        onUpdateQuantity(cartItem.item.id, cartItem.quantity + 1)
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft active:bg-canvas"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-label="Remove item"
                    onClick={() => onRemoveItem(cartItem.item.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted active:bg-risk-danger active:text-risk-dangerInk"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with Subtotal & Export */}
        {cart.length > 0 && (
          <div className="space-y-3 border-t border-line px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Estimated total (বাজারের খরচ)</span>
              <span className="text-base font-extrabold text-ink">
                ৳{Math.round(estimatedTotalCost * 120)} <span className="text-xs font-normal text-ink-muted">(~${estimatedTotalCost.toFixed(2)})</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="btn-primary text-sm"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" />
                    <span>Share</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="btn-secondary text-sm"
              >
                <Copy className="h-4 w-4" />
                <span>Copy text</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClearCart}
              className="h-11 w-full text-center text-sm font-semibold text-ink-muted active:text-risk-dangerInk"
            >
              Clear list
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
