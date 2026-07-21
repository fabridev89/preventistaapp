// src/types/client.ts
export interface Client {
  id: string;
  internalCode?: string; // 👈 AGREGAMOS ESTA LÍNEA ACÁ
  businessName: string;
  address: string;
  phone?: string;
  email?: string; 
  visitDay: string;
  defaultList: 'list1' | 'list2' | 'list3';
  createdAt: number;
  syncStatus?: 'PENDING' | 'SYNCED';
  // ... resto de tus campos
}