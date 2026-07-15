// app/(tabs)/pedidos.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import localDb from '../../src/config/database';
import { db as firestore } from '../../src/config/firebase.config';
import { downloadWebOrders, syncPendingOrders } from '../../src/services/orderService';
import { wipeAllOrdersEverywhere } from '../../src/services/syncService';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useCartStore } from '../../src/store/useCartStore';
import { useClientStore } from '../../src/store/useClientStore';

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

export default function PedidosScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  
  const [actionMenuOrder, setActionMenuOrder] = useState<any>(null);

  const currentBusinessId = useAuthStore((state) => state.businessId);
  const setActiveClient = useClientStore((state) => state.setActiveClient);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'web') {
        if (!currentBusinessId) return;
        const q = query(collection(firestore, 'orders'), where('businessId', '==', currentBusinessId), orderBy('createdAt', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        const webOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        webOrders.sort((a: any, b: any) => b.createdAt - a.createdAt); 
        setOrders(webOrders);
      } else {
        const result = await localDb.getAllAsync<any>('SELECT * FROM orders ORDER BY createdAt DESC');
        setOrders(result);
      }
    } catch (error) {
      console.error("Error cargando historial de pedidos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadOrders(); }, [currentBusinessId]));

  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!currentBusinessId || Platform.OS === 'web') return; 

    const q = query(collection(firestore, 'orders'), where('businessId', '==', currentBusinessId), orderBy('createdAt', 'desc'), limit(50));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (isFirstLoad.current) { isFirstLoad.current = false; return; }
      let hayPedidoNuevoWeb = false;
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && change.doc.data().clientId === 'WEB-CLIENT') hayPedidoNuevoWeb = true;
      });
      if (hayPedidoNuevoWeb) {
        await downloadWebOrders(); await loadOrders(); 
        Alert.alert("🛒 ¡NUEVO PEDIDO WEB!", "Acaba de ingresar un pedido desde el catálogo online.");
      }
    });

    return () => unsubscribe(); 
  }, [currentBusinessId]); 

  const handleSyncOrders = async () => {
    if (Platform.OS === 'web') { window.alert("En la web los pedidos siempre están sincronizados."); await loadOrders(); return; }
    setIsSyncing(true);
    const pushResult = await syncPendingOrders();
    const pullResult = await downloadWebOrders();
    setIsSyncing(false);
    Alert.alert("Sincronización Completa", `${pushResult.message}\n${pullResult.message}`);
    loadOrders(); 
  };

  // 👇 LÓGICA DEL TACHITO ACTUALIZADA: DEVUELVE STOCK SI ESTABA DESPACHADO O ENTREGADO 👇
  const handleDeleteOrder = async (order: any) => {
    const processDeletion = async () => {
      try {
        // 1. DEVOLVER EL STOCK SI YA SE HABÍA DESCONTADO
        if (order.status === 'DESPACHADO' || order.status === 'ENTREGADO') {
          const parsedItems = safeParseItems(order.items);
          if (Platform.OS === 'web') {
            for (const item of parsedItems) {
              if (item.product && item.product.id) {
                await updateDoc(doc(firestore, 'products', item.product.id), {
                  stock: increment(item.quantity),
                  updatedAt: Date.now()
                }).catch(e => console.log("Error al devolver stock web:", e));
              }
            }
          } else {
            for (const item of parsedItems) {
              if (item.product && item.product.id) {
                await localDb.runAsync(
                  `UPDATE products SET stock = COALESCE(stock, 0) + ?, updatedAt = ?, syncStatus = 'PENDING' WHERE id = ?`,
                  [item.quantity, Date.now(), item.product.id]
                ).catch(e => console.log("Error al devolver stock local:", e));
              }
            }
          }
        }

        // 2. BORRAR EL PEDIDO DEFINITIVAMENTE
        if (Platform.OS === 'web') {
          await deleteDoc(doc(firestore, 'orders', order.id));
        } else {
          await deleteDoc(doc(firestore, 'orders', order.id)).catch(e => console.log("Nube no disponible al borrar"));
          await localDb.runAsync('DELETE FROM orders WHERE id = ?', [order.id]);
        }
        
        loadOrders();
        
        const returnMsg = (order.status === 'DESPACHADO' || order.status === 'ENTREGADO') ? "\nEl stock reservado volvió al catálogo." : "";
        if (Platform.OS === 'web') window.alert("Pedido eliminado." + returnMsg);
        else Alert.alert("Éxito", "Pedido eliminado." + returnMsg);
        
      } catch (error) {
        if (Platform.OS === 'web') window.alert("Error: No se pudo borrar el pedido.");
        else Alert.alert("Error", "No se pudo borrar el pedido.");
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm("🗑️ ¿Estás seguro de borrar este pedido? Si ya estaba despachado, el stock reservado volverá al catálogo.")) {
        processDeletion();
      }
    } else {
      Alert.alert(
        "Eliminar Pedido", 
        "¿Borrar este pedido? Si ya estaba despachado, el stock reservado volverá al catálogo.", 
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Sí, eliminar", style: "destructive", onPress: processDeletion }
        ]
      );
    }
  };

  const handleWipeAllOrders = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm("⚠️ ¿Estás seguro de borrar TODOS los pedidos de manera definitiva?")) {
        const result = await wipeAllOrdersEverywhere(); window.alert(result.success ? "Éxito: " + result.message : "Error: " + result.message);
        if (result.success) await loadOrders();
      }
    } else {
      Alert.alert("⚠️ Purga Completa", "¿Borrar TODOS los pedidos de manera definitiva?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, borrar todo", style: "destructive", onPress: async () => {
            const result = await wipeAllOrdersEverywhere(); Alert.alert(result.success ? "Éxito" : "Error", result.message);
            if (result.success) await loadOrders();
          }
        }
      ]);
    }
  };

  const handleEditOrder = async (order: any) => {
    try {
      let clientData = { id: order.clientId, businessName: order.clientName, defaultList: 'list1' };

      if (Platform.OS === 'web') {
        try {
          const clientSnap = await getDoc(doc(firestore, 'clients', order.clientId));
          if (clientSnap.exists()) {
            clientData = { id: clientSnap.id, ...clientSnap.data() } as any;
          }
        } catch (e) {
          console.log("No se pudo obtener cliente extra de web, usando datos básicos.");
        }
      } else {
        try {
          const clientslist = await localDb.getAllAsync<any>('SELECT * FROM clients WHERE id = ?', [order.clientId]);
          if (clientslist && clientslist.length > 0) clientData = clientslist[0];
        } catch (e) {
          console.log("No se pudo obtener client local, usando datos básicos.");
        }
      }

      setActiveClient(clientData as any);
      
      const parsedItems = safeParseItems(order.items);
      useCartStore.setState({ items: parsedItems });
      
      await AsyncStorage.setItem('editOrderId', order.id);
      await AsyncStorage.setItem('editNotes', order.notes || '');
      router.push('/carrito' as any);
    } catch (error) { 
      if (Platform.OS === 'web') window.alert("No se pudo cargar el pedido para editar.");
      else Alert.alert("Error", "No se pudo cargar el pedido para editar."); 
    }
  };

  const handleWhatsApp = (order: any) => {
    const parsedItems = safeParseItems(order.items);
    let mensaje = `🧾 *NUEVO PEDIDO*\n👤 *Cliente:* ${order.clientName}\n🔢 *Código:* ${order.id.replace('ORD-', '')}\n\n*Detalle:*\n`;
    parsedItems.forEach((cartItem: any) => { if (cartItem && cartItem.product) mensaje += `▪️ ${cartItem.quantity}x ${cartItem.product.name} ($${cartItem.subtotal.toLocaleString('es-AR')})\n`; });
    if (order.notes) mensaje += `\n📌 *Nota:* ${order.notes}\n`;
    mensaje += `\n💰 *TOTAL FINAL: $${order.total.toLocaleString('es-AR')}*`;

    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(mensaje)}`).catch(() => { 
      if(Platform.OS === 'web') window.alert("No se pudo abrir WhatsApp."); else Alert.alert("Error", "No se pudo abrir WhatsApp."); 
    });
  };

  const handlePrintTicket = async (order: any) => {
    const parsedItems = safeParseItems(order.items);
    const date = new Date(order.createdAt).toLocaleString('es-AR');
    
    let clientAddress = 'No especificada';
    let clientCode = order.clientId || 'S/C';

    try {
      if (Platform.OS === 'web') {
        const clientSnap = await getDoc(doc(firestore, 'clients', order.clientId));
        if (clientSnap.exists()) {
          const cData = clientSnap.data();
          clientAddress = cData.address || cData.direccion || 'No especificada';
          clientCode = cData.internalCode || cData.code || order.clientId;
        }
      } else {
        const clientResult = await localDb.getFirstAsync<any>('SELECT * FROM clients WHERE id = ?', [order.clientId]);
        if (clientResult) {
          clientAddress = clientResult.address || clientResult.direccion || 'No especificada';
          clientCode = clientResult.internalCode || clientResult.code || order.clientId;
        }
      }
    } catch (e) {
      console.log("Error trayendo datos de dirección del client:", e);
    }

    let nombreDistribuidora = "DISTRIBUIDORA"; 
    try {
      const savedName = await AsyncStorage.getItem('@brand_name');
      if (savedName) nombreDistribuidora = savedName;
    } catch (e) {}

    let htmlContent = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <title>Ticket - ${order.clientName}</title>
          <style>
            body { font-family: monospace; font-size: 16px; margin: 0; padding: 20px; color: #000; background: #fff; line-height: 1.4; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .flex { display: flex; justify-content: space-between; }
            .divider { border-top: 1px dashed #000; margin: 12px 0; }
            h2 { font-size: 22px; margin: 5px 0; letter-spacing: 1px; }
            .unit-price { font-size: 13px; color: #444; margin-top: 3px; margin-bottom: 10px; padding-left: 25px; }
            .meta-text { font-size: 14px; margin: 4px 0; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="center bold">
            <h2>${nombreDistribuidora.toUpperCase()}</h2>
            <p style="margin: 2px 0; font-size: 14px;">Comprobante de Pedido</p>
          </div>
          <div class="divider"></div>
          <p class="meta-text"><span class="bold">Fecha:</span> ${date}</p>
          <p class="meta-text"><span class="bold">N° Pedido:</span> #${order.id.replace('ORD-', '')}</p>
          <div class="divider"></div>
          <p class="meta-text"><span class="bold">Client:</span> ${order.clientName}</p>
          <p class="meta-text"><span class="bold">Cód. Client:</span> ${clientCode}</p>
          <p class="meta-text"><span class="bold">Dirección:</span> ${clientAddress}</p>
          <div class="divider"></div>
          <div class="flex bold" style="font-size: 15px;"><span>Cant. Artículo</span><span>Subtotal</span></div>
          <div class="divider"></div>
    `;

    parsedItems.forEach((item: any) => {
      if (!item || !item.product) return;
      const unitPrice = item.unitPrice || (item.subtotal / item.quantity);
      htmlContent += `
        <div>
          <div class="flex"><span style="width: 75%; font-weight: bold;">${item.quantity}x ${item.product.name.toUpperCase()}</span><span style="font-weight: bold;">$${item.subtotal.toLocaleString('es-AR')}</span></div>
          <div class="unit-price">Precio Unitario: 1x $${unitPrice.toLocaleString('es-AR')}</div>
        </div>
      `;
    });

    htmlContent += `
          <div class="divider"></div>
          ${order.notes ? `<p class="meta-text"><span class="bold">Nota:</span> ${order.notes}</p><div class="divider"></div>` : ''}
          <div class="flex bold" style="font-size: 20px; marginTop: 10px;"><span>TOTAL FINAL:</span><span>$${order.total.toLocaleString('es-AR')}</span></div>
          <div class="divider"></div>
          <p class="center bold" style="margin-top: 25px; font-size: 15px;">¡Muchas gracias por su compra!</p>
        </body>
      </html>
    `;
    
    try { 
      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 300);
        } else {
          window.alert("⚠️ Por favor, permite las ventanas emergentes (pop-ups) en tu navegador para ver la previsualización del ticket.");
        }
      } else {
        await Print.printAsync({ html: htmlContent }); 
      }
    } catch (error) { 
      if (Platform.OS === 'web') window.alert("No se pudo conectar a la impresora.");
      else Alert.alert("Error", "No se pudo conectar a la impresora."); 
    }
  };

  const handlePaperIcon = (order: any) => {
    if (Platform.OS === 'web') {
      setActionMenuOrder(order); 
    } else {
      Alert.alert("Opciones de Pedido", "Selecciona una acción", [
        { text: "✏️ Editar pedido", onPress: () => handleEditOrder(order) },
        { text: "👁️ Ver detalles", onPress: () => router.push({ pathname: '/ver-pedido', params: { id: order.id } } as any) },
        { text: "🖨️ Imprimir ticket", onPress: () => handlePrintTicket(order) }, 
        { text: "Volver atrás", style: "cancel" }
      ]);
    }
  };

  const toggleExpand = (id: string) => setExpandedOrderId(prev => prev === id ? null : id);

  // 👇 LÓGICA DE ESTADOS ACTUALIZADA: DESCUENTA AL DESPACHAR 👇
  const handleChangeStatus = async (order: any, newStatus: string) => {
    // Si tocamos el mismo botón de estado que ya tiene, no hacemos nada
    if (order.status === newStatus) return;

    try { 
      if (Platform.OS === 'web') { 
        await setDoc(doc(firestore, 'orders', String(order.id)), { status: newStatus }, { merge: true });
        
        // Descontamos stock SOLO si pasamos a DESPACHADO y no veníamos de ENTREGADO
        if (newStatus === 'DESPACHADO' && order.status !== 'ENTREGADO') {
          const parsedItems = safeParseItems(order.items);
          for (const item of parsedItems) {
            if (item.product && item.product.id) {
              await updateDoc(doc(firestore, 'products', item.product.id), {
                stock: increment(-item.quantity),
                updatedAt: Date.now()
              }).catch(e => console.log("Error de stock en web:", e));
            }
          }
        }

      } else { 
        await localDb.runAsync("UPDATE orders SET status = ?, syncStatus = 'PENDING' WHERE id = ?", [newStatus, String(order.id)]); 
        
        if (newStatus === 'DESPACHADO' && order.status !== 'ENTREGADO') {
          const parsedItems = safeParseItems(order.items);
          for (const item of parsedItems) {
            if (item.product && item.product.id) {
              await localDb.runAsync(
                `UPDATE products SET stock = COALESCE(stock, 0) - ?, updatedAt = ?, syncStatus = 'PENDING' WHERE id = ?`,
                [item.quantity, Date.now(), item.product.id]
              ).catch(e => console.log("Error de stock en local:", e));
            }
          }
        }
      } 
      
      if (newStatus === 'DESPACHADO') {
        if (Platform.OS === 'web') window.alert("¡Pedido Despachado! El stock fue reservado/descontado.");
        else Alert.alert("¡Pedido Despachado!", "El stock fue reservado/descontado.");
      }
      
      loadOrders(); 
    } catch (error) { 
      console.error("Error al cambiar estado:", error); 
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || o.id.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [orders, searchQuery]);

  const pendingCount = orders.filter(o => o.syncStatus === 'PENDING').length;

  return (
    <View style={styles.container}>
      <View style={styles.headerArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Mis Pedidos</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={{ backgroundColor: '#FF9500', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, justifyContent: 'center' }} onPress={() => router.push('/carritos-abandonados' as any)}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>🛒 Incompletos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.syncButton} onPress={handleSyncOrders} disabled={isSyncing}>
              {isSyncing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.syncButtonText}>🔄 Sync ({pendingCount})</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.syncButton, { backgroundColor: '#FF3B30' }]} onPress={handleWipeAllOrders}>
              <Text style={styles.syncButtonText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput style={styles.searchInput} placeholder="Client / Código pedido..." placeholderTextColor="#a0aab5" value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}><Text style={{ color: '#fff', fontWeight: 'bold' }}>✖</Text></TouchableOpacity>}
        </View>
      </View>

      <Modal visible={!!actionMenuOrder} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalMenu}>
            <Text style={styles.modalMenuTitle}>Opciones de Pedido</Text>
            <Text style={styles.modalMenuSubtitle}>{actionMenuOrder?.clientName}</Text>
            <TouchableOpacity style={styles.modalMenuBtn} onPress={() => { handleEditOrder(actionMenuOrder); setActionMenuOrder(null); }}><Text style={styles.modalMenuBtnText}>✏️ Editar pedido</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalMenuBtn} onPress={() => { router.push({ pathname: '/ver-pedido', params: { id: actionMenuOrder.id } } as any); setActionMenuOrder(null); }}><Text style={styles.modalMenuBtnText}>👁️ Ver detalles</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalMenuBtn} onPress={() => { handlePrintTicket(actionMenuOrder); setActionMenuOrder(null); }}><Text style={styles.modalMenuBtnText}>🖨️ Imprimir ticket</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.modalMenuBtn, styles.modalMenuCancel]} onPress={() => setActionMenuOrder(null)}><Text style={styles.modalMenuCancelText}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {isLoading ? <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 50 }} /> : filteredOrders.length === 0 ? (
        <View style={styles.emptyContainer}><Text style={styles.emptyText}>No se encontraron pedidos.</Text></View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const date = new Date(item.createdAt);
            const isPendingSync = item.syncStatus === 'PENDING';
            const isExpanded = expandedOrderId === item.id;
            const parsedItems = safeParseItems(item.items);
            const status = item.status || 'PENDIENTE';

            return (
              <View style={styles.orderCard}>
                <View style={styles.actionCircleRow}>
                  <TouchableOpacity style={styles.circleBtnGreen} onPress={() => handlePaperIcon(item)}><Text style={styles.circleIcon}>📄</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.circleBtnGreen} onPress={() => handleWhatsApp(item)}><Text style={styles.circleIcon}>💬</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.circleBtnRed} onPress={() => handleDeleteOrder(item)}><Text style={styles.circleIcon}>🗑️</Text></TouchableOpacity>
                </View>

                <View style={styles.dataRow}><Text style={styles.dataLabel}>Código:</Text><Text style={styles.dataValue}>{item.id.replace('ORD-', '')}</Text></View>
                <View style={styles.dataRow}><Text style={styles.dataLabel}>Client:</Text><Text style={[styles.dataValue, item.clientId === 'WEB-CLIENT' && { color: '#007AFF', fontWeight: 'bold' }]}>{item.clientId === 'WEB-CLIENT' ? `🌐 ${item.clientName}` : item.clientName}</Text></View>
                <View style={styles.dataRow}><Text style={styles.dataLabel}>Forma de pago:</Text><Text style={styles.dataValue}>EFECTIVO</Text></View>
                <View style={styles.dataRow}><Text style={styles.dataLabel}>Estado Nube:</Text><Text style={[styles.dataValue, { color: isPendingSync ? '#FF9500' : '#34C759', fontWeight: 'bold' }]}>{isPendingSync ? 'PENDIENTE' : 'SINCRONIZADO'}</Text></View>
                <View style={[styles.dataRow, { marginTop: 10, alignItems: 'center' }]}><Text style={styles.dataLabel}>Total:</Text><Text style={styles.totalValue}>$ {item.total.toLocaleString('es-AR')}</Text></View>

                {isExpanded && (
                  <View style={styles.expandedContent}>
                    {item.notes ? <View style={styles.notesContainer}><Text style={styles.notesTitle}>📌 Nota:</Text><Text style={styles.notesText}>{item.notes}</Text></View> : null}
                    <Text style={styles.detailTitle}>Detalle de productos:</Text>
                    {parsedItems.map((cartItem: any, idx: number) => {
                      if (!cartItem || !cartItem.product) return null;
                      return (
                        <View key={idx} style={styles.detailRow}>
                          <Text style={styles.detailQty}>{cartItem.quantity}x</Text>
                          <Text style={styles.detailName}>{cartItem.product.name}</Text>
                          <Text style={styles.detailSubtotal}>${cartItem.subtotal.toLocaleString('es-AR')}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                <View style={styles.bottomButtonsRow}>
                  <TouchableOpacity style={[styles.btnState, { backgroundColor: '#f1b42f' }]} onPress={() => toggleExpand(item.id)}><Text style={styles.btnStateText}>1. VER PEDIDO</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.btnState, { backgroundColor: status === 'DESPACHADO' ? '#007AFF' : '#c4c4c4' }]} onPress={() => handleChangeStatus(item, 'DESPACHADO')}><Text style={styles.btnStateText}>2. DESPACHADO</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.btnState, { backgroundColor: status === 'ENTREGADO' ? '#34C759' : '#c4c4c4' }]} onPress={() => handleChangeStatus(item, 'ENTREGADO')}><Text style={styles.btnStateText}>3. ENTREGADO</Text></TouchableOpacity>
                </View>
                <Text style={styles.timestamp}>{date.toLocaleDateString('es-AR')} {date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e9ecef' },
  headerArea: { backgroundColor: '#135C58', paddingTop: Platform.OS === 'web' ? 15 : 50, paddingBottom: 15, paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  syncButton: { backgroundColor: '#34C759', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  syncButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f4c49', borderRadius: 8, paddingHorizontal: 12, height: 44 },
  searchIcon: { fontSize: 16, marginRight: 8, color: '#a0aab5' },
  searchInput: { flex: 1, fontSize: 15, color: '#fff' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#666' },
  listContent: { paddingHorizontal: 15, paddingTop: 15, paddingBottom: 50 },
  orderCard: { backgroundColor: '#fdfdfd', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  actionCircleRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 10 },
  circleBtnGreen: { backgroundColor: '#2ecc71', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  circleBtnRed: { backgroundColor: '#e74c3c', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  circleIcon: { fontSize: 16, color: '#fff' },
  dataRow: { flexDirection: 'row', marginBottom: 8 },
  dataLabel: { width: 130, fontSize: 15, fontWeight: 'bold', color: '#333' },
  dataValue: { flex: 1, fontSize: 15, color: '#333' },
  totalValue: { fontSize: 22, fontWeight: 'bold', color: '#000' },
  expandedContent: { marginTop: 15, padding: 15, backgroundColor: '#f5f5f5', borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
  notesContainer: { backgroundColor: '#fff3cd', padding: 10, borderRadius: 6, marginBottom: 15, borderWidth: 1, borderColor: '#ffe69c' },
  notesTitle: { fontSize: 12, fontWeight: 'bold', color: '#856404', marginBottom: 4 },
  notesText: { fontSize: 13, color: '#856404' },
  detailTitle: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  detailQty: { width: 30, fontSize: 14, fontWeight: 'bold', color: '#333' },
  detailName: { flex: 1, fontSize: 13, color: '#555' },
  detailSubtotal: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  bottomButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, gap: 5 },
  btnState: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center', elevation: 1 },
  btnStateText: { color: '#fff', fontWeight: 'bold', fontSize: 10, textTransform: 'uppercase', textAlign: 'center' },
  timestamp: { textAlign: 'right', fontSize: 11, color: '#aaa', marginTop: 15, fontStyle: 'italic' },
  
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 } : {})
  },
  modalMenu: { backgroundColor: '#fff', padding: 20, borderRadius: 12, width: 300, elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10 },
  modalMenuTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', textAlign: 'center' },
  modalMenuSubtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  modalMenuBtn: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  modalMenuBtnText: { fontSize: 16, color: '#007AFF', fontWeight: 'bold' },
  modalMenuCancel: { borderBottomWidth: 0, marginTop: 10, backgroundColor: '#f5f5f5', borderRadius: 8 },
  modalMenuCancelText: { fontSize: 16, color: '#FF3B30', fontWeight: 'bold' }
});