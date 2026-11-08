'use client';

import { useState, useEffect, useCallback } from 'react';
import { BazaarStapleItem, BazaarCartItem } from '@/lib/validations/deficits';

export const CART_STORAGE_KEY = 'glucovision_bazaar_cart';

export function getLocalCart(): BazaarCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to read bazaar cart from localStorage:', e);
    return [];
  }
}

export function saveLocalCart(items: BazaarCartItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save bazaar cart to localStorage:', e);
  }
}

/**
 * Custom hook managing the persistent Bazaar Shopping List cart state
 */
export function useBazaarCart() {
  const [cart, setCart] = useState<BazaarCartItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Initialize from localStorage
  useEffect(() => {
    setCart(getLocalCart());
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3500);
  }, []);

  /**
   * Adds an item to the bazaar cart and triggers the required TC-P6-02 feedback toast
   */
  const addToCart = useCallback((item: BazaarStapleItem) => {
    setCart((prevCart) => {
      const existingIdx = prevCart.findIndex((ci) => ci.item.id === item.id);
      let updated: BazaarCartItem[];

      if (existingIdx > -1) {
        updated = prevCart.map((ci, idx) =>
          idx === existingIdx ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      } else {
        const newItem: BazaarCartItem = {
          id: `${item.id}-${Date.now()}`,
          item,
          quantity: 1,
          addedAt: new Date().toISOString(),
        };
        updated = [...prevCart, newItem];
      }

      saveLocalCart(updated);
      return updated;
    });

    // Required by TC-P6-02: "Added Okra / Dherosh to Local Bazaar List!"
    showToast(`Added ${item.name} to Local Bazaar List!`);
  }, [showToast]);

  const updateQuantity = useCallback((itemId: string, newQuantity: number) => {
    setCart((prevCart) => {
      let updated: BazaarCartItem[];
      if (newQuantity <= 0) {
        updated = prevCart.filter((ci) => ci.item.id !== itemId);
      } else {
        updated = prevCart.map((ci) =>
          ci.item.id === itemId ? { ...ci, quantity: newQuantity } : ci
        );
      }
      saveLocalCart(updated);
      return updated;
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart((prevCart) => {
      const updated = prevCart.filter((ci) => ci.item.id !== itemId);
      saveLocalCart(updated);
      return updated;
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    saveLocalCart([]);
    showToast('Cleared Local Bazaar List.');
  }, [showToast]);

  const totalItemCount = cart.reduce((acc, curr) => acc + curr.quantity, 0);

  const estimatedTotalCost = cart.reduce(
    (acc, curr) => acc + curr.item.pricePerUnit * curr.quantity,
    0
  );

  const getExportText = useCallback(() => {
    if (cart.length === 0) return 'Bazaar shopping list is empty.';
    let text = '🛒 *Jotno Local Bazaar Shopping List*\n';
    text += 'Diabetic glycemic-buffering staples:\n\n';
    cart.forEach((ci) => {
      const bdtItem = Math.round(ci.item.pricePerUnit * ci.quantity * 120);
      text += `• ${ci.item.name} (${ci.item.localNameBengali || ''}) - ${ci.quantity} ${ci.item.unit} (৳${bdtItem} / ~$${(ci.item.pricePerUnit * ci.quantity).toFixed(2)})\n  _${ci.item.primaryNutrient}_\n`;
    });
    const totalBdt = Math.round(estimatedTotalCost * 120);
    text += `\nEstimated Total: ৳${totalBdt} (~$${estimatedTotalCost.toFixed(2)})`;
    return text;
  }, [cart, estimatedTotalCost]);

  return {
    cart,
    totalItemCount,
    estimatedTotalCost,
    toastMessage,
    isDrawerOpen,
    setIsDrawerOpen,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    getExportText,
    showToast,
  };
}
