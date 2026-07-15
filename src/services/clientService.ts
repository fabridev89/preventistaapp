// src/services/clientService.ts
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { Platform } from 'react-native';
import localDb from '../config/database';
import { db as firestore } from '../config/firebase.config';
import { useAuthStore } from '../store/useAuthStore';
import { Client } from '../types/client';

export const saveClientLocally = async (
  clientData: Omit<Client, 'id'>
): Promise<{ success: boolean; clientId?: string; message?: string }> => {
  try {
    const currentBusinessId = useAuthStore.getState().businessId;
    const clientId = `CLI-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const createdAt = Date.now();

    if (Platform.OS === 'web') {
      // --- MODO WEB: GUARDAR DIRECTO EN FIREBASE ---
      if (!currentBusinessId) return { success: false, message: 'No hay sesión.' };
      
      const finalData = {
        id: clientId,
        businessId: currentBusinessId,
        businessName: clientData.businessName,
        address: clientData.address,
        defaultList: clientData.defaultList,
        visitDay: clientData.visitDay,
        phone: clientData.phone || '',
        email: clientData.email ? clientData.email.trim().toLowerCase() : '',
        createdAt: createdAt,
        updatedAt: createdAt,
        syncStatus: 'SYNCED',
        status: 'active' 
      };

      await setDoc(doc(firestore, 'clients', clientId), finalData);
      console.log(`✅ Cliente web guardado en Firebase.`);
      
    } else {
      // --- MODO APP: GUARDAR EN SQLITE PENDIENTE ---
      await localDb.runAsync(
        `INSERT INTO clients (id, businessName, address, defaultList, visitDay, phone, email, createdAt, syncStatus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          clientId, 
          clientData.businessName, 
          clientData.address, 
          clientData.defaultList, 
          clientData.visitDay, 
          clientData.phone || '', 
          clientData.email ? clientData.email.trim().toLowerCase() : '', 
          createdAt, 
          'PENDING' 
        ]
      );
      console.log(`✅ Cliente app guardado en SQLite.`);
    }

    return { success: true, clientId };
  } catch (error) {
    console.error("❌ Error guardando cliente:", error);
    return { success: false, message: 'No se pudo guardar el cliente.' };
  }
};

export const syncPendingClients = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const currentBusinessId = useAuthStore.getState().businessId;
    
    // Si estamos en web, no hay pendientes locales que subir
    if (Platform.OS === 'web' || !currentBusinessId) {
       return { success: true, message: "No aplica en web." };
    }

    const pendingClients = await localDb.getAllAsync<any>(
      "SELECT * FROM clients WHERE syncStatus = 'PENDING'"
    );

    if (pendingClients.length === 0) {
      return { success: true, message: "No hay clientes pendientes." };
    }

    const batch = writeBatch(firestore);
    const clientsRef = collection(firestore, 'clients');

    for (const client of pendingClients) {
      const docRef = doc(clientsRef, client.id);
      
      batch.set(docRef, {
        id: client.id,
        businessId: currentBusinessId,
        businessName: client.businessName,
        address: client.address,
        defaultList: client.defaultList,
        visitDay: client.visitDay,
        phone: client.phone || '',
        email: client.email ? client.email.trim().toLowerCase() : '', 
        createdAt: client.createdAt,
        updatedAt: Date.now(),
        syncStatus: 'SYNCED',
        status: 'active' 
      });
    }

    await batch.commit();

    for (const client of pendingClients) {
      await localDb.runAsync(
        "UPDATE clients SET syncStatus = 'SYNCED' WHERE id = ?",
        [client.id]
      );
    }

    return { success: true, message: `Se subieron ${pendingClients.length} clientes a la nube.` };
  } catch (error) {
    console.error("❌ Error sincronizando clientes:", error);
    return { success: false, message: "Error al subir clientes a la nube." };
  }
};