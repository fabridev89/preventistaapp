// src/hooks/useAutoSync.ts
import * as Network from 'expo-network';
import { useEffect } from 'react';
import { syncPendingClients } from '../services/clientService';
import { syncPendingOrders } from '../services/orderService';
import { syncProductsToLocal } from '../services/syncService'; // <-- Importamos los productos
import { useAuthStore } from '../store/useAuthStore';

export const useAutoSync = () => {
  // Cambiamos "user" por "businessId" para eliminar el error rojo
  const { businessId } = useAuthStore(); 

  useEffect(() => {
    if (!businessId) return;

    const checkAndSync = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();
        
        if (networkState.isConnected && networkState.isInternetReachable) {
          // Sincronizamos pedidos
          const ordersResult = await syncPendingOrders();
          if (ordersResult.success && ordersResult.message !== "No hay pedidos pendientes para sincronizar.") {
            console.log("🔄 Auto-Sync Pedidos:", ordersResult.message);
          }

          // Sincronizamos clientes nuevos
          const clientsResult = await syncPendingClients();
          if (clientsResult.success && clientsResult.message !== "No hay clientes pendientes.") {
            console.log("🔄 Auto-Sync Clientes:", clientsResult.message);
          }

          // Sincronizamos catálogo de productos
          try {
            await syncProductsToLocal();
            // console.log("🔄 Auto-Sync Productos revisado.");
          } catch (e) {
            console.log("Error auto-sincronizando productos", e);
          }
        }
      } catch (error) {
        console.error("Error en Auto-Sync:", error);
      }
    };

    checkAndSync();
    const intervalId = setInterval(checkAndSync, 60000);
    return () => clearInterval(intervalId);
  }, [businessId]);
};