// app/ver-compra.tsx 
import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { collection, doc, getDoc, getDocs, increment, query, setDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import localDb from '../src/config/database';
import { db as firestore } from '../src/config/firebase.config';
import { useAuthStore } from '../src/store/useAuthStore';

export default function VerCompraScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { businessId } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  
  const [isEditing, setIsEditing] = useState(false);
  const [isAddModalVisible, setAddModalVisible] = useState(false);

  const [catalog, setCatalog] = useState<any[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [tempSelectedProducts, setTempSelectedProducts] = useState<any[]>([]);
  const [manualTotal, setManualTotal] = useState('');

  const loadOrderData = async () => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'web') {
        const docRef = doc(firestore, 'purchase_orders', id as string);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setOrder(data);
          setOrderItems(typeof data.items === 'string' ? JSON.parse(data.items || '[]') : data.items);
        } else {
          window.alert("No se encontró la orden de compra.");
          router.back();
        }
      } else {
        const res = await localDb.getAllAsync<any>('SELECT * FROM purchase_orders WHERE id = ?', [id]);
        if (res.length > 0) {
          setOrder(res[0]);
          setOrderItems(JSON.parse(res[0].items || '[]'));
        } else {
          Alert.alert("Error", "No se encontró la orden de compra.");
          router.back();
        }
      }
    } catch (error) {
      console.error("Error cargando detalles:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadCatalogData = async () => {
      try {
        if (Platform.OS === 'web') {
          if (!businessId) return;
          const prodsSnap = await getDocs(query(collection(firestore, 'products'), where('businessId', '==', businessId)));
          const prods = prodsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setCatalog(prods.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));
        } else {
          const prods = await localDb.getAllAsync<any>('SELECT * FROM products ORDER BY name ASC');
          setCatalog(prods);
        }
      } catch (error) {
        console.error("Error cargando el catálogo en ver-compras:", error);
      }
    };
    loadCatalogData();
  }, [businessId]);

  useEffect(() => {
    if (id) loadOrderData();
  }, [id]);

  const subtotalCalculado = orderItems.reduce((acc, item) => {
    const numericCost = parseFloat(String(item.cost).replace(',', '.') || '0');
    return acc + (numericCost * item.quantity);
  }, 0);
  
  let totalCalculado = 0;
  let discountCalculado = 0;

  if (isEditing) {
    totalCalculado = manualTotal !== '' ? parseFloat(manualTotal.replace(',', '.')) : subtotalCalculado;
    discountCalculado = Math.max(0, subtotalCalculado - totalCalculado);
  } else {
    discountCalculado = parseFloat(order?.discount || '0');
    totalCalculado = Math.max(0, subtotalCalculado - discountCalculado);
  }

  const updateQty = (index: number, delta: number) => {
    const newItems = [...orderItems];
    const currentQty = newItems[index].quantity || 1;
    const nextQty = currentQty + delta;
    
    if (nextQty <= 0) {
      newItems.splice(index, 1);
    } else {
      newItems[index].quantity = nextQty;
    }
    setOrderItems(newItems);
  };

  const openCatalogModal = () => {
    setTempSelectedProducts(orderItems.map(i => i.product));
    setCatalogSearch('');
    setAddModalVisible(true);
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
      const existingItem = orderItems.find(i => i.product.id === prod.id);
      if (existingItem) {
        return existingItem; 
      }
      return { product: prod, cost: prod.baseCost.toString(), quantity: 1 };
    });

    setOrderItems(newItems);
    setAddModalVisible(false);
  };

  const handleSaveOrder = async () => {
    if (orderItems.length === 0) {
      if (Platform.OS === 'web') window.alert("La orden no puede quedar vacía.");
      else Alert.alert("Error", "La orden no puede quedar vacía.");
      return;
    }

    setIsSaving(true);
    try {
      if (Platform.OS === 'web') {
        await setDoc(doc(firestore, 'purchase_orders', id as string), {
          items: JSON.stringify(orderItems),
          total: totalCalculado,
          discount: discountCalculado
        }, { merge: true });
      } else {
        await localDb.runAsync(
          "UPDATE purchase_orders SET items = ?, total = ?, discount = ?, syncStatus = 'PENDING' WHERE id = ?",
          [JSON.stringify(orderItems), totalCalculado, discountCalculado, id as string]
        );
      }
      
      setOrder({ ...order, total: totalCalculado, discount: discountCalculado });
      setIsEditing(false);
      
      if (Platform.OS === 'web') window.alert("¡Orden actualizada correctamente!");
      else Alert.alert("Éxito", "La orden fue modificada y guardada.");
      
    } catch (error) {
      console.error("Error al guardar:", error);
      if (Platform.OS === 'web') window.alert("No se pudo actualizar la orden.");
      else Alert.alert("Error", "No se pudo actualizar la orden.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarcarRecibido = async () => {
    try {
      if (Platform.OS === 'web') {
        // 1. Marcar estado de la orden
        await setDoc(doc(firestore, 'purchase_orders', id as string), { status: 'RECIBIDO' }, { merge: true });
        
        let productosSumados = 0;
        
        // 2. Sumar stock y actualizar costos en cada producto de manera segura
        for (const item of orderItems) {
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
        
        // Actualizamos estado en pantalla
        setOrder({ ...order, status: 'RECIBIDO' });
        
        window.alert(`¡Mercadería Recibida!\nSe sumó el stock correctamente a ${productosSumados} productos.`);

      } else {
        // LÓGICA PARA CELULAR (ANDROID/IOS)
        await localDb.runAsync(
          "UPDATE purchase_orders SET status = 'RECIBIDO', syncStatus = 'PENDING' WHERE id = ?",
          [id as string]
        );
        
        let productosSumados = 0;

        for (const item of orderItems) {
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
        
        setOrder({ ...order, status: 'RECIBIDO' });
        Alert.alert("¡Mercadería Recibida!", `Se sumó el stock a ${productosSumados} productos correctamente.`);
      }
      
    } catch (error: any) {
      console.error("Error al marcar como recibido:", error);
      if (Platform.OS === 'web') {
        window.alert(`Error al marcar la orden:\n${error.message}`);
      } else {
        Alert.alert("Error", "No se pudo marcar la orden como recibida por completo.");
      }
    }
  };

  const handleShareWhatsApp = () => {
    if (!order) return;

    let mensaje = `📋 *ORDEN DE COMPRA*\n\n`;
    mensaje += `🏢 *Proveedor:* ${order.supplierName}\n`;
    mensaje += `📅 *Fecha:* ${new Date(order.createdAt).toLocaleDateString('es-AR')}\n`;
    mensaje += `🔢 *Nro:* ${order.id}\n\n`;
    mensaje += `*Detalle de artículos:*\n`;
    
    orderItems.forEach(item => {
      const numericCost = parseFloat(String(item.cost).replace(',', '.') || '0');
      const itemSubtotal = numericCost * item.quantity;
      mensaje += `▪️ ${item.quantity}x ${item.product.name} ($${itemSubtotal.toLocaleString('es-AR')})\n`;
    });

    if (discountCalculado > 0) {
      mensaje += `\n🎁 *Descuento:* -$${discountCalculado.toLocaleString('es-AR')}`;
    }
    
    mensaje += `\n💰 *TOTAL FINAL: $${totalCalculado.toLocaleString('es-AR')}*\n`;

    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => Alert.alert("Error", "No se pudo abrir WhatsApp. Asegurate de tenerlo instalado."));
    }
  };

  const handlePrintAndShare = async () => {
    if (!order) return;

    const tableRowsHtml = orderItems.map(item => {
      const numericCost = parseFloat(String(item.cost).replace(',', '.') || '0');
      const subtotalItem = numericCost * item.quantity;
      return `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: left; font-size: 14px;">
            ${item.product.name.toUpperCase()}
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: center; font-size: 14px;">
            ${item.quantity}
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right; font-size: 14px; font-weight: bold;">
            $ ${subtotalItem.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </td>
        </tr>
      `;
    }).join('');

    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            @page { margin: 20px; }
            html, body { 
              height: 100%; 
              margin: 0; 
              padding: 0; 
              background: #fff; 
            }
            body { 
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
              color: #333; 
              padding: 20px; 
              -webkit-print-color-adjust: exact; 
            }
            .header-table { width: 100%; margin-bottom: 30px; }
            .title { font-size: 18px; font-weight: bold; text-align: right; letter-spacing: 1px; }
            .brand { font-size: 22px; font-weight: 900; color: #000; }
            .meta-text { font-size: 13px; color: #555; line-height: 1.6; }
            .provider-section { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 15px 0; margin-bottom: 20px; }
            .section-title { font-size: 14px; font-weight: bold; margin: 0 0 5px 0; letter-spacing: 0.5px; }
            
            .items-table { width: 100%; border-collapse: collapse; page-break-inside: auto; margin-bottom: 30px; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            
            .items-table th { padding: 8px 0; border-bottom: 2px solid #000; font-size: 12px; font-weight: bold; color: #000; }
            
            .summary-wrapper { text-align: right; font-size: 14px; margin-top: 20px; line-height: 2; page-break-inside: avoid; }
            .total-final { font-size: 18px; font-weight: 900; color: #135C58; border-top: 1px dashed #ccc; padding-top: 5px; margin-top: 5px; }
            .footer-notice { margin-top: 40px; font-size: 11px; color: #666; text-align: center; border-top: 1px solid #eee; padding-top: 20px; page-break-inside: avoid; }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              <td style="vertical-align: top;">
                <div class="brand">PRIMSO</div>
                <div class="meta-text" style="color: #135C58; font-weight: bold; margin-top: 4px;">DISTRIBUCIONES</div>
                <div class="meta-text" style="margin-top: 8px;">vga_567@hotmail.com.ar</div>
              </td>
              <td style="vertical-align: top; text-align: right;">
                <div class="title">ORDEN DE COMPRA</div>
                <div class="meta-text" style="margin-top: 15px;"><b>FECHA:</b> ${new Date(order.createdAt).toLocaleDateString('es-AR')}</div>
                <div class="meta-text"><b>NRO:</b> ${order.id}</div>
              </td>
            </tr>
          </table>

          <div class="provider-section">
            <h4 class="section-title">PROVEEDOR</h4>
            <div class="meta-text" style="font-size: 15px; font-weight: bold; color: #111;">${order.supplierName}</div>
            <div class="meta-text" style="margin-top: 3px;">Método de Pago: ${order.paymentMethod}</div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th style="text-align: left; width: 60%;">ARTÍCULO</th>
                <th style="text-align: center; width: 15%;">CANTIDAD</th>
                <th style="text-align: right; width: 25%;">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>

          <div class="summary-wrapper">
            <div>Subtotal: <b>$ ${subtotalCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b></div>
            ${discountCalculado > 0 ? `<div style="color: #ff3b30;">Descuento aplicable: <b>- $ ${discountCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b></div>` : ''}
            <div class="total-final">Total General: $ ${totalCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
          </div>

          <div class="footer-notice">
            Recuerde por favor verificar la mercadería al momento de la recepción. Este documento sirve como comprobante interno de orden de aprovisionamiento logístico para actualización de existencias de inventario.
          </div>
        </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank', 'width=800,height=800');
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(htmlTemplate);
          printWindow.document.close();
          setTimeout(() => {
            printWindow.print();
          }, 300);
        } else {
          window.alert("Atención: El navegador bloqueó la ventana emergente. Por favor, habilitá las ventanas emergentes.");
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlTemplate });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir Orden de Compra' });
      }
    } catch (error) {
      console.error("Error procesando impresión:", error);
      if (Platform.OS === 'web') window.alert("Error: No se pudo procesar la acción.");
      else Alert.alert("Error", "No se pudo procesar la acción.");
    }
  };

  if (isLoading || !order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#135C58" />
      </View>
    );
  }

  const date = new Date(order.createdAt);
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
        <Text style={styles.headerTitle}>{isEditing ? 'Modificando Orden' : 'Detalle de Orden'}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {isEditing && (
          <View style={styles.editBanner}>
            <Text style={styles.editBannerText}>⚠️ ESTÁS EDITANDO ESTA COMPRA</Text>
          </View>
        )}

        <View style={styles.ticketCard}>
          <Text style={styles.brandTitle}>PRIMSO DISTRIBUCIONES</Text>
          <Text style={styles.orderLabel}>ORDEN DE COMPRA</Text>
          
          <View style={styles.divider} />
          
          <View style={styles.rowBetween}>
            <Text style={styles.metaLabel}>Fecha:</Text>
            <Text style={styles.metaValue}>{date.toLocaleDateString('es-AR')} {date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          <View style={[styles.rowBetween, { marginTop: 4 }]}>
            <Text style={styles.metaLabel}>ID Compra:</Text>
            <Text style={styles.metaValue}>{order.id}</Text>
          </View>
          <View style={[styles.rowBetween, { marginTop: 4 }]}>
            <Text style={styles.metaLabel}>Estado:</Text>
            <Text style={[styles.metaValue, { color: order.status === 'RECIBIDO' ? '#34C759' : '#FF9500', fontWeight: 'bold' }]}>
              {order.status || 'PENDIENTE'}
            </Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionHeading}>PROVEEDOR</Text>
          <Text style={styles.supplierName}>{order.supplierName}</Text>
          <Text style={styles.paymentMethod}>💳 {order.paymentMethod}</Text>

          <View style={styles.thickDivider} />

          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeadText, { flex: 2, textAlign: 'left' }]}>ARTÍCULO</Text>
            <Text style={[styles.tableHeadText, { flex: 1, textAlign: 'center' }]}>CANT.</Text>
            <Text style={[styles.tableHeadText, { flex: 1, textAlign: 'right' }]}>TOTAL</Text>
          </View>

          {orderItems.map((item, index) => {
            const numericCost = parseFloat(String(item.cost).replace(',', '.') || '0');
            const itemSubtotal = numericCost * item.quantity;
            
            return (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.itemName, { flex: 2 }]}>{item.product.name}</Text>
                
                {isEditing ? (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                    <TouchableOpacity onPress={() => updateQty(index, -1)} style={styles.qtyControlBtn}>
                      <Text style={styles.qtyControlText}>-</Text>
                    </TouchableOpacity>
                    <Text style={{ marginHorizontal: 8, fontWeight: 'bold' }}>{item.quantity}</Text>
                    <TouchableOpacity onPress={() => updateQty(index, 1)} style={styles.qtyControlBtn}>
                      <Text style={styles.qtyControlText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={[styles.itemQty, { flex: 1, textAlign: 'center' }]}>{item.quantity}</Text>
                )}

                <Text style={[styles.itemSubtotal, { flex: 1, textAlign: 'right' }]}>$ {itemSubtotal.toLocaleString('es-AR')}</Text>
              </View>
            );
          })}

          {isEditing && (
            <TouchableOpacity onPress={openCatalogModal} style={styles.addManualBtn}>
              <Text style={styles.addManualBtnText}>+ Agregar Producto a la Orden</Text>
            </TouchableOpacity>
          )}

          <View style={styles.thickDivider} />

          <View style={[styles.rowBetween, { marginBottom: 6 }]}>
            <Text style={styles.subtotalLabel}>Subtotal</Text>
            <Text style={styles.subtotalValue}>$ {subtotalCalculado.toLocaleString('es-AR')}</Text>
          </View>

          {isEditing ? (
            <View style={[styles.rowBetween, { marginTop: 10, marginBottom: 5 }]}>
              <Text style={styles.discountLabelInput}>Pago Real (Opcional)</Text>
              <View style={styles.discountInputWrapper}>
                <Text style={styles.discountCurrency}>$</Text>
                <TextInput 
                  style={styles.discountInput}
                  value={manualTotal}
                  onChangeText={setManualTotal}
                  keyboardType="numeric"
                  placeholder={subtotalCalculado.toString()}
                  placeholderTextColor="#ffb3b0"
                />
              </View>
            </View>
          ) : (
            discountCalculado > 0 && (
              <View style={[styles.rowBetween, { marginBottom: 10 }]}>
                <Text style={styles.discountLabel}>Descuento Bonificado</Text>
                <Text style={styles.discountValue}>- $ {discountCalculado.toLocaleString('es-AR')}</Text>
              </View>
            )
          )}

          {isEditing && discountCalculado > 0 && (
            <View style={[styles.rowBetween, { marginBottom: 10, marginTop: 5 }]}>
              <Text style={{ fontSize: 13, color: '#ff3b30' }}>Descuento calculado:</Text>
              <Text style={{ fontSize: 14, color: '#ff3b30', fontWeight: 'bold' }}>- $ {discountCalculado.toLocaleString('es-AR')}</Text>
            </View>
          )}

          <View style={styles.rowBetween}>
            <Text style={styles.totalLabel}>Total General</Text>
            <Text style={styles.totalValueFinal}>$ {totalCalculado.toLocaleString('es-AR')}</Text>
          </View>
        </View>

        {!isEditing ? (
          <>
            <TouchableOpacity 
              style={[styles.btnPrint, { backgroundColor: order.status === 'RECIBIDO' ? '#888' : '#34C759', marginBottom: 10 }]} 
              onPress={handleMarcarRecibido}
              disabled={order.status === 'RECIBIDO'}
            >
              <Text style={styles.btnPrintText}>
                {order.status === 'RECIBIDO' ? '✅ MERCADERÍA RECIBIDA EN SISTEMA' : '📦 MARCAR COMO RECIBIDA Y SUMAR STOCK'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.btnPrint, { backgroundColor: '#FF9500', marginBottom: 10, marginTop: 0 }]} 
              onPress={() => {
                if (order.status === 'RECIBIDO') {
                  const msg = "Acción Bloqueada: No podés editar esta orden porque ya marcaste la mercadería como recibida y el stock ya se sumó.";
                  if (Platform.OS === 'web') window.alert(msg);
                  else Alert.alert("Acción Bloqueada", msg);
                  return;
                }
                setIsEditing(true);
                if (parseFloat(order.discount || '0') > 0) {
                  setManualTotal(order.total.toString());
                } else {
                  setManualTotal('');
                }
              }}
            >
              <Text style={styles.btnPrintText}>✏️ EDITAR CANTIDADES O PRODUCTOS</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.btnPrint, { marginBottom: 10, marginTop: 0 }]} onPress={handlePrintAndShare}>
              <Text style={styles.btnPrintText}>🖨️ IMPRIMIR / DESCARGAR PDF</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.btnPrint, { backgroundColor: '#25D366', marginTop: 0 }]} onPress={handleShareWhatsApp}>
              <Text style={styles.btnPrintText}>💬 COMPARTIR POR WHATSAPP</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 25 }}>
            <TouchableOpacity 
              style={[styles.btnPrint, { flex: 1, backgroundColor: '#888', marginTop: 0 }]} 
              onPress={() => { setIsEditing(false); loadOrderData(); }}
            >
              <Text style={styles.btnPrintText}>CANCELAR</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.btnPrint, { flex: 2, backgroundColor: '#34C759', marginTop: 0 }]} 
              onPress={handleSaveOrder} 
              disabled={isSaving}
            >
              <Text style={styles.btnPrintText}>{isSaving ? 'GUARDANDO...' : '💾 GUARDAR'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* MODAL COMPLETO DE SELECCIÓN MÚLTIPLE DE PRODUCTOS DEL CATÁLOGO */}
      <Modal visible={isAddModalVisible} animationType="slide" onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccionar Productos</Text>
            <TouchableOpacity onPress={() => setAddModalVisible(false)}>
              <Text style={styles.closeModalText}>Cancelar</Text>
            </TouchableOpacity>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#135C58', paddingTop: Platform.OS === 'web' ? 20 : 50, paddingBottom: 15, paddingHorizontal: 15 },
  backBtn: { padding: 5 },
  backIcon: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  editBanner: { backgroundColor: '#fff3cd', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#ffe69c', alignItems: 'center' },
  editBannerText: { color: '#856404', fontWeight: 'bold', fontSize: 13 },
  ticketCard: { backgroundColor: '#fff', borderRadius: 8, padding: 20, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  brandTitle: { fontSize: 20, fontWeight: '900', color: '#333', textAlign: 'center' },
  orderLabel: { fontSize: 13, fontWeight: 'bold', color: '#666', textAlign: 'center', marginTop: 4, letterSpacing: 2 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
  thickDivider: { height: 2, backgroundColor: '#333', marginVertical: 15 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel: { fontSize: 14, color: '#888' },
  metaValue: { fontSize: 14, color: '#333', fontWeight: '500' },
  sectionHeading: { fontSize: 11, fontWeight: 'bold', color: '#999', marginBottom: 6, letterSpacing: 1 },
  supplierName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  paymentMethod: { fontSize: 13, color: '#666', marginTop: 4 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 8, marginBottom: 10 },
  tableHeadText: { fontSize: 12, fontWeight: 'bold', color: '#888' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f7f7f7', alignItems: 'center' },
  itemName: { fontSize: 14, color: '#333', fontWeight: '500' },
  itemQty: { fontSize: 14, color: '#666' },
  itemSubtotal: { fontSize: 14, color: '#333', fontWeight: 'bold' },
  qtyControlBtn: { backgroundColor: '#f0f0f0', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  qtyControlText: { fontSize: 16, fontWeight: 'bold', color: '#555' },
  addManualBtn: { marginTop: 15, paddingVertical: 10, backgroundColor: '#e6f4ea', borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#a8dab5', borderStyle: 'dashed' },
  addManualBtnText: { color: '#137333', fontWeight: 'bold', fontSize: 13 },
  subtotalLabel: { fontSize: 14, color: '#666' },
  subtotalValue: { fontSize: 14, color: '#333', fontWeight: '500' },
  discountLabel: { fontSize: 14, color: '#ff3b30', fontWeight: '500' },
  discountValue: { fontSize: 14, color: '#ff3b30', fontWeight: 'bold' },
  totalLabel: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  totalValueFinal: { fontSize: 22, fontWeight: '900', color: '#135C58' },
  btnPrint: { backgroundColor: '#135C58', paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginTop: 25, elevation: 2 },
  btnPrintText: { color: '#fff', fontWeight: 'bold', fontSize: 15, textAlign: 'center' },
  
  discountLabelInput: { fontSize: 15, color: '#ff3b30', fontWeight: 'bold' },
  discountInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebe9', borderWidth: 1, borderColor: '#ffc1bd', borderRadius: 6, paddingHorizontal: 10 },
  discountCurrency: { fontSize: 16, color: '#ff3b30', fontWeight: 'bold', marginRight: 5 },
  discountInput: { width: 80, paddingVertical: 8, fontSize: 16, color: '#ff3b30', fontWeight: 'bold', textAlign: 'right' },

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
  checkCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#34C759', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  checkCircleText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  floatingConfirmContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 15, borderTopWidth: 1, borderTopColor: '#eee', elevation: 10 },
  btnConfirmSelection: { backgroundColor: '#135C58', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
  btnConfirmSelectionText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});