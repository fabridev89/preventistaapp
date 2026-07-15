// app/compras.tsx
import { useFocusEffect, useRouter } from 'expo-router';
// 👇 Importamos setDoc e increment para darle el poder de sumar stock a este archivo
import { collection, deleteDoc, doc, getDocs, increment, query, setDoc, where } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import localDb from '../src/config/database';
import { db as firestore } from '../src/config/firebase.config';
import { useAuthStore } from '../src/store/useAuthStore';

export default function ComprasScreen() {
  const router = useRouter();
  
  // 👇 TRAEMOS EL BUSINESS ID PARA BLINDAR LOS DATOS 👇
  const { businessId } = useAuthStore();
  
  const [purchases, setPurchases] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadPurchases = async () => {
    if (!businessId) return;

    try {
      if (Platform.OS === 'web') {
        const q = query(collection(firestore, 'purchase_orders'), where('businessId', '==', businessId));
        const snapshot = await getDocs(q);
        const webPurchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPurchases(webPurchases.sort((a: any, b: any) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)));
      } else {
        try { await localDb.execAsync("ALTER TABLE purchase_orders ADD COLUMN discount REAL DEFAULT 0;"); } catch (e) {}
        try { await localDb.execAsync("ALTER TABLE purchase_orders ADD COLUMN businessId TEXT;"); } catch (e) {}
        
        const result = await localDb.getAllAsync<any>('SELECT * FROM purchase_orders ORDER BY createdAt DESC');
        setPurchases(result);
      }
    } catch (error) {
      console.error("Error cargando órdenes de compra:", error);
    }
  };

  useFocusEffect(useCallback(() => { loadPurchases(); }, [businessId]));

  const handleDelete = (id: string) => {
    if (Platform.OS === 'web') {
      const confirmar = window.confirm("¿Estás seguro de que querés borrar esta orden de compra?");
      if (confirmar) {
        deleteDoc(doc(firestore, 'purchase_orders', id))
          .then(() => {
            window.alert("Orden de compra eliminada");
            loadPurchases();
          })
          .catch(e => {
            console.error(e);
            window.alert("Error al eliminar la orden");
          });
      }
    } else {
      Alert.alert("Eliminar Orden", "¿Estás seguro de que querés borrar esta orden de compra?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, eliminar", style: "destructive", onPress: async () => {
            await localDb.runAsync('DELETE FROM purchase_orders WHERE id = ?', [id]);
            Alert.alert("Éxito", "Orden de compra eliminada");
            loadPurchases();
          }
        }
      ]);
    }
  };

  // 👇 NUEVA LÓGICA BLINDADA PARA EL BOTÓN DE AFUERA 👇
  const processReception = async (order: any) => {
    try {
      let items = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : order.items;
      
      if (Platform.OS === 'web') {
        // 1. Marcar estado
        await setDoc(doc(firestore, 'purchase_orders', order.id), { status: 'RECIBIDO' }, { merge: true });
        
        // 2. Sumar stock
        let productosSumados = 0;
        for (const item of items) {
          if (item.product && item.product.id) {
            const numericCost = parseFloat(String(item.cost).replace(',', '.') || '0');
            const numericQty = Number(item.quantity) || 0;
            
            await setDoc(doc(firestore, 'products', String(item.product.id)), {
              stock: increment(numericQty),
              baseCost: numericCost,
              updatedAt: Date.now()
            }, { merge: true });
            
            productosSumados++;
          }
        }
        window.alert(`¡Mercadería Recibida!\nSe sumó el stock a ${productosSumados} productos correctamente.`);
      } else {
        // LÓGICA MÓVIL
        await localDb.runAsync("UPDATE purchase_orders SET status = 'RECIBIDO', syncStatus = 'PENDING' WHERE id = ?", [order.id]);
        
        let productosSumados = 0;
        for (const item of items) {
          if (item.product && item.product.id) {
            const numericCost = parseFloat(String(item.cost).replace(',', '.') || '0');
            const numericQty = Number(item.quantity) || 0;
            
            try {
              await localDb.runAsync(
                `UPDATE products SET stock = (CAST(COALESCE(stock, 0) AS REAL) + ?), baseCost = ?, updatedAt = ?, syncStatus = 'PENDING' WHERE id = ?`,
                [numericQty, numericCost, Date.now(), String(item.product.id)]
              );
            } catch (sqlError) {
              await localDb.runAsync(
                `UPDATE products SET stock = (CAST(COALESCE(stock, 0) AS REAL) + ?), baseCost = ?, updatedAt = ? WHERE id = ?`,
                [numericQty, numericCost, Date.now(), String(item.product.id)]
              );
            }
            productosSumados++;
          }
        }
        Alert.alert("¡Mercadería Recibida!", `Se sumó el stock a ${productosSumados} productos.`);
      }
      
      loadPurchases(); // Recargamos la lista para actualizar el color
    } catch (error) {
      console.error("Error procesando recepción:", error);
      if (Platform.OS === 'web') window.alert("Error al procesar la recepción.");
      else Alert.alert("Error", "No se pudo procesar la recepción.");
    }
  };

  const confirmAndReceive = (order: any) => {
    if (Platform.OS === 'web') {
      const confirmado = window.confirm("¿Confirmás que recibiste esta mercadería?\nSe sumará el stock a los productos automáticamente.");
      if (confirmado) processReception(order);
    } else {
      Alert.alert(
        "Confirmar Recepción",
        "¿Confirmás que recibiste esta mercadería? Se sumará el stock a los productos automáticamente.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Sí, sumar stock", onPress: () => processReception(order) }
        ]
      );
    }
  };

  const filteredPurchases = purchases.filter(p => 
    (p.supplierName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
     <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 10 }}>
          <Text style={styles.menuIcon}>←</Text>
        </TouchableOpacity>
        
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput 
            style={styles.searchInput}
            placeholder="Nombre del proveedor"
            placeholderTextColor="#a0c4c2"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <TouchableOpacity onPress={() => router.push('/proveedores' as any)} style={{ paddingLeft: 10 }}>
          <Text style={styles.filterIcon}>👥</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredPurchases}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const date = new Date(item.createdAt);
          const isReceived = item.status === 'RECIBIDO';
          const finalTotal = Number(item.total) || 0;

          return (
            <View style={styles.card}>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </TouchableOpacity>

              <Text style={styles.supplierName}>{item.supplierName || 'Proveedor Desconocido'}</Text>
              <Text style={styles.paymentMethod}>{item.paymentMethod || 'EFECTIVO'}</Text>
              
              <Text style={styles.totalValue}>$ {finalTotal.toLocaleString('es-AR')}</Text>

              <Text style={[styles.statusText, isReceived && { color: '#34C759' }]}>
                {item.status || 'PENDIENTE'}
              </Text>

              <View style={styles.buttonsRow}>
                <TouchableOpacity 
                  style={styles.btnVer}
                  onPress={() => router.push({ pathname: '/ver-compra', params: { id: item.id } } as any)}
                >
                  <Text style={styles.btnVerText}>1. VER ORDEN</Text>
                </TouchableOpacity>

                {/* 👇 BOTÓN CORREGIDO: AHORA SUMA STOCK Y PROTEGE DOBLES TOQUES 👇 */}
                <TouchableOpacity 
                  style={[styles.btnStatus, isReceived && styles.btnStatusActive]}
                  onPress={() => {
                    if (isReceived) {
                      const msg = "Esta orden ya ingresó al stock. Si necesitas deshacerlo, editá el stock de los productos manualmente.";
                      if (Platform.OS === 'web') window.alert(msg);
                      else Alert.alert("Ya recibido", msg);
                    } else {
                      confirmAndReceive(item);
                    }
                  }}
                >
                  <Text style={[styles.btnStatusText, isReceived && styles.btnStatusTextActive]}>
                    {isReceived ? '✅ RECIBIDO' : '2. RECIBIR STOCK'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.dateText}>
                {date.toLocaleDateString('es-AR')} {date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>No hay órdenes de compra registradas.</Text>}
      />

      <TouchableOpacity 
        style={styles.fab}
        onPress={() => router.push('/crear-compra' as any)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e9ecef' },
  header: { backgroundColor: '#135C58', paddingTop: Platform.OS === 'web' ? 20 : 50, paddingBottom: 15, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuIcon: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f4c49', marginHorizontal: 15, borderRadius: 8, paddingHorizontal: 10, height: 40 },
  searchIcon: { color: '#a0c4c2', marginRight: 5 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  filterIcon: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  listContent: { padding: 15, paddingBottom: 100 },
  card: { backgroundColor: '#fdfdfd', borderRadius: 8, padding: 15, marginBottom: 15, elevation: 2, position: 'relative' },
  deleteBtn: { position: 'absolute', top: -10, right: -10, backgroundColor: '#FF3B30', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', elevation: 3, zIndex: 10 },
  deleteBtnText: { color: '#fff', fontSize: 16 },
  supplierName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  paymentMethod: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 15 },
  totalValue: { fontSize: 22, fontWeight: '900', color: '#333', marginBottom: 5 },
  statusText: { position: 'absolute', right: 15, top: 45, fontSize: 14, fontWeight: 'bold', color: '#555' },
  buttonsRow: { flexDirection: 'row', gap: 10, marginTop: 15 },
  btnVer: { flex: 1, backgroundColor: '#FFB800', paddingVertical: 12, borderRadius: 6, alignItems: 'center' },
  btnVerText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  btnStatus: { flex: 1, backgroundColor: '#d4d4d4', paddingVertical: 12, borderRadius: 6, alignItems: 'center' },
  btnStatusActive: { backgroundColor: '#34C759' },
  btnStatusText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  btnStatusTextActive: { color: '#fff' },
  dateText: { textAlign: 'right', fontSize: 12, color: '#aaa', marginTop: 15 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#888', fontSize: 16 },
  fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#2ecc71', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  fabIcon: { color: '#fff', fontSize: 30, fontWeight: 'bold' }
});