// app/carrito.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import localDb from '../src/config/database';

import { doc, setDoc } from 'firebase/firestore';
import { db as firestore } from '../src/config/firebase.config';

import { saveOrderLocally } from '../src/services/orderService';
import { useAuthStore } from '../src/store/useAuthStore';
import { useCartStore } from '../src/store/useCartStore';
import { useClientStore } from '../src/store/useClientStore';

export default function CarritoScreen() {
  const router = useRouter();
  const { items, removeItem, clearCart, getTotalPrice } = useCartStore();
  const activeClient = useClientStore((state) => state.activeClient);
  const currentBusinessId = useAuthStore((state) => state.businessId);

  const [nota, setNota] = useState('');
  const [discount, setDiscount] = useState('');
  
  const [isEditPriceModalVisible, setEditPriceModalVisible] = useState(false);
  const [itemToEditPrice, setItemToEditPrice] = useState<any>(null);
  const [customPriceInput, setCustomPriceInput] = useState('');
  
  // 👇 ESTADO PARA EL BLOQUEO ANTI-SPAM (DOBLE CLICK) 👇
  const [isSaving, setIsSaving] = useState(false);

  const cleanedDiscount = discount.replace(/\./g, '').replace(',', '.');
  const discountValue = parseFloat(cleanedDiscount) || 0;
  
  const subtotalSeguro = items.reduce((sum, item) => sum + (item.subtotal || item.unitPrice * item.quantity), 0);
  const finalTotal = Math.max(0, subtotalSeguro - discountValue); 

  const [editOrderId, setEditOrderId] = useState<string | null>(null);

  useEffect(() => {
    const checkEditMode = async () => {
      const id = await AsyncStorage.getItem('editOrderId');
      const notes = await AsyncStorage.getItem('editNotes');
      if (id) setEditOrderId(id);
      if (notes) setNota(notes);
    };
    checkEditMode();
  }, []);

  const handleCancelEdit = async () => {
    await AsyncStorage.removeItem('editOrderId');
    await AsyncStorage.removeItem('editNotes');
    setEditOrderId(null);
    clearCart();
    setDiscount('');
    router.replace('/pedidos' as any);
  };

  const handleConfirmCustomPrice = () => {
    const newPrice = parseFloat(customPriceInput.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(newPrice) && newPrice >= 0 && itemToEditPrice) {
      const updatedItems = items.map(i => {
        if (i.product.id === itemToEditPrice.product.id) {
          return { ...i, unitPrice: newPrice, subtotal: newPrice * i.quantity };
        }
        return i;
      });
      useCartStore.setState({ items: updatedItems });
    }
    setEditPriceModalVisible(false);
    setItemToEditPrice(null);
  };

  const openEditPriceModal = (item: any) => {
    setItemToEditPrice(item);
    setCustomPriceInput(item.unitPrice.toString());
    setEditPriceModalVisible(true);
  };

  const handleConfirmOrder = async () => {
    if (items.length === 0) return;
    if (isSaving) return; // 🛡️ EVITA EL DOBLE CLICK

    if (!activeClient) {
      if (Platform.OS === 'web') window.alert("No hay un cliente seleccionado para este pedido.");
      else Alert.alert("Error", "No hay un cliente seleccionado para este pedido.");
      return;
    }

    setIsSaving(true); // 🔒 BLOQUEAMOS EL BOTÓN

    let itemsToSave = [...items];
    if (discountValue > 0) {
      itemsToSave.push({
        product: {
          id: 'DESC-GLOBAL',
          internalCode: 'DESC',
          name: '🎁 DESCUENTO APLICADO',
          baseCost: 0,
          markups: { list1: 0, list2: 0, list3: 0 },
          abcCategory: 'Descuentos'
        } as any,
        quantity: 1,
        activeList: 'list1',
        unitPrice: -discountValue,
        subtotal: -discountValue
      });
    }

    if (editOrderId) {
      try {
        if (Platform.OS === 'web') {
          await setDoc(doc(firestore, 'orders', editOrderId), {
            total: finalTotal,
            items: JSON.stringify(itemsToSave),
            notes: nota,
            updatedAt: Date.now()
          }, { merge: true });
        } else {
          await localDb.runAsync(
            "UPDATE orders SET total = ?, items = ?, notes = ?, syncStatus = 'PENDING' WHERE id = ?",
            [finalTotal, JSON.stringify(itemsToSave), nota, editOrderId]
          );
        }
        
        await AsyncStorage.removeItem('editOrderId');
        await AsyncStorage.removeItem('editNotes');
        clearCart();
        setDiscount('');

        if (Platform.OS === 'web') {
          window.alert(`La modificación para ${activeClient.businessName} se guardó correctamente.`);
          router.replace('/pedidos' as any);
        } else {
          Alert.alert('¡Pedido Actualizado!', `La modificación para ${activeClient.businessName} se guardó correctamente.`, [
            { text: 'Ver boleta', onPress: () => router.replace('/pedidos' as any) }
          ]);
        }
      } catch (error) {
        if (Platform.OS === 'web') window.alert("No se pudo actualizar el pedido.");
        else Alert.alert("Error", "No se pudo actualizar el pedido.");
      } finally {
        setIsSaving(false); // 🔓 DESBLOQUEAMOS POR SI HAY ERROR
      }
    } else {
      try {
        if (Platform.OS === 'web') {
          const newOrderId = `ORD-${Date.now()}`;
          await setDoc(doc(firestore, 'orders', newOrderId), {
            id: newOrderId,
            clientId: activeClient.id,
            clientName: activeClient.businessName,
            total: finalTotal,
            items: JSON.stringify(itemsToSave),
            notes: nota,
            status: 'PENDIENTE',
            createdAt: Date.now(),
            businessId: currentBusinessId || 'preventistas' 
          });

          window.alert(`El pedido para ${activeClient.businessName} se guardó correctamente.`);
          clearCart();
          setDiscount('');
          router.replace('/pedidos' as any);
        } else {
          const result = await saveOrderLocally(activeClient, itemsToSave, finalTotal, nota);
          if (result.success) {
            Alert.alert('¡Pedido Guardado!', `El pedido para ${activeClient.businessName} se guardó en el celular.`, [
              { text: 'Ver boleta', onPress: () => {
                  clearCart();
                  setDiscount('');
                  router.replace('/pedidos' as any); 
              }}
            ]);
          } else {
            Alert.alert("Error", "No se pudo guardar el pedido en el celular.");
          }
        }
      } catch (error) {
        if (Platform.OS === 'web') window.alert("No se pudo guardar el pedido por un error de conexión.");
      } finally {
        setIsSaving(false); // 🔓 DESBLOQUEAMOS POR SI HAY ERROR
      }
    }
  };

  const handleEmptyCart = () => {
    if (Platform.OS === 'web') {
      const vaciar = window.confirm("¿Estás seguro de que querés eliminar todos los productos?");
      if (vaciar) {
        clearCart();
        AsyncStorage.removeItem('editOrderId');
        AsyncStorage.removeItem('editNotes');
        setEditOrderId(null);
        setNota('');
        setDiscount('');
      }
    } else {
      Alert.alert("Vaciar Carrito", "¿Estás seguro de que querés eliminar todos los productos?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, vaciar", style: "destructive", onPress: async () => {
            clearCart();
            await AsyncStorage.removeItem('editOrderId');
            await AsyncStorage.removeItem('editNotes');
            setEditOrderId(null);
            setNota('');
            setDiscount('');
          } 
        }
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/catalogo' as any)} disabled={isSaving}>
          <Text style={styles.backButton}>← Catálogo</Text>
        </TouchableOpacity>
        
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{editOrderId ? 'Editando Pedido' : 'Resumen del Pedido'}</Text>
          <Text style={styles.clientSubtitle}>{activeClient?.businessName || 'Sin Cliente'}</Text>
        </View>
        
        <TouchableOpacity onPress={handleEmptyCart} disabled={items.length === 0 || isSaving}>
          <Text style={[styles.emptyBtnText, (items.length === 0 || isSaving) && { opacity: 0.5 }]}>🗑️ Vaciar</Text>
        </TouchableOpacity>
      </View>

      {editOrderId && (
        <View style={styles.editBanner}>
          <Text style={styles.editBannerText}>⚠️ Modificando: {editOrderId.replace('ORD-', '')}</Text>
          <TouchableOpacity onPress={handleCancelEdit} disabled={isSaving}>
            <Text style={styles.editBannerCancel}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>El carrito está vacío.</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(item) => item.product.id}
            renderItem={({ item }) => {
              const isDiscountItem = item.product.id === 'DESC-GLOBAL';
              
              return (
                <View style={[styles.itemCard, isDiscountItem && { backgroundColor: '#fff3cd' }]}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.product.name}</Text>
                    {!isDiscountItem && (
                      <View style={styles.itemMetaRow}>
                        <Text style={styles.itemMeta}>
                          Cant: {item.quantity} x ${(item.unitPrice || 0).toLocaleString('es-AR')} ({(item.activeList || 'WEB').toUpperCase()})
                        </Text>
                        
                        <TouchableOpacity onPress={() => openEditPriceModal(item)} style={styles.editPriceBtn} disabled={isSaving}>
                          <Text style={styles.editPriceIcon}>✏️</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <View style={styles.itemActions}>
                    <Text style={[styles.itemSubtotal, isDiscountItem && { color: '#d9534f' }]}>
                      ${(item.subtotal || 0).toLocaleString('es-AR')}
                    </Text>
                    <TouchableOpacity onPress={() => removeItem(item.product.id)} disabled={isSaving}>
                      <Text style={styles.deleteText}>✖</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
            contentContainerStyle={styles.listContent}
            
            ListFooterComponent={
              <View>
                <TouchableOpacity 
                  style={styles.addMoreButton} 
                  onPress={() => router.push('/catalogo' as any)}
                  disabled={isSaving}
                >
                  <Text style={styles.addMoreButtonText}>➕ Agregar más productos</Text>
                </TouchableOpacity>

                <View style={{ marginTop: 20 }}>
                  <Text style={styles.noteLabel}>Notas / Comentarios (Opcional):</Text>
                  <TextInput 
                    style={styles.noteInput}
                    placeholder="Ej: Entregar por la tarde..."
                    placeholderTextColor="#999"
                    value={nota}
                    onChangeText={setNota}
                    multiline
                    editable={!isSaving}
                  />

                  <View style={styles.discountContainer}>
                    <Text style={styles.discountLabel}>Hacer un Descuento ($):</Text>
                    <TextInput 
                      style={styles.discountInput}
                      placeholder="Ej: 15000"
                      placeholderTextColor="#ccc"
                      keyboardType="numeric"
                      value={discount}
                      onChangeText={setDiscount}
                      editable={!isSaving}
                    />
                  </View>
                </View>
              </View>
            }
          />

          <View style={styles.footer}>
            <View style={styles.totalContainer}>
              <View>
                <Text style={styles.subtotalText}>Subtotal: ${subtotalSeguro.toLocaleString('es-AR')}</Text>
                {discountValue > 0 && (
                  <Text style={styles.discountText}>Descuento: -${discountValue.toLocaleString('es-AR')}</Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.totalLabel}>Total Final:</Text>
                <Text style={styles.totalPrice}>${finalTotal.toLocaleString('es-AR')}</Text>
              </View>
            </View>
            
            <TouchableOpacity 
              style={[
                styles.confirmButton, 
                editOrderId && { backgroundColor: '#FF9500' },
                isSaving && { backgroundColor: '#888' } // Color gris de bloqueo
              ]} 
              onPress={handleConfirmOrder}
              disabled={isSaving}
            >
              <Text style={styles.confirmButtonText}>
                {isSaving 
                  ? 'GUARDANDO...' 
                  : (editOrderId ? 'Actualizar Factura' : 'Confirmar y Guardar')}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Modal visible={isEditPriceModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalMenu}>
            <Text style={styles.modalMenuTitle}>Editar Precio Especial</Text>
            <Text style={styles.modalMenuSubtitle}>{itemToEditPrice?.product.name}</Text>
            
            <TextInput 
              style={styles.customPriceInput}
              keyboardType="numeric"
              placeholder="0"
              value={customPriceInput}
              onChangeText={setCustomPriceInput}
              autoFocus
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
              <TouchableOpacity style={[styles.modalMenuBtnAction, { backgroundColor: '#f5f5f5' }]} onPress={() => setEditPriceModalVisible(false)}>
                <Text style={{ color: '#555', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalMenuBtnAction, { backgroundColor: '#34C759' }]} onPress={handleConfirmCustomPrice}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Aplicar Precio</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: Platform.OS === 'web' ? 15 : 50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 15 },
  backButton: { fontSize: 16, color: '#007AFF', fontWeight: 'bold' },
  titleContainer: { alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  clientSubtitle: { fontSize: 13, color: '#007AFF', fontWeight: 'bold', marginTop: 2 },
  emptyBtnText: { color: '#FF3B30', fontSize: 14, fontWeight: 'bold' },
  editBanner: { backgroundColor: '#fff3cd', marginHorizontal: 20, padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#ffe69c' },
  editBannerText: { color: '#856404', fontWeight: 'bold', fontSize: 13 },
  editBannerCancel: { color: '#FF3B30', fontWeight: 'bold', fontSize: 13 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: '#999' },
  listContent: { paddingHorizontal: 20, paddingBottom: 15 },
  itemCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 1 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center' },
  itemMeta: { fontSize: 13, color: '#666' },
  editPriceBtn: { marginLeft: 10, backgroundColor: '#f0f0f0', padding: 4, borderRadius: 4 },
  editPriceIcon: { fontSize: 12 },
  itemActions: { alignItems: 'flex-end', gap: 8 },
  itemSubtotal: { fontSize: 16, fontWeight: 'bold', color: '#007AFF' },
  deleteText: { fontSize: 18, color: '#FF3B30' },
  addMoreButton: { backgroundColor: '#e6f4ea', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 5, borderWidth: 1, borderColor: '#a8dab5', borderStyle: 'dashed' },
  addMoreButtonText: { color: '#137333', fontWeight: 'bold', fontSize: 15 },
  
  footer: { backgroundColor: '#fff', padding: 15, borderTopWidth: 1, borderColor: '#eee' },
  noteLabel: { fontSize: 13, fontWeight: 'bold', color: '#555', marginBottom: 8 },
  noteInput: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, minHeight: 45, textAlignVertical: 'top', fontSize: 14, marginBottom: 15 },
  discountContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, backgroundColor: '#fff3cd', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ffe69c' },
  discountLabel: { fontSize: 14, fontWeight: 'bold', color: '#856404' },
  discountInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, width: 120, textAlign: 'right', fontSize: 16, color: '#d9534f', fontWeight: 'bold' },
  totalContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  subtotalText: { fontSize: 14, color: '#666', fontWeight: 'bold' },
  discountText: { fontSize: 14, color: '#d9534f', fontWeight: 'bold', marginTop: 2 },
  totalLabel: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  totalPrice: { fontSize: 24, fontWeight: 'bold', color: '#34C759' },
  confirmButton: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center' },
  confirmButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 } : {})
  },
  modalMenu: { backgroundColor: '#fff', padding: 20, borderRadius: 12, width: 300, elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10 },
  modalMenuTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', textAlign: 'center' },
  modalMenuSubtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 15 },
  customPriceInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 18, textAlign: 'center', fontWeight: 'bold', backgroundColor: '#f9f9f9', color: '#007AFF' },
  modalMenuBtnAction: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }
});