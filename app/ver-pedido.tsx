// app/ver-pedido.tsx
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, increment, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import localDb from '../src/config/database';
import { db as firestore } from '../src/config/firebase.config';

const safeParseItems = (itemsRaw: any) => {
  if (!itemsRaw) return [];
  try {
    let parsed = typeof itemsRaw === 'string' ? JSON.parse(itemsRaw) : itemsRaw;
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

export default function VerPedidoScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  
  const [order, setOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [trackingCode, setTrackingCode] = useState('');

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        if (Platform.OS === 'web') {
          const docRef = doc(firestore, 'orders', String(id));
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setOrder({ ...data, items: safeParseItems(data.items) });
          } else {
            Alert.alert('Error', 'Pedido no encontrado');
            router.back();
          }
        } else {
          const result = await localDb.getFirstAsync<any>(
            'SELECT * FROM orders WHERE id = ?',
            [String(id)]
          );
          if (result) {
            setOrder({ ...result, items: safeParseItems(result.items) });
          } else {
            Alert.alert('Error', 'Pedido no encontrado');
            router.back();
          }
        }
      } catch (error) {
        console.error("Error cargando el pedido completo:", error);
      } finally {
        setIsLoading(false);
      }
    };
    if (id) fetchOrder();
  }, [id]);

  // 👇 DESPACHAR: AHORA ACÁ ES DONDE SE DESCUENTA EL STOCK 👇
  const handleDespachar = async () => {
    try {
      if (Platform.OS === 'web') {
        await setDoc(doc(firestore, 'orders', String(id)), { status: 'DESPACHADO' }, { merge: true });
        
        const parsedItems = safeParseItems(order.items);
        for (const item of parsedItems) {
          if (item.product && item.product.id) {
            await updateDoc(doc(firestore, 'products', item.product.id), {
              stock: increment(-item.quantity),
              updatedAt: Date.now()
            }).catch(e => console.log(e));
          }
        }
      } else {
        await localDb.runAsync(
          "UPDATE orders SET status = ?, syncStatus = 'PENDING' WHERE id = ?",
          ['DESPACHADO', String(id)]
        );
        
        const parsedItems = safeParseItems(order.items);
        for (const item of parsedItems) {
          if (item.product && item.product.id) {
            await localDb.runAsync(
              `UPDATE products SET stock = COALESCE(stock, 0) - ?, updatedAt = ?, syncStatus = 'PENDING' WHERE id = ?`,
              [item.quantity, Date.now(), item.product.id]
            ).catch(e => console.log(e));
          }
        }
      }
      Alert.alert("Éxito", "El pedido ha sido marcado como despachado y el stock fue reservado.", [
        { text: "OK", onPress: () => router.replace('/pedidos' as any) } 
      ]);
    } catch (error) {
      Alert.alert("Error", "No se pudo despachar el pedido.");
    }
  };

  // 👇 ENTREGAR: AHORA SOLO MARCA EL ESTADO (El stock ya se descontó antes) 👇
  const handleEntregar = async () => {
    try {
      if (Platform.OS === 'web') {
        await setDoc(doc(firestore, 'orders', String(id)), { status: 'ENTREGADO' }, { merge: true });
      } else {
        await localDb.runAsync(
          "UPDATE orders SET status = ?, syncStatus = 'PENDING' WHERE id = ?",
          ['ENTREGADO', String(id)]
        );
      }
      Alert.alert("¡Pedido Completado!", "El pedido ha sido marcado como entregado.", [
        { text: "OK", onPress: () => router.replace('/pedidos' as any) } 
      ]);
    } catch (error) {
      Alert.alert("Error", "No se pudo entregar el pedido.");
    }
  };

  if (isLoading || !order) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#135C58" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{order.status === 'PENDIENTE' ? 'PENDIENTE' : order.status}</Text>
      </View>

      <FlatList
        data={order.items}
        keyExtractor={(_, index) => index.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          if (!item || !item.product) return null; 

          let imageUrl = null;
          if (item.product.images && item.product.images.length > 0 && String(item.product.images) !== "[]") {
            try {
              imageUrl = typeof item.product.images === 'string' ? JSON.parse(item.product.images)[0] : item.product.images[0];
            } catch (e) {
              imageUrl = null;
            }
          }

          return (
            <View style={styles.productCard}>
              <View style={styles.imageContainer}>
                {imageUrl ? (
                  <Image 
                    source={{ uri: imageUrl }} 
                    style={styles.productImage} 
                    contentFit="contain" 
                  />
                ) : (
                  <View style={styles.noImagePlaceholder}>
                    <Text style={styles.noImageText}>Sin foto</Text>
                  </View>
                )}
              </View>

              <View style={styles.productInfo}>
                <Text style={styles.productName}>{(item.product.name || 'Producto').toUpperCase()}</Text>
                <Text style={styles.productDetail}>Código {item.product.internalCode || 'S/C'}</Text>
                <Text style={styles.productDetail}>Cantidad {item.quantity || 1}</Text>
                <Text style={styles.productPrice}>Precio $ {(item.unitPrice || 0).toLocaleString('es-AR')}</Text>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.footer}>
        <View style={styles.trackingRow}>
          <Text style={styles.footerLabel}>Código de Guía (Opcional):</Text>
          <TextInput 
            style={styles.trackingInput} 
            placeholder="Ingresa el código"
            placeholderTextColor="#999"
            value={trackingCode}
            onChangeText={setTrackingCode}
          />
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.footerLabel}>Subtotal:</Text>
          <Text style={styles.footerValue}>$ {(order.total || 0).toLocaleString('es-AR')}</Text>
        </View>
        
        <View style={[styles.totalRow, { marginBottom: 15 }]}>
          <Text style={[styles.footerLabel, { fontWeight: 'bold' }]}>Total:</Text>
          <Text style={[styles.footerValue, { fontWeight: 'bold' }]}>$ {(order.total || 0).toLocaleString('es-AR')}</Text>
        </View>

        <TouchableOpacity 
          style={[
            styles.despacharBtn, 
            order.status === 'DESPACHADO' ? { backgroundColor: '#34C759' } : 
            order.status === 'ENTREGADO' ? { backgroundColor: '#888' } : {}
          ]} 
          onPress={order.status === 'DESPACHADO' ? handleEntregar : handleDespachar}
          disabled={order.status === 'ENTREGADO'}
        >
          <Text style={styles.despacharBtnText}>
            {order.status === 'ENTREGADO' ? 'YA ENTREGADO' : 
             order.status === 'DESPACHADO' ? 'MARCAR COMO ENTREGADO' : 'DESPACHAR'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e9ecef' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#e9ecef' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#135C58', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 15 },
  backBtn: { padding: 5, marginRight: 15 },
  backBtnText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  listContent: { padding: 15, paddingBottom: 20 },
  productCard: { flexDirection: 'row', backgroundColor: '#fdfdfd', borderRadius: 8, padding: 10, marginBottom: 10, elevation: 1 },
  imageContainer: { width: 70, height: 70, marginRight: 15, backgroundColor: '#fff', borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  productImage: { width: '100%', height: '100%' },
  noImagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', borderRadius: 4 },
  noImageText: { fontSize: 10, color: '#aaa' },
  productInfo: { flex: 1, justifyContent: 'center' },
  productName: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 4 },
  productDetail: { fontSize: 13, color: '#666', marginBottom: 2 },
  productPrice: { fontSize: 14, color: '#333', fontWeight: 'bold', marginTop: 2 },
  footer: { backgroundColor: '#fdfdfd', padding: 20, borderTopWidth: 1, borderTopColor: '#ddd' },
  trackingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  trackingInput: { flex: 1, marginLeft: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14 },
  totalRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  footerLabel: { width: 180, fontSize: 16, color: '#000', fontWeight: '600' },
  footerValue: { fontSize: 18, color: '#000' },
  despacharBtn: { backgroundColor: '#135C58', paddingVertical: 15, borderRadius: 4, alignItems: 'center' },
  despacharBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});