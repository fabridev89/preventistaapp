// src/store/useAuthStore.ts
import { create } from 'zustand';

interface AuthState {
  businessId: string | null;
  vendorName: string | null;
  setAuth: (businessId: string, vendorName: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  businessId: null,
  vendorName: null,
  
  setAuth: (businessId, vendorName) => set({ businessId, vendorName }),
  
  logout: () => set({ businessId: null, vendorName: null }),
}));