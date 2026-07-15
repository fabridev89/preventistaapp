// app/carritos-abandonados.tsx
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import localDb from '../src/config/database';
import { db as firestore } from '../src/config/firebase.config';
import { useAuthStore } from '../src/store/useAuthStore';

export default function CarritosAbandonadosScreen() {
  const router = useRouter();
  const currentBusinessId = useAuthStore((state) => state.businessId);
  
  const [carts, setCarts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAbandonedCarts = async () => {
      if (!currentBusinessId) return;
      
      try {
        const q = query(
          collection(firestore, 'abandoned_carts'),
          where('businessId', '==', currentBusinessId)
        );
        
        const snapshot = await getDocs(q);
        const loadedCarts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Los ordenamos localmente (los más recientes primero)
        loadedCarts.sort((a: any, b: any) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
        
        setCarts(loadedCarts);
      } catch (error) {
        console.error("Error cargando carritos abandonados:", error);
        Alert.alert("Error", "No se pudieron cargar los carritos de la nube.");
      } finally {
        setIsLoading(false);
      }
    };

    loadAbandonedCarts();
  }, [currentBusinessId]);

  const handleWhatsApp = async (cart: any) => {
    try {
      // 1. Buscamos al cliente en SQLite para sacarle el teléfono real
      const result = await localDb.getAllAsync<any>('SELECT phone, businessName FROM clients WHERE id = ?', [cart.clientId]);
      
      let phone = '';
      let clientName = cart.clientEmail; // Fallback por si no tiene nombre

      if (result.length > 0) {
        phone = result[0].phone || '';
        clientName = result[0].businessName;
      }

      // 2. Armamos el texto carnada
      const mensaje = `¡Hola ${clientName}! 👋 Somos de la distribuidora. Vimos que estabas armando un pedido por $${cart.total.toLocaleString('es-AR')} y quedó a medias. ¿Tuviste algún problema con la página o te faltó algo? ¡Avisanos y te ayudamos a confirmarlo!`;
      
      // 3. Abrimos WhatsApp
      let url = `whatsapp://send?text=${encodeURIComponent(mensaje)}`;
      if (phone) {
        // Limpiamos el número por las dudas
        const cleanPhone = phone.replace(/\D/g, ''); 
        url = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(mensaje)}`;
      }
      
      Linking.openURL(url).catch(() => { 
        Alert.alert("Aviso", "No se pudo abrir WhatsApp automáticamente."); 
      });

    } catch (error) {
      console.error("Error buscando teléfono del cliente:", error);
    }
  };

  if (isLoading) return <ActivityIndicator size="large" color="#FF9500" style={{ flex: 1, marginTop: 50 }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ventas por Recuperar</Text>
        <View style={{ width: 30 }} />
      </View>

      {carts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>👻</Text>
          <Text style={styles.emptyText}>No hay carritos abandonados.</Text>
          <Text style={styles.emptySubText}>Todos tus clientes están finalizando sus compras.</Text>
        </View>
      ) : (
        <FlatList
          data={carts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const date = new Date(item.lastUpdatedAt);
            
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.clientEmail}>📧 {item.clientEmail}</Text>
                  <Text style={styles.timeAgo}>
                    {date.toLocaleDateString('es-AR')} {date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <View style={styles.cardBody}>
                  <View>
                    <Text style={styles.itemsCount}>{item.items?.length || 0} productos seleccionados</Text>
                    <Text style={styles.totalLabel}>Plata en la mesa:</Text>
                    <Text style={styles.totalValue}>${item.total.toLocaleString('es-AR')}</Text>
                  </View>

                  <TouchableOpacity 
                    style={styles.wppButton} 
                    onPress={() => handleWhatsApp(item)}
                  >
                    <Text style={styles.wppButtonText}>💬 Contactar</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.itemsPreview}>
                  <Text style={styles.previewTitle}>Resumen rápido:</Text>
                  {item.items?.slice(0, 3).map((cartItem: any, idx: number) => (
                    <Text key={idx} style={styles.previewText} numberOfLines={1}>
                      • {cartItem.quantity}x {cartItem.product.name}
                    </Text>
                  ))}
                  {item.items?.length > 3 && (
                    <Text style={styles.previewText}>...y {item.items.length - 3} más</Text>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FF9500', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 15 },
  backBtn: { padding: 5 },
  backIcon: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyEmoji: { fontSize: 50, marginBottom: 10 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#555', marginBottom: 5 },
  emptySubText: { fontSize: 14, color: '#888', textAlign: 'center' },

  listContent: { padding: 15 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 2, borderWidth: 1, borderColor: '#ffe6c4' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 8 },
  clientEmail: { fontSize: 13, fontWeight: 'bold', color: '#555' },
  timeAgo: { fontSize: 11, color: '#999' },
  
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  itemsCount: { fontSize: 12, color: '#666', marginBottom: 4 },
  totalLabel: { fontSize: 11, color: '#FF9500', fontWeight: 'bold', textTransform: 'uppercase' },
  totalValue: { fontSize: 22, fontWeight: 'black', color: '#333' },
  
  wppButton: { backgroundColor: '#25D366', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, elevation: 1 },
  wppButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  
  itemsPreview: { backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8 },
  previewTitle: { fontSize: 11, fontWeight: 'bold', color: '#888', marginBottom: 4 },
  previewText: { fontSize: 12, color: '#666', marginBottom: 2 }
});