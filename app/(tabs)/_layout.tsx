// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, Platform, Text } from 'react-native';

import { collection, onSnapshot, query, where } from 'firebase/firestore';
import localDb from '../../src/config/database';
import { db as firestore } from '../../src/config/firebase.config';
import { useAuthStore } from '../../src/store/useAuthStore';

const TabIcon = ({ icon, focused }: { icon: string; focused: boolean }) => (
  <Text style={{ fontSize: Platform.OS === 'web' ? 20 : 24, opacity: focused ? 1 : 0.4 }}>{icon}</Text>
);

export default function TabsLayout() {
  const businessId = useAuthStore((state) => state.businessId);

  useEffect(() => {
    if (!businessId) return;

    const q = query(collection(firestore, 'orders'), where('businessId', '==', businessId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const order = change.doc.data();
          const isNewOrder = (Date.now() - order.createdAt) < 120000;

          // 👇 PREVENIMOS EL DOBLE CONVERTIDO A TEXTO 👇
          const itemsForDB = typeof order.items === 'string' ? order.items : JSON.stringify(order.items || []);

          try {
            await localDb.runAsync(
              `INSERT OR REPLACE INTO orders 
              (id, clientId, clientName, total, items, createdAt, notes, status, syncStatus) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                order.id, order.clientId || '', order.clientName || 'Cliente Web',
                order.total || 0, itemsForDB, order.createdAt || Date.now(),
                order.notes || '', order.status || 'PENDIENTE', 'SYNCED'
              ]
            );

            if (isNewOrder) {
              if (Platform.OS === 'web') {
                window.alert(`🔔 ¡NUEVO PEDIDO WEB!\n${order.clientName || 'Un cliente'} acaba de enviar un pedido por $${order.total.toLocaleString('es-AR')}.`);
              } else {
                Alert.alert(
                  "🔔 ¡NUEVO PEDIDO WEB!",
                  `${order.clientName || 'Un cliente'} envió un pedido por $${order.total.toLocaleString('es-AR')}.`,
                  [{ text: "Ver pedido", style: "default" }]
                );
              }
            }
          } catch (error) {
            console.error("Error guardando pedido del radar:", error);
          }
        }
      });
    });

    return () => unsubscribe();
  }, [businessId]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#34C759',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: Platform.OS === 'web' ? 60 : 110,
          paddingBottom: Platform.OS === 'web' ? 5 : 15,
          paddingTop: 5,
        },
        tabBarLabelStyle: {
          fontSize: Platform.OS === 'web' ? 10 : 11,
          fontWeight: 'bold',
        }
      }}
    >
      <Tabs.Screen name="inicio" options={{ title: 'Inicio', tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} /> }} />
      <Tabs.Screen name="ruta" options={{ title: 'Ruta', tabBarIcon: ({ focused }) => <TabIcon icon="📍" focused={focused} /> }} />
      <Tabs.Screen name="catalogo" options={{ title: 'Catálogo', tabBarIcon: ({ focused }) => <TabIcon icon="📦" focused={focused} /> }} />
      <Tabs.Screen name="pedidos" options={{ title: 'Historial', tabBarIcon: ({ focused }) => <TabIcon icon="🧾" focused={focused} /> }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" focused={focused} /> }} />
    </Tabs>
  );
}