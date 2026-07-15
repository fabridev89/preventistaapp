// src/store/useCartStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Product } from '../types/product';

export interface CartItem {
  product: Product;
  quantity: number;
  activeList: 'list1' | 'list2' | 'list3';
  unitPrice: number;
  subtotal: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product | any, activeList: 'list1' | 'list2' | 'list3', quantity?: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  getTotalItems: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      
      addItem: (product: any, activeList, quantity = 1) => {
        set((state) => {
          const existingItem = state.items.find((item) => item.product.id === product.id);
          
          // 👇 ADIÓS A LA CALCULADORA VIEJA 👇
          // Tomamos el precio exacto (unitPrice) que ya calculó la ProductCard.
          // Si por algún motivo no llega, leemos el precio directo de la lista.
          let finalUnitPrice = product.unitPrice;

          if (finalUnitPrice === undefined || finalUnitPrice === null) {
             const rawPrice = Number(product[activeList]) || Number(product.baseCost) || 0;
             const discount = Number(product.extraDiscountPercentage) || 0;
             finalUnitPrice = discount > 0 ? rawPrice - (rawPrice * (discount / 100)) : rawPrice;
          }

          const unitPrice = parseFloat(Number(finalUnitPrice).toFixed(2));

          if (existingItem) {
            const newQuantity = existingItem.quantity + quantity;
            return {
              items: state.items.map((item) =>
                item.product.id === product.id
                  ? { ...item, quantity: newQuantity, subtotal: parseFloat((newQuantity * unitPrice).toFixed(2)) }
                  : item
              ),
            };
          }
          
          return {
            items: [
              ...state.items, 
              { product, quantity, activeList, unitPrice, subtotal: parseFloat((unitPrice * quantity).toFixed(2)) }
            ],
          };
        });
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((item) => item.product.id !== productId),
        }));
      },

      clearCart: () => set({ items: [] }),

      getTotalPrice: () => {
        const total = get().items.reduce((sum, item) => sum + item.subtotal, 0);
        return parseFloat(total.toFixed(2));
      },

      getTotalItems: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      }
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);