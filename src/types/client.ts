// src/types/client.ts
export interface Client {
  id: string;
  internalCode?: string; 
  businessName: string;
  address: string;
  phone?: string;
  email?: string; 
  visitDay: string;
  defaultList: 'list1' | 'list2' | 'list3';
  createdAt: number;
  syncStatus?: 'PENDING' | 'SYNCED';
  balance: number; // 👈 ESTE ES EL NUEVO CAMPO (Cuenta Corriente)
}