// src/services/orderService.ts
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import localDb from '../config/database';
import { db as firestore } from '../config/firebase.config';
import { useAuthStore } from '../store/useAuthStore';
import { Client } from '../types/client';

export const saveOrderLocally = async (
  client: Client,
  items: any[],
  total: number,
  notes: string = ''
): Promise<{ success: boolean; message?: string }> => {
  try {
    const orderId = `ORD-${Date.now()}`;
    const createdAt = Date.now();

    await localDb.runAsync(
      `INSERT INTO orders (id, clientId, clientName, total, items, createdAt, syncStatus, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        client.id,
        client.businessName,
        total,
        JSON.stringify(items),
        createdAt,
        'PENDING',
        notes,
        'PENDIENTE'
      ]
    );

    return { success: true };
  } catch (error) {
    console.error("Error guardando pedido localmente:", error);
    return { success: false, message: 'No se pudo guardar el pedido localmente.' };
  }
};

export const syncPendingOrders = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const currentBusinessId = useAuthStore.getState().businessId;
    if (!currentBusinessId) return { success: false, message: "Error: No hay sesión iniciada." };

    const pendingOrders = await localDb.getAllAsync<any>(
      "SELECT * FROM orders WHERE syncStatus = 'PENDING'"
    );

    if (pendingOrders.length === 0) {
      return { success: true, message: "No hay pedidos pendientes para subir." };
    }

    const batch = writeBatch(firestore);
    const ordersRef = collection(firestore, 'orders');

    for (const order of pendingOrders) {
      const docRef = doc(ordersRef, order.id);
      batch.set(docRef, {
        id: order.id,
        businessId: currentBusinessId, // <-- Ahora es dinámico
        clientId: order.clientId,
        clientName: order.clientName,
        total: order.total,
        items: JSON.parse(order.items),
        createdAt: order.createdAt,
        notes: order.notes || '',
        status: order.status || 'PENDIENTE',
        syncStatus: 'SYNCED',
      }, { merge: true });
    }

    await batch.commit();

    for (const order of pendingOrders) {
      await localDb.runAsync(
        "UPDATE orders SET syncStatus = 'SYNCED' WHERE id = ?",
        [order.id]
      );
    }

    return { success: true, message: `Se subieron ${pendingOrders.length} pedidos a la nube.` };
  } catch (error) {
    console.error("Error sincronizando pedidos:", error);
    return { success: false, message: "Error al subir pedidos a la nube." };
  }
};

export const downloadWebOrders = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const currentBusinessId = useAuthStore.getState().businessId;
    if (!currentBusinessId) return { success: false, message: "Error: No hay sesión iniciada." };
    
    // Consulta actualizada
    const q = query(collection(firestore, 'orders'), where('businessId', '==', currentBusinessId));
    const snapshot = await getDocs(q);
    
    let downloadedCount = 0;

    for (const document of snapshot.docs) {
      const data = document.data();
      
      const existing = await localDb.getFirstAsync<any>(
        "SELECT id FROM orders WHERE id = ?", 
        [data.id]
      );

      if (!existing) {
        await localDb.runAsync(
          `INSERT INTO orders (id, clientId, clientName, total, items, createdAt, syncStatus, notes, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.id,
            data.clientId || 'WEB-CLIENT',
            data.clientName || 'Cliente Web',
            data.total,
            typeof data.items === 'string' ? data.items : JSON.stringify(data.items),
            data.createdAt,
            'SYNCED',
            data.notes || '',
            data.status || 'PENDIENTE'
          ]
        );
        downloadedCount++;
      } else {
        await localDb.runAsync(
          "UPDATE orders SET status = ? WHERE id = ? AND syncStatus = 'SYNCED'",
          [data.status || 'PENDIENTE', data.id]
        );
      }
    }

    return { success: true, message: `Se descargaron ${downloadedCount} pedidos nuevos de la Web.` };
  } catch (error) {
    console.error("Error descargando pedidos web:", error);
    return { success: false, message: "Error al descargar pedidos de la nube." };
  }
};