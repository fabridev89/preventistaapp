// app/(tabs)/inicio.tsx
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, getCountFromServer, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import localDb from '../../src/config/database';
import { db as firestore } from '../../src/config/firebase.config';
import { useAuthStore } from '../../src/store/useAuthStore';

export default function InicioScreen() {
  const router = useRouter();
  
  const { businessId, vendorName } = useAuthStore();
  
  // El loader arranca en true solo la primera vez que se monta la pantalla
  const [isLoading, setIsLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0); 
  const [stats, setStats] = useState({
    pedidos: 0,
    ventas: 0,
    clientes: 0,
    productos: 0
  });

  // Radar de usuarios pendientes
  useEffect(() => {
    const q = query(collection(firestore, 'users'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snap) => setPendingCount(snap.size));
    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const loadStats = async () => {
        if (!businessId) {
          setIsLoading(false); 
          return; 
        }

        try {
          if (Platform.OS === 'web') {
            // 🚀 MODO WEB: PARALELISMO PURO CON PROMISE.ALL 🚀
            const ordersQuery = query(collection(firestore, 'orders'), where('businessId', '==', businessId));
            const clientsQuery = query(collection(firestore, 'clients'), where('businessId', '==', businessId));
            const productsQuery = query(collection(firestore, 'products'), where('businessId', '==', businessId));

            const [ordersSnap, clientsSnapshot, productsSnapshot] = await Promise.all([
              getDocs(ordersQuery),
              getCountFromServer(clientsQuery),
              getCountFromServer(productsQuery)
            ]);

            let totalVentas = 0;
            ordersSnap.forEach((doc) => {
              totalVentas += Number(doc.data().total) || 0;
            });

            setStats({
              pedidos: ordersSnap.size, 
              ventas: totalVentas,
              clientes: clientsSnapshot.data().count,
              productos: productsSnapshot.data().count
            });

          } else {
            // 🚀 MODO APP (SQLITE): PARALELISMO PURO 🚀
            const [ordersData, clientsData, productsData] = await Promise.all([
              localDb.getAllAsync<any>('SELECT COUNT(*) as totalPedidos, SUM(total) as totalVentas FROM orders'),
              localDb.getAllAsync<any>('SELECT COUNT(*) as totalClientes FROM clients'),
              localDb.getAllAsync<any>('SELECT COUNT(*) as totalProductos FROM products')
            ]);

            const oData = ordersData.length > 0 ? ordersData[0] : {};
            const cData = clientsData.length > 0 ? clientsData[0] : {};
            const pData = productsData.length > 0 ? productsData[0] : {};

            setStats({
              pedidos: oData.totalPedidos || 0,
              ventas: oData.totalVentas || 0,
              clientes: cData.totalClientes || 0,
              productos: pData.totalProductos || 0
            });
          }
        } catch (error) {
          console.error("Error cargando estadísticas:", error);
        } finally {
          // Apagamos el loader una vez terminado. 
          // Al volver a la pestaña, se refresca en silencio sin mostrar el cargando molesto.
          setIsLoading(false);
        }
      };

      loadStats();
    }, [businessId])
  );

  const handleShareCatalog = async () => {
    try {
      const linkOficial = businessId 
        ? `https://preventiastas.web.app/${businessId}` 
        : 'https://preventiastas.web.app';

      await Share.share({
        message: `¡Hola! Te comparto nuestro catálogo online actualizado para que hagas tus pedidos rápido y fácil: ${linkOficial}`,
      });
    } catch (error) {
      console.error("Error compartiendo:", error);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#34C759" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {vendorName || 'VENDEDOR'} 👋</Text>
          <Text style={styles.subtitle}>Resumen operativo de hoy</Text>
        </View>
        <TouchableOpacity style={styles.helpBtn}>
          <Text style={styles.helpBtnText}>Ayuda</Text>
        </TouchableOpacity>
      </View>

      {pendingCount > 0 && (
        <TouchableOpacity style={styles.btnPendientes} onPress={() => router.push('/clientes-web' as any)}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingCount}</Text>
          </View>
          <Text style={styles.btnPendientesText}>Clientes web esperando aprobación</Text>
        </TouchableOpacity>
      )}

      <View style={styles.gridContainer}>
        <TouchableOpacity style={styles.statCard} onPress={() => router.push('/ruta' as any)}>
          <View style={styles.cardHeader}>
            <Text style={styles.statTitle}>👥 CLIENTES</Text>
            <Text style={styles.arrowIcon}>&gt;</Text>
          </View>
          <Text style={styles.statValueGreen}>{stats.clientes}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.statCard} onPress={() => router.push('/pedidos' as any)}>
          <View style={styles.cardHeader}>
            <Text style={styles.statTitle}>🛒 PEDIDOS</Text>
            <Text style={styles.arrowIcon}>&gt;</Text>
          </View>
          <View style={styles.badgeRed}>
            <Text style={styles.badgeRedText}>{stats.pedidos} NUEVOS</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.statCard} onPress={() => router.push('/catalogo' as any)}>
          <View style={styles.cardHeader}>
            <Text style={styles.statTitle}>📦 PRODUCTOS</Text>
            <Text style={styles.arrowIcon}>&gt;</Text>
          </View>
          <Text style={styles.statValueGreen}>{stats.productos}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.statCard} onPress={() => router.push('/pedidos' as any)}>
          <View style={styles.cardHeader}>
            <Text style={styles.statTitle}>💵 VENTAS</Text>
            <Text style={styles.arrowIcon}>&gt;</Text>
          </View>
          <Text style={styles.statValueGreen}>$ {stats.ventas.toLocaleString('es-AR')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionCard}>
        <Text style={styles.actionNumber}>1</Text>
        <Text style={styles.actionTitle}>Abastecimiento</Text>
        <Text style={styles.actionDesc}>
          Crea nuevas órdenes de compra a proveedores, registra pagos y actualiza tu stock.
        </Text>
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity 
            style={[styles.btnPrimary, { flex: 1, backgroundColor: '#FF9500' }]} 
            onPress={() => router.push('/compras' as any)}
          >
            <Text style={styles.btnPrimaryText}>Mis Compras</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.actionCard}>
        <Text style={styles.actionNumber}>2</Text>
        <Text style={styles.actionTitle}>Comenzar Recorrido</Text>
        <Text style={styles.actionDesc}>
          Visita a tus clientes organizados por día, toma pedidos y sincroniza automáticamente.
        </Text>
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity 
            style={[styles.btnPrimary, { flex: 1 }]} 
            onPress={() => router.push('/ruta' as any)}
          >
            <Text style={styles.btnPrimaryText}>Ir a Hoja de Ruta</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.actionCard}>
        <Text style={styles.actionNumber}>3</Text>
        <Text style={styles.actionTitle}>Catálogo y Ventas</Text>
        <Text style={styles.actionDesc}>
          Revisa el stock, actualiza precios o comparte el catálogo online con tus clientes.
        </Text>
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity 
            style={[styles.btnPrimary, { flex: 1 }]} 
            onPress={handleShareCatalog}
          >
            <Text style={styles.btnPrimaryText}>Compartir Catálogo</Text>
          </TouchableOpacity>
          <View style={{ width: 10 }} />
          <TouchableOpacity 
            style={[styles.btnSecondary, { flex: 1 }]} 
            onPress={() => router.push('/catalogo' as any)}
          >
            <Text style={styles.btnSecondaryText}>Abrir Catálogo</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 20 : 50, paddingBottom: 20, backgroundColor: '#fff' },
  greeting: { fontSize: 24, fontWeight: 'bold', color: '#000', textTransform: 'uppercase' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  helpBtn: { backgroundColor: '#34C759', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  helpBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  
  btnPendientes: { backgroundColor: '#FF9500', padding: 15, borderRadius: 12, marginHorizontal: 20, marginTop: 15, flexDirection: 'row', alignItems: 'center', elevation: 3 },
  btnPendientesText: { color: '#fff', fontWeight: 'bold', fontSize: 13, flex: 1 },
  badge: { backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, marginRight: 10 },
  badgeText: { color: '#FF9500', fontWeight: 'bold' },

  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 15, justifyContent: 'space-between', marginTop: 15 },
  statCard: { width: '48%', backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#e0e0e0', elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statTitle: { fontSize: 12, fontWeight: 'bold', color: '#333' },
  statValueGreen: { fontSize: 20, fontWeight: 'bold', color: '#34C759' },
  arrowIcon: { fontSize: 16, color: '#999', fontWeight: 'bold' },
  badgeRed: { backgroundColor: '#FF3B30', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeRedText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  actionCard: { backgroundColor: '#fff', marginHorizontal: 15, borderRadius: 12, padding: 20, marginBottom: 15, borderWidth: 1, borderColor: '#e0e0e0', elevation: 1 },
  actionNumber: { position: 'absolute', top: 10, left: 10, fontSize: 12, color: '#aaa', fontWeight: 'bold' },
  actionTitle: { fontSize: 18, fontWeight: 'bold', color: '#000', marginBottom: 8, marginLeft: 10 },
  actionDesc: { fontSize: 14, color: '#555', marginBottom: 15, lineHeight: 20, marginLeft: 10 },
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  btnPrimary: { backgroundColor: '#34C759', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  btnSecondary: { backgroundColor: '#fff', paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  btnSecondaryText: { color: '#555', fontWeight: 'bold', fontSize: 14 }
});