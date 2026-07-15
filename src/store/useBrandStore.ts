// src/store/useBrandStore.ts
import { create } from 'zustand';

interface BrandState {
  logoUri: string | null;
  businessName: string;
  primaryColor: string;
  setBrand: (logo: string | null, name: string, color: string) => void;
}

export const useBrandStore = create<BrandState>((set) => ({
  logoUri: null,
  businessName: '',
  primaryColor: '#135C58',
  setBrand: (logo, name, color) => set({ logoUri: logo, businessName: name, primaryColor: color }),
}));