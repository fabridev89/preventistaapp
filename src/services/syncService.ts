// src/services/syncService.ts
import { collection, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { Platform } from 'react-native';
import localDb from '../config/database';
import { db as firestore } from '../config/firebase.config';
import { useAuthStore } from '../store/useAuthStore';

export const syncClientsToLocal = async () => {
  if (Platform.OS === 'web') return { success: true, message: "Web no usa SQLite" };

  try {
    const currentBusinessId = useAuthStore.getState().businessId;
    if (!currentBusinessId) return { success: false, message: "No hay sesión iniciada." };

    console.log(`1. Descargando clientslist de la empresa ${currentBusinessId}...`);
    
    const q = query(collection(firestore, 'clients'), where('businessId', '==', currentBusinessId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log("No hay clientslist nuevos en la nube.");
      return { success: true, message: "No hay clientslist para sincronizar." };
    }

    // 🔥 LIMPIEZA PREVIA: Borramos los sincronizados locales para evitar acumular clones o fantasmas 🔥
    await localDb.execAsync("DELETE FROM clients WHERE syncStatus = 'SYNCED'");

    // 🔥 DEDUPLICADOR INTELIGENTE POR EMAIL 🔥
    const uniqueClientslist = new Map();

    for (const document of snapshot.docs) {
      const data = document.data();
      const email = (data.email || '').trim().toLowerCase();
      
      // Usamos el email como llave si existe, sino usamos su ID
      const key = email !== '' ? email : document.id;

      if (uniqueClientslist.has(key)) {
        const existing = uniqueClientslist.get(key);
        // Si el que ya estaba en el mapa era manual (CLI-) y el nuevo viene de la web, priorizamos el de la web
        if (existing.id.startsWith('CLI-') && !document.id.startsWith('CLI-')) {
          uniqueClientslist.set(key, { id: document.id, ...data });
        }
      } else {
        uniqueClientslist.set(key, { id: document.id, ...data });
      }
    }

    console.log(`2. Guardando ${uniqueClientslist.size} clientslist únicos en SQLite...`);

    for (const data of uniqueClientslist.values()) {
      const businessName = data.businessName || 'Client Web';
      const address = data.address || 'Sin dirección';
      const phone = data.phone || '';
      const email = data.email || ''; 
      const defaultList = data.defaultList || data.priceList || 'list1';
      const visitDay = data.visitDay || 'Lunes';
      const createdAt = data.createdAt || Date.now();
      const updatedAt = data.updatedAt || Date.now();

      await localDb.runAsync(
        `INSERT OR REPLACE INTO clients 
        (id, businessName, address, phone, email, defaultList, visitDay, createdAt, updatedAt, syncStatus) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
        [
          data.id,
          businessName,
          address,
          phone,
          email, 
          defaultList,
          visitDay,
          createdAt,
          updatedAt
        ]
      );
    }

    console.log("✅ Sincronización de clientslist exitosa.");
    return { success: true, message: "Clientslist sincronizados correctamente." };
  } catch (error) {
    console.error("❌ Error sincronizando clientslist:", error);
    return { success: false, message: "Hubo un error al descargar los clientslist." };
  }
};

export const syncPendingClients = async () => {
  if (Platform.OS === 'web') return { success: true, message: "Web no usa SQLite" };

  try {
    const currentBusinessId = useAuthStore.getState().businessId;
    if (!currentBusinessId) return { success: false, message: "No hay sesión iniciada." };

    const pendingClientslist: any[] = await localDb.getAllAsync(
      "SELECT * FROM clients WHERE syncStatus = 'PENDING'"
    );

    if (pendingClientslist.length === 0) {
      console.log("No hay clientslist pendientes para subir.");
      return { success: true, message: "No hay clientslist pendientes." };
    }

    console.log(`Subiendo ${pendingClientslist.length} clientslist a Firebase...`);

    for (const client of pendingClientslist) {
      const { syncStatus, ...clientDataToUpload } = client;

      const finalData = {
        ...clientDataToUpload,
        businessId: currentBusinessId,
        email: clientDataToUpload.email ? clientDataToUpload.email.trim().toLowerCase() : '',
        status: clientDataToUpload.status || 'active',
        priceList: clientDataToUpload.defaultList || 'list1',
        updatedAt: Date.now()
      };

      const clientRef = doc(firestore, 'clients', client.id);
      await setDoc(clientRef, finalData, { merge: true });

      await localDb.runAsync(
        "UPDATE clients SET syncStatus = 'SYNCED' WHERE id = ?",
        [client.id]
      );
    }

    console.log("✅ Subida de clientslist exitosa.");
    return { success: true, message: `Se subieron ${pendingClientslist.length} clientslist a la nube.` };
  } catch (error) {
    console.error("❌ Error subiendo clientslist pendientes:", error);
    return { success: false, message: "Hubo un error al subir los clientslist." };
  }
};

export const syncSuppliersToLocal = async () => {
  if (Platform.OS === 'web') return { success: true, message: "Web no usa SQLite" };

  try {
    const currentBusinessId = useAuthStore.getState().businessId;
    if (!currentBusinessId) return { success: false, message: "No hay sesión iniciada." };

    console.log(`Descargando lista de proveedores de la empresa ${currentBusinessId}...`);
    
    const q = query(collection(firestore, 'suppliers'), where('businessId', '==', currentBusinessId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log("No hay proveedores en la nube para descargar.");
      return { success: true, message: "No hay proveedores nuevos." };
    }

    console.log(`Guardando ${snapshot.size} proveedores en la base SQLite local...`);

    for (const d of snapshot.docs) {
      const data = d.data();
      const name = data.name || 'PROVEEDOR';
      const phone = data.phone || '';
      const address = data.address || '';
      const defaultPaymentMethod = data.defaultPaymentMethod || 'EFECTIVO';
      const deliveryDay = data.deliveryDay || 'Lunes';
      const createdAt = data.createdAt || Date.now();

      await localDb.runAsync(
        `INSERT OR REPLACE INTO suppliers 
        (id, name, phone, address, defaultPaymentMethod, deliveryDay, createdAt, syncStatus) 
        VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
        [
          d.id,
          name,
          phone,
          address,
          defaultPaymentMethod,
          deliveryDay,
          createdAt
        ]
      );
    }

    console.log("✅ Lista de proveedores local sincronizada.");
    return { success: true, message: "Proveedores actualizados." };
  } catch (error) {
    console.error("❌ Error descargando proveedores:", error);
    return { success: false, message: "Error al sincronizar proveedores." };
  }
};

export const syncProductsToLocal = async () => {
  if (Platform.OS === 'web') return { success: true, message: "Web no usa SQLite" };

  try {
    const currentBusinessId = useAuthStore.getState().businessId;
    if (!currentBusinessId) return { success: false, message: "No hay sesión iniciada." };

    // 🔥 AUTO-MIGRACIÓN: Soluciona el error rojo de Expo creando la columna si no existe 🔥
    try { await localDb.execAsync("ALTER TABLE products ADD COLUMN syncStatus TEXT DEFAULT 'SYNCED';"); } catch (e) { /* Ya existe, ignorar */ }

    const q = query(collection(firestore, 'products'), where('businessId', '==', currentBusinessId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return { success: true, message: "No hay productos en la nube." };

    await localDb.withTransactionAsync(async () => {
      for (const d of snapshot.docs) {
        const data = d.data();
        
        const list1 = Number(data.list1) || 0;
        const list2 = Number(data.list2) || 0;
        const list3 = Number(data.list3) || 0;
        const baseCost = Number(data.baseCost) || 0;
        const internalCode = data.internalCode || 'S/C';
        const isHidden = data.isHidden ? 1 : 0;
        const images = JSON.stringify(data.images || []);

        await localDb.runAsync(
          `INSERT OR REPLACE INTO products 
          (id, name, baseCost, internalCode, list1, list2, list3, abcCategory, isHidden, images, syncStatus) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')`,
          [
            d.id, 
            data.name || 'Sin Nombre', 
            baseCost, 
            internalCode, 
            list1, 
            list2, 
            list3, 
            data.abcCategory || 'General', 
            isHidden, 
            images
          ]
        );
      }
    });
    
    console.log("✅ Catálogo sincronizado correctamente.");
    return { success: true, message: "Productos actualizados." };
  } catch (error) {
    console.error("❌ Error al sincronizar productos:", error);
    return { success: false, message: "Error al sincronizar el catálogo." };
  }
};

export const wipeEntireCatalogEverywhere = async () => {
  try {
    const currentBusinessId = useAuthStore.getState().businessId;
    if (!currentBusinessId) return { success: false, message: "No hay sesión iniciada." };

    console.log(`1. Iniciando purga completa del catálogo para la empresa: ${currentBusinessId}...`);

    const q = query(collection(firestore, 'products'), where('businessId', '==', currentBusinessId));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const batch = writeBatch(firestore);
      snapshot.docs.forEach((document) => {
        batch.delete(document.ref);
      });
      await batch.commit();
    }

    if (Platform.OS !== 'web') {
      await localDb.execAsync("DELETE FROM products;"); 
    }

    console.log("✅ Catálogo borrado completamente (Nube y Local).");
    return { success: true, message: "Catálogo borrado correctamente de Firebase y el celular." };
  } catch (error) {
    console.error("❌ Error borrando el catálogo:", error);
    return { success: false, message: "Hubo un error al vaciar el catálogo." };
  }
};

export const wipeAllOrdersEverywhere = async () => {
  try {
    const currentBusinessId = useAuthStore.getState().businessId;
    if (!currentBusinessId) return { success: false, message: "No hay sesión iniciada." };

    console.log(`Iniciando purga de pedidos para la empresa: ${currentBusinessId}...`);

    const q = query(collection(firestore, 'orders'), where('businessId', '==', currentBusinessId));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const batch = writeBatch(firestore);
      snapshot.docs.forEach((document) => {
        batch.delete(document.ref);
      });
      await batch.commit();
      console.log("✅ Pedidos eliminados de Firebase con éxito.");
    }

    if (Platform.OS !== 'web') {
      await localDb.execAsync("DELETE FROM orders;");
      console.log("✅ Pedidos eliminados de SQLite local.");
    }

    return { success: true, message: "Historial de pedidos borrado por completo." };
  } catch (error) {
    console.error("❌ Error en la purga de pedidos:", error);
    return { success: false, message: "Hubo un error al borrar el historial de pedidos." };
  }
};