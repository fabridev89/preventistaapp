// app/crear-compra.tsx
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import localDb from '../src/config/database';

import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db as firestore } from '../src/config/firebase.config';
import { useAuthStore } from '../src/store/useAuthStore';

export default function CrearCompraScreen() {
  const router = useRouter();
  const dateStr = new Date().toLocaleDateString('es-AR');
  
  const { businessId } = useAuthStore();

  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');

  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  
  const [items, setItems] = useState<any[]>([]);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  
  const [tempSelectedProducts, setTempSelectedProducts] = useState<any[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [manualTotal, setManualTotal] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        if (Platform.OS === 'web') {
          if (!businessId) return;
          
          const prodsSnap = await getDocs(query(collection(firestore, 'products'), where('businessId', '==', businessId)));
          const prods = prodsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setCatalog(prods.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));

          const supsSnap = await getDocs(query(collection(firestore, 'suppliers'), where('businessId', '==', businessId)));
          const sups = supsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setSuppliersList(sups.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));
        } else {
          const prods = await localDb.getAllAsync<any>('SELECT * FROM products ORDER BY name ASC');
          setCatalog(prods);

          const sups = await localDb.getAllAsync<any>('SELECT * FROM suppliers ORDER BY name ASC');
          setSuppliersList(sups);
        }
      } catch (error) {
        console.error("Error cargando base de datos:", error);
      }
    };
    loadData();
  }, [businessId]);

  const handleSelectSupplier = (supplier: any) => {
    setSelectedSupplier(supplier);
    setIsSupplierModalOpen(false);
    setSupplierSearch('');
  };

  const handleCreateSupplier = async () => {
    if (!supplierSearch.trim()) return;
    
    const newId = `SUP-${Date.now()}`;
    const newSupplier = { id: newId, name: supplierSearch.toUpperCase() };

    try {
      if (Platform.OS === 'web') {
        if (!businessId) return;
        await setDoc(doc(firestore, 'suppliers', newId), {
          id: newId,
          businessId: businessId,
          name: newSupplier.name,
          createdAt: Date.now()
        });
      } else {
        await localDb.runAsync(
          `INSERT INTO suppliers (id, name, createdAt, syncStatus) VALUES (?, ?, ?, ?)`,
          [newId, newSupplier.name, Date.now(), 'PENDING']
        );
      }
      setSuppliersList([...suppliersList, newSupplier]);
      handleSelectSupplier(newSupplier);
    } catch (error) {
      console.error("Error creando proveedor:", error);
      if (Platform.OS === 'web') window.alert("No se pudo crear el proveedor.");
      else Alert.alert("Error", "No se pudo crear el proveedor.");
    }
  };

  const filteredSuppliers = suppliersList.filter(s => 
    (s.name || '').toLowerCase().includes(supplierSearch.toLowerCase())
  );
  
  const showCreateSupplierBtn = supplierSearch.trim().length > 0 && 
    !suppliersList.some(s => (s.name || '').toLowerCase() === supplierSearch.trim().toLowerCase());

  const openCatalogModal = () => {
    setTempSelectedProducts(items.map(i => i.product));
    setCatalogSearch('');
    setIsCatalogModalOpen(true);
  };

  const toggleProductSelection = (product: any) => {
    const isSelected = tempSelectedProducts.some(p => p.id === product.id);
    if (isSelected) {
      setTempSelectedProducts(tempSelectedProducts.filter(p => p.id !== product.id));
    } else {
      setTempSelectedProducts([...tempSelectedProducts, product]);
    }
  };

  const confirmProductSelection = () => {
    const newItems = tempSelectedProducts.map(prod => {
      const existingItem = items.find(i => i.product.id === prod.id);
      if (existingItem) {
        return existingItem; 
      }
      return { product: prod, cost: prod.baseCost.toString(), quantity: 1 };
    });

    setItems(newItems);
    setIsCatalogModalOpen(false);
  };

  const handleRemoveItem = (productId: string) => {
    setItems(items.filter(i => i.product.id !== productId));
  };

  const updateItemQty = (productId: string, delta: number) => {
    setItems(items.map(item => {
      if (item.product.id === productId) {
        return { ...item, quantity: Math.max(1, item.quantity + delta) };
      }
      return item;
    }));
  };

  const setExactQty = (productId: string, exactQty: string) => {
    const numericQty = parseInt(exactQty.replace(/[^0-9]/g, ''), 10) || 0;
    setItems(items.map(item => {
      if (item.product.id === productId) {
        return { ...item, quantity: numericQty };
      }
      return item;
    }));
  };

  const updateItemCost = (productId: string, newCost: string) => {
    setItems(items.map(item => 
      item.product.id === productId ? { ...item, cost: newCost } : item
    ));
  };

  const getSubtotal = () => {
    return items.reduce((sum, item) => {
      const numericCost = parseFloat(item.cost.replace(',', '.') || '0');
      return sum + (numericCost * item.quantity);
    }, 0);
  };

  const subtotal = getSubtotal();
  const totalFinal = manualTotal !== '' ? parseFloat(manualTotal.replace(',', '.')) : subtotal;
  const calculatedDiscount = Math.max(0, subtotal - totalFinal);

  const handleSaveOrder = async () => {
    if (isSaving) return;

    if (!selectedSupplier) {
      if (Platform.OS === 'web') window.alert("Debes seleccionar un proveedor.");
      else Alert.alert("Error", "Debes seleccionar un proveedor.");
      return;
    }
    if (items.length === 0) {
      if (Platform.OS === 'web') window.alert("Debes agregar al menos un producto a la orden.");
      else Alert.alert("Error", "Debes agregar al menos un producto a la orden.");
      return;
    }
    if (items.some(item => item.quantity <= 0)) {
      if (Platform.OS === 'web') window.alert("Verificá las cantidades. No puede haber productos en 0.");
      else Alert.alert("Error", "Verificá las cantidades. No puede haber productos en 0.");
      return;
    }

    setIsSaving(true);

    const poId = `PO-${Date.now()}`;
    const status = 'PENDIENTE'; // 👇 Todas nacen pendientes hasta que las marques en ver-compra

    try {
      if (Platform.OS === 'web') {
        if (!businessId) return;

        await setDoc(doc(firestore, 'purchase_orders', poId), {
          id: poId,
          businessId: businessId,
          supplierId: selectedSupplier.id,
          supplierName: selectedSupplier.name,
          total: totalFinal, 
          items: JSON.stringify(items),
          paymentMethod,
          status,
          createdAt: Date.now(),
          discount: calculatedDiscount 
        });

        window.alert("¡Éxito! Orden guardada correctamente.");
        router.back(); 
        
      } else {
        try { await localDb.runAsync(`ALTER TABLE purchase_orders ADD COLUMN discount REAL DEFAULT 0;`); } catch (e) {}

        await localDb.runAsync(
          `INSERT INTO purchase_orders (id, supplierId, supplierName, total, items, paymentMethod, status, createdAt, syncStatus, discount) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [poId, selectedSupplier.id, selectedSupplier.name, totalFinal, JSON.stringify(items), paymentMethod, status, Date.now(), 'PENDING', calculatedDiscount]
        );

        Alert.alert("¡Éxito!", "Orden de compra creada correctamente. Recuerda marcarla como recibida para sumar el stock.", [
          { text: "OK", onPress: () => router.back() }
        ]);
      }
    } catch (error) {
      console.error("Error guardando orden:", error);
      if (Platform.OS === 'web') window.alert("No se pudo guardar la orden.");
      else Alert.alert("Error", "No se pudo guardar la orden.");
    } finally {
      setIsSaving(false); 
    }
  };

  const filteredCatalog = catalog.filter(p => 
    (p.name || '').toLowerCase().includes(catalogSearch.toLowerCase()) || 
    (p.internalCode || '').toLowerCase().includes(catalogSearch.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} disabled={isSaving}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ORDEN DE COMPRA</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
        
        <View style={styles.card}>
          <TextInput style={styles.inputReadOnly} value={dateStr} editable={false} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Proveedor</Text>
          <TouchableOpacity style={styles.supplierSelectorBtn} onPress={() => setIsSupplierModalOpen(true)}>
            <Text style={styles.inputIcon}>👤</Text>
            <Text style={[styles.supplierSelectorText, !selectedSupplier && { color: '#999' }]}>
              {selectedSupplier ? selectedSupplier.name : 'Toca para seleccionar proveedor...'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Productos ({items.length})</Text>
          <TouchableOpacity style={styles.btnMisProductos} onPress={openCatalogModal}>
            <Text style={styles.btnMisProductosText}>+ BUSCAR PRODUCTOS</Text>
          </TouchableOpacity>

          {items.map((item) => (
            <View key={item.product.id} style={styles.itemRow}>
              <View style={styles.itemInfoBox}>
                <Text style={styles.itemName}>{item.product.name}</Text>
                <Text style={styles.itemStockText}>📦 Stock en sistema: {item.product.stock || 0}</Text>
                
                <View style={styles.itemControls}>
                  <View style={styles.costBox}>
                    <Text style={styles.costLabel}>Costo :</Text>
                    <TextInput 
                      style={styles.costInput} 
                      value={item.cost} 
                      onChangeText={(val) => updateItemCost(item.product.id, val)}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={styles.qtyBox}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateItemQty(item.product.id, -1)}>
                      <Text style={styles.qtyBtnText}>-</Text>
                    </TouchableOpacity>
                    
                    <TextInput
                      style={styles.qtyInput}
                      value={item.quantity === 0 ? '' : item.quantity.toString()}
                      onChangeText={(val) => setExactQty(item.product.id, val)}
                      keyboardType="numeric"
                      selectTextOnFocus={true}
                    />
                    
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateItemQty(item.product.id, 1)}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.btnDelete} onPress={() => handleRemoveItem(item.product.id)}>
                <Text style={styles.btnDeleteText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitleLine}>Forma de pago</Text>
            <TouchableOpacity onPress={() => setPaymentMethod(paymentMethod === 'EFECTIVO' ? 'TRANSFERENCIA' : 'EFECTIVO')}>
              <Text style={styles.paymentSelector}>{paymentMethod} ▼</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Totales</Text>
          
          <View style={styles.rowBetween}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalLabel}>$ {subtotal.toLocaleString('es-AR')}</Text>
          </View>
          
          <View style={[styles.rowBetween, { marginTop: 10, marginBottom: 5 }]}>
            <Text style={styles.discountLabelInput}>Pago Real (Opcional)</Text>
            <View style={styles.discountInputWrapper}>
              <Text style={styles.discountCurrency}>$</Text>
              <TextInput 
                style={styles.discountInput}
                value={manualTotal}
                onChangeText={setManualTotal}
                keyboardType="numeric"
                placeholder={subtotal.toString()}
                placeholderTextColor="#ffb3b0"
              />
            </View>
          </View>

          {calculatedDiscount > 0 && (
            <View style={[styles.rowBetween, { marginBottom: 10, marginTop: 5 }]}>
              <Text style={{ fontSize: 13, color: '#ff3b30' }}>Descuento automático:</Text>
              <Text style={{ fontSize: 14, color: '#ff3b30', fontWeight: 'bold' }}>- $ {calculatedDiscount.toLocaleString('es-AR')}</Text>
            </View>
          )}

          <View style={styles.thickDivider} />

          <View style={styles.rowBetween}>
            <Text style={styles.totalLabelFinal}>Total Final</Text>
            <Text style={styles.totalLabelFinal}>$ {totalFinal.toLocaleString('es-AR')}</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.btnGuardar, {backgroundColor: isSaving ? '#888' : '#34C759'}]} 
          onPress={handleSaveOrder}
          disabled={isSaving}
        >
          <Text style={styles.btnGuardarText}>{isSaving ? 'GUARDANDO...' : 'GUARDAR ORDEN (SIN SUMAR STOCK)'}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* MODAL 1: PROVEEDORES */}
      <Modal visible={isSupplierModalOpen} animationType="slide" onRequestClose={() => setIsSupplierModalOpen(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Buscar Proveedor</Text>
            <TouchableOpacity onPress={() => setIsSupplierModalOpen(false)}><Text style={styles.closeModalText}>Cerrar</Text></TouchableOpacity>
          </View>
          
          <TextInput 
            style={styles.modalSearch} 
            placeholder="Escribí para buscar o crear..." 
            value={supplierSearch}
            onChangeText={setSupplierSearch}
          />

          {showCreateSupplierBtn && (
            <TouchableOpacity style={styles.btnCreateSupplier} onPress={handleCreateSupplier}>
              <Text style={styles.btnCreateSupplierText}>+ Crear proveedor: "{supplierSearch.toUpperCase()}"</Text>
            </TouchableOpacity>
          )}

          <FlatList 
            data={filteredSuppliers}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.modalItem} onPress={() => handleSelectSupplier(item)}>
                <Text style={styles.modalItemName}>👤 {item.name}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !showCreateSupplierBtn ? <Text style={{textAlign: 'center', marginTop: 20, color: '#888'}}>No hay proveedores registrados.</Text> : null
            }
          />
        </View>
      </Modal>

      {/* MODAL 2: CATÁLOGO DE SELECCIÓN MÚLTIPLE */}
      <Modal visible={isCatalogModalOpen} animationType="slide" onRequestClose={() => setIsCatalogModalOpen(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccionar Productos</Text>
            <TouchableOpacity onPress={() => setIsCatalogModalOpen(false)}><Text style={styles.closeModalText}>Cancelar</Text></TouchableOpacity>
          </View>
          
          <TextInput 
            style={styles.modalSearch} 
            placeholder="Buscar por nombre o código..." 
            value={catalogSearch}
            onChangeText={setCatalogSearch}
          />

          <FlatList 
            data={filteredCatalog}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 100 }}
            renderItem={({ item }) => {
              const isSelected = tempSelectedProducts.some(p => p.id === item.id);
              return (
                <TouchableOpacity 
                  style={[styles.modalItem, isSelected && styles.modalItemActive]} 
                  onPress={() => toggleProductSelection(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalItemCode}>{item.internalCode}</Text>
                    <Text style={[styles.modalItemName, isSelected && { color: '#135C58' }]}>{item.name}</Text>
                    <Text style={styles.modalItemCost}>Costo actual: ${item.baseCost}</Text>
                    <Text style={styles.modalItemStock}>📦 Stock actual: {item.stock || 0}</Text>
                  </View>
                  {isSelected && (
                    <View style={styles.checkCircle}>
                      <Text style={styles.checkCircleText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            }}
          />

          <View style={styles.floatingConfirmContainer}>
            <TouchableOpacity style={styles.btnConfirmSelection} onPress={confirmProductSelection}>
              <Text style={styles.btnConfirmSelectionText}>
                CONFIRMAR ({tempSelectedProducts.length}) PRODUCTOS
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e9ecef' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#135C58', paddingTop: Platform.OS === 'web' ? 20 : 50, paddingBottom: 15, paddingHorizontal: 15 },
  backBtn: { padding: 5 },
  backIcon: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  scrollArea: { padding: 15 },
  card: { backgroundColor: '#fff', borderRadius: 6, padding: 15, marginBottom: 15, elevation: 1, borderWidth: 1, borderColor: '#e0e0e0' },
  cardTitle: { fontSize: 16, color: '#333', marginBottom: 10, fontWeight: 'bold' },
  cardTitleLine: { fontSize: 16, color: '#999' },
  inputReadOnly: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 4, padding: 10, color: '#555' },
  supplierSelectorBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 4, padding: 15, borderWidth: 1, borderColor: '#ddd' },
  inputIcon: { marginRight: 10, fontSize: 18 },
  supplierSelectorText: { flex: 1, color: '#333', fontSize: 15, fontWeight: 'bold' },
  btnMisProductos: { backgroundColor: '#135C58', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15, paddingHorizontal: 20 },
  btnMisProductosText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  itemRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 15, marginTop: 5 },
  itemInfoBox: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  itemStockText: { fontSize: 12, color: '#007AFF', fontWeight: '600', marginBottom: 10 },
  itemControls: { flexDirection: 'row', alignItems: 'center', gap: 15, flexWrap: 'wrap' },
  costBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  costLabel: { color: '#666', fontSize: 14, marginRight: 5 },
  costInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 4, width: 75, paddingVertical: 4, paddingHorizontal: 8, textAlign: 'center', fontSize: 14, fontWeight: 'bold' },
  qtyBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 6, borderWidth: 1, borderColor: '#ddd' },
  qtyBtn: { width: 35, height: 35, justifyContent: 'center', alignItems: 'center' },
  qtyBtnText: { fontSize: 20, color: '#555', fontWeight: 'bold' },
  qtyInput: { width: 50, textAlign: 'center', fontSize: 16, fontWeight: 'bold', color: '#333', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', height: 35 },
  btnDelete: { backgroundColor: '#FF3B30', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 10, elevation: 2 },
  btnDeleteText: { color: '#fff', fontSize: 18 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 5 },
  paymentSelector: { fontSize: 15, color: '#555', fontWeight: 'bold' },
  totalLabel: { fontSize: 15, color: '#666' },
  totalLabelFinal: { fontSize: 20, color: '#135C58', fontWeight: '900', marginTop: 5 },
  thickDivider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  discountLabelInput: { fontSize: 15, color: '#ff3b30', fontWeight: 'bold' },
  discountInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebe9', borderWidth: 1, borderColor: '#ffc1bd', borderRadius: 6, paddingHorizontal: 10 },
  discountCurrency: { fontSize: 16, color: '#ff3b30', fontWeight: 'bold', marginRight: 5 },
  discountInput: { width: 80, paddingVertical: 8, fontSize: 16, color: '#ff3b30', fontWeight: 'bold', textAlign: 'right' },
  btnGuardar: { paddingVertical: 18, borderRadius: 10, alignItems: 'center', marginTop: 10, elevation: 3, marginBottom: 20 },
  btnGuardarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: '#135C58', alignItems: 'center', paddingTop: Platform.OS === 'web' ? 20 : 50 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  closeModalText: { color: '#fff', fontSize: 16 },
  modalSearch: { margin: 15, backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  modalItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', alignItems: 'center' },
  modalItemActive: { backgroundColor: '#e6f7eb', borderColor: '#34C759', borderLeftWidth: 4 },
  modalItemCode: { fontSize: 11, color: '#888', fontWeight: 'bold' },
  modalItemName: { fontSize: 16, color: '#333', fontWeight: '600' },
  modalItemCost: { fontSize: 13, color: '#2ecc71', marginTop: 4, fontWeight: 'bold' },
  modalItemStock: { fontSize: 12, color: '#007AFF', fontWeight: '600', marginTop: 3 },
  checkCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#34C759', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  checkCircleText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnCreateSupplier: { marginHorizontal: 15, marginBottom: 15, backgroundColor: '#e6f7eb', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#a7e8b6' },
  btnCreateSupplierText: { color: '#135C58', fontWeight: 'bold', textAlign: 'center' },
  floatingConfirmContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 15, borderTopWidth: 1, borderTopColor: '#eee', elevation: 10 },
  btnConfirmSelection: { backgroundColor: '#135C58', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
  btnConfirmSelectionText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});