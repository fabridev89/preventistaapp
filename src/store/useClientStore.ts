// src/store/useClientStore.ts
import { create } from 'zustand';
import { Client } from '../types/client';

interface ClientState {
  activeClient: Client | null;
  setActiveClient: (client: Client | null) => void;
  clearActiveClient: () => void;
}

export const useClientStore = create<ClientState>((set) => ({
  activeClient: null,
  setActiveClient: (client) => set({ activeClient: client }),
  clearActiveClient: () => set({ activeClient: null }),
}));