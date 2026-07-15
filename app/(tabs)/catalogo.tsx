 //<script type="module" src="/_expo/static/js/web/entry-d165ef7c4b4deccf3f4efa1680e22873.js" defer></script>
// app/(tabs)/catalogo.tsx
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import localDb from '../../src/config/database';
import { db as firestore } from '../../src/config/firebase.config';
import { exportCatalogToExcel } from '../../src/utils/excelExporter';

import ProductCard from '../../src/components/ProductCard';
import { syncClientsToLocal, syncProductsToLocal, wipeEntireCatalogEverywhere } from '../../src/services/syncService';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useCartStore } from '../../src/store/useCartStore';
import { useClientStore } from '../../src/store/useClientStore';
import { importProductsFromExcel } from '../../src/utils/excelImporter';

type ListType = 'list1' | 'list2' | 'list3';

export default function CatalogoScreen() {
  const router = useRouter();
  
  const activeClient = useClientStore((state) => state.activeClient);
  const setActiveClient = useClientStore((state) => state.setActiveClient);
  
  const { businessId } = useAuthStore();
  
  const [activeList, setActiveList] = useState<ListType>('list1');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const cartItems = useCartStore((state) => state.items);
  const totalItems = cartItems.reduce((total, item) => total + item.quantity, 0);

  useEffect(() => {
    if (activeClient) setActiveList(activeClient.defaultList);
  }, [activeClient]);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'web') {
        if (!businessId) return;
        const q = query(collection(firestore, 'products'), where('businessId', '==', businessId));
        const snapshot = await getDocs(q);
        const webProds = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setProducts(webProds.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));
      } else {
        const localProds = await localDb.getAllAsync<any>('SELECT * FROM products ORDER BY name ASC');
        setProducts(localProds);
      }
    } catch (error) {
      console.error("Error cargando productos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadProducts(); }, [businessId]));

  const handleSync = async () => {
    if (Platform.OS === 'web') {
      window.alert("En la web los datos siempre están sincronizados.");
      await loadProducts();
      return;
    }
    Alert.alert("Sincronizando", "Descargando catálogo y clientes...");
    await syncProductsToLocal();
    await syncClientsToLocal();
    await loadProducts();
    Alert.alert("Éxito", "Sincronización total completada.");
  };

  const handleImportExcel = async () => {
    const result = await importProductsFromExcel();
    if (Platform.OS === 'web') window.alert(result.message);
    else Alert.alert(result.success ? "Éxito" : "Error", result.message);
    
    if (result.success) {
      if (Platform.OS !== 'web') await syncProductsToLocal();
      await loadProducts();
    }
  };

    const handleExportExcel = async () => {
      try {
        const result = await exportCatalogToExcel(products);
        if (Platform.OS === 'web') {
          window.alert(result.message);
        } else {
          Alert.alert(result.success ? "Éxito" : "Error", result.message);
        }
      } catch (error) {
        console.error("Error crítico exportando:", error);
        if (Platform.OS === 'web') window.alert("Hubo un error al exportar el archivo.");
        else Alert.alert("Error", "No se pudo generar el archivo.");
      }
    };

    const handleClearCatalog = async () => {
  if (Platform.OS === 'web') {
    const confirmado = window.confirm(
      "⚠️ Purga Completa\n\n¿Estás seguro de borrar TODOS los productos?"
    );

    if (confirmado) {
      const result = await wipeEntireCatalogEverywhere();

      window.alert(
        result.success
          ? "Éxito: " + result.message
          : "Error: " + result.message
      );

      if (result.success) {
        await loadProducts();
      }
    }
  } else {
    Alert.alert(
      "⚠️ Purga Completa",
      "¿Borrar TODOS los productos de la nube y del celular?",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Sí, borrar todo",
          style: "destructive",
          onPress: async () => {
            const result = await wipeEntireCatalogEverywhere();

            Alert.alert(
              result.success ? "Éxito" : "Error",
              result.message
            );

            if (result.success) {
              await loadProducts();
            }
          },
        },
      ]
    );
  }
};

const handleDeleteSingleProduct = async (product: any) => {
  const executeDelete = async () => {
    try {
      if (Platform.OS === "web") {
        await deleteDoc(doc(firestore, "products", product.id));
      } else {
        try {
          await deleteDoc(doc(firestore, "products", product.id));
        } catch {}

        await localDb.runAsync(
          "DELETE FROM products WHERE id = ?",
          [product.id]
        );
      }

      await loadProducts();
    } catch (error) {
      if (Platform.OS === "web") {
        window.alert("No se pudo eliminar el producto.");
      } else {
        Alert.alert("Error", "No se pudo eliminar el producto.");
      }
    }
  };

  if (Platform.OS === "web") {
    if (window.confirm(`¿Eliminar "${product.name}" del catálogo?`)) {
      await executeDelete();
    }
  } else {
    Alert.alert(
      "Eliminar producto",
      `¿Eliminar "${product.name}" del catálogo?`,
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: executeDelete,
        },
      ]
    );
  }
};

const handleToggleHidden = async (product: any) => {
  const newValue = product.isHidden ? 0 : 1;

  try {
    if (Platform.OS === "web") {
      const productRef = doc(firestore, "products", product.id);
      await setDoc(productRef, { isHidden: !!newValue }, { merge: true });
    } else {
      await localDb.runAsync(
        "UPDATE products SET isHidden = ? WHERE id = ?",
        [newValue, product.id]
      );

      const productRef = doc(firestore, "products", product.id);
      await setDoc(productRef, { isHidden: !!newValue }, { merge: true });
    }

    await loadProducts();
  } catch (error) {
    if (Platform.OS === "web") {
      window.alert("No se pudo cambiar el estado.");
    } else {
      Alert.alert("Error", "No se pudo cambiar el estado del producto.");
    }
  }
};

  const handleCloseClient = () => {
    if (Platform.OS === 'web') {
      const confirmado = window.confirm("¿Cerrar sesión del cliente? Se vaciará el carrito actual.");
      if (confirmado) {
        setActiveClient(null as any);
        useCartStore.setState({ items: [] });
        setActiveList('list1');
      }
    } else {
      Alert.alert("Cerrar Cliente", "¿Cerrar sesión del cliente? Se vaciará el carrito actual.", [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, cerrar",
          style: "destructive",
          onPress: () => {
            setActiveClient(null as any);
            useCartStore.setState({ items: [] });
            setActiveList('list1');
          }
        }
      ]);
    }
  };

  const categories = useMemo(() => {
    const uniqueCats = new Set(products.map(p => p.abcCategory || 'General'));
    const sortedCats = Array.from(uniqueCats).sort((a, b) => a.localeCompare(b));
    return ['Todas', ...sortedCats];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = (product.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (product.internalCode || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'Todas' || (product.abcCategory || 'General') === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View style={styles.titleRow}>
          
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Catálogo</Text>
            {activeClient ? (
              <View style={styles.activeClientBadge}>
                <Text style={styles.clientSubtitle}>🛒 {activeClient.businessName}</Text>
                <TouchableOpacity onPress={handleCloseClient} style={styles.closeClientBtn}>
                  <Text style={styles.closeClientText}>✖ CERRAR</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.clientSubtitle}>🛒 Venta General</Text>
            )}
          </View>

          <TouchableOpacity style={styles.cartBadge} onPress={() => router.push('/carrito' as any)}>
            <Text style={styles.cartBadgeText}>🛒 ({totalItems})</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.headerActions}>
            <TouchableOpacity onPress={() => router.push('/editar-producto' as any)} style={[styles.actionBtn, { backgroundColor: '#8E8E93' }]}>
              <Text style={styles.actionText}>➕ Nuevo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleClearCatalog} style={[styles.actionBtn, { backgroundColor: '#FF3B30' }]}>
              <Text style={styles.actionText}>🗑️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleExportExcel} style={[styles.actionBtn, { backgroundColor: '#007AFF' }]}>
              <Text style={styles.actionText}>⬇️ Bajar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleImportExcel} style={[styles.actionBtn, styles.excelBtn]}>
              <Text style={styles.actionText}>⬆️ Subir</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSync} style={[styles.actionBtn, styles.syncBtn]}>
              <Text style={styles.actionText}>🔄 Sync</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput style={styles.searchInput} placeholder="Buscar producto..." placeholderTextColor="#999" value={searchQuery} onChangeText={setSearchQuery} autoCorrect={false} />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}><Text style={styles.clearSearchText}>✖</Text></TouchableOpacity>
        )}
      </View>

      {categories.length > 1 && (
        <View style={styles.categoriesWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesScroll}>
            {categories.map(cat => (
              <TouchableOpacity key={cat} onPress={() => setSelectedCategory(cat)} style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}>
                <Text style={[styles.categoryPillText, selectedCategory === cat && styles.categoryPillTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.listSelector}>
        {(['list1', 'list2', 'list3'] as ListType[]).map((list) => (
          <TouchableOpacity key={list} style={[styles.listTab, activeList === list && styles.listTabActive]} onPress={() => setActiveList(list)}>
            <Text style={[styles.listTabText, activeList === list && styles.listTabTextActive]}>{list.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}><ActivityIndicator size="large" color="#007AFF" /></View>
      ) : products.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No hay productos.</Text>
          <Text style={styles.emptySubText}>Tocá el ➕ para crear uno o subí un Excel.</Text>
        </View>
      ) : filteredProducts.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No se encontraron resultados.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          key={2}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={({ item }) => {
  const isAdded = cartItems.some(
    cartItem => cartItem.product.id === item.id
  );

  return (
    <ProductCard
      product={item}
      activeList={activeList}
      isAdded={isAdded}
      onToggleHidden={() => handleToggleHidden(item)}
      onDelete={() => handleDeleteSingleProduct(item)}
    />
  );
}}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: Platform.OS === 'web' ? 10 : 50 },
  headerContainer: { width: '100%', marginBottom: 15 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  titleContainer: { flex: 1, marginRight: 10 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  activeClientBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap' },
  clientSubtitle: { fontSize: 13, color: '#007AFF', fontWeight: '600' },
  closeClientBtn: { marginLeft: 10, backgroundColor: '#FF3B30', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, elevation: 2 },
  closeClientText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  cartBadge: { backgroundColor: '#007AFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  cartBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  actionsRow: { width: '100%' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingRight: 40 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, justifyContent: 'center' },
  excelBtn: { backgroundColor: '#34C759' },
  syncBtn: { backgroundColor: '#FF9500' },
  actionText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0e0e0', marginHorizontal: 20, borderRadius: 10, paddingHorizontal: 12, marginBottom: 10, height: 44 },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#333' },
  clearSearchBtn: { padding: 4 },
  clearSearchText: { color: '#888', fontSize: 16, fontWeight: 'bold' },
  categoriesWrapper: { marginBottom: 12 },
  categoriesScroll: { paddingHorizontal: 20, gap: 8 },
  categoryPill: { backgroundColor: '#e0e0e0', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  categoryPillActive: { backgroundColor: '#333' },
  categoryPillText: { fontSize: 13, color: '#555', fontWeight: '600' },
  categoryPillTextActive: { color: '#fff' },
  listSelector: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 15, gap: 10 },
  listTab: { flex: 1, paddingVertical: 8, backgroundColor: '#e0e0e0', borderRadius: 8, alignItems: 'center' },
  listTabActive: { backgroundColor: '#34C759' },
  listTabText: { fontWeight: 'bold', color: '#666', fontSize: 12 },
  listTabTextActive: { color: '#fff' },
  columnWrapper: { justifyContent: 'space-between', paddingHorizontal: 16 },
  listContent: { paddingBottom: 100 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 16, fontWeight: 'bold', color: '#666', marginBottom: 6 },
  emptySubText: { fontSize: 13, color: '#999', textAlign: 'center', lineHeight: 18 }
});