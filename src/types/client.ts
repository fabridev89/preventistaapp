// src/types/client.ts
export interface Client {
  id: string;
  businessName: string;
  address: string;
  phone?: string;
  email?: string; // <--- AGREGÁ ESTA LÍNEA ACÁ
  visitDay: string;
  defaultList: 'list1' | 'list2' | 'list3';
  createdAt: number;
  syncStatus?: 'PENDING' | 'SYNCED';
  // ... resto de tus campos
}