// app/reportes.tsx
import * as Print from 'expo-print';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// @ts-ignore
import { LineChart } from 'react-native-chart-kit';
import localDb from '../src/config/database';

// Importaciones para leer desde la nube en versión web
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db as firestore } from '../src/config/firebase.config';
// 👇 Importamos el AuthStore para el blindaje multi-empresa 👇
import { useAuthStore } from '../src/store/useAuthStore';

const screenWidth = Dimensions.get('window').width;

export default function ReportesScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  
  // 👇 Traemos el ID de tu distribuidora 👇
  const { businessId } = useAuthStore();
  
  const [totales, setTotales] = useState({ ventas: 0, ganancias: 0 });
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topClients, setTopClients] = useState<any[]>([]);
  const [chartData, setChartData] = useState({
    labels: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
    datasets: [{ data: [0, 0, 0, 0, 0, 0, 0] }]
  });

  const loadReportData = async () => {
    setIsLoading(true);
    try {
      let orders: any[] = [];

      if (Platform.OS === 'web') {
        if (!businessId) return; // 🛡️ Si no hay sesión, no carga nada
        // --- MODO WEB: Leer desde Firebase con FILTRO DE EMPRESA ---
        const q = query(collection(firestore, 'orders'), where('businessId', '==', businessId));
        const ordersSnap = await getDocs(q);
        orders = ordersSnap.docs.map(doc => doc.data());
      } else {
        // --- MODO CELULAR NATIVO: Leer desde SQLite ---
        orders = await localDb.getAllAsync<any>('SELECT * FROM orders');
      }
      
      let totalVentas = 0;
      let totalGanancias = 0;
      const productCounts: Record<string, number> = {};
      const clientTotals: Record<string, number> = {};

      orders.forEach(order => {
        totalVentas += order.total;

        // Sumar compras por cliente
        clientTotals[order.clientName] = (clientTotals[order.clientName] || 0) + order.total;

        // Procesar items para ganancias y top productos
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        items.forEach((item: any) => {
          // Ganancia = (Precio de venta - Costo base) * Cantidad
          const costoBase = item.product?.baseCost || 0;
          const gananciaItem = (item.unitPrice - costoBase) * item.quantity;
          totalGanancias += gananciaItem;

          // Contar productos vendidos
          if (item.product?.name) {
            productCounts[item.product.name] = (productCounts[item.product.name] || 0) + item.quantity;
          }
        });
      });

      setTotales({ ventas: totalVentas, ganancias: totalGanancias });

      // Ordenar Top 10 Productos
      const sortedProducts = Object.entries(productCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, qty]) => ({ name, qty }));
      setTopProducts(sortedProducts);

      // Ordenar Top 10 Clientes
      const sortedClients = Object.entries(clientTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, total]) => ({ name, total }));
      setTopClients(sortedClients);

      // Curva demo simulando la última semana basada en el total.
      if (totalVentas > 0) {
        setChartData({
          labels: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Hoy'],
          datasets: [{ 
            data: [
              totalVentas * 0.1, totalVentas * 0.15, totalVentas * 0.05, 
              totalVentas * 0.2, totalVentas * 0.1, totalVentas * 0.1, totalVentas * 0.3
            ] 
          }]
        });
      }

    } catch (error) {
      console.error("Error cargando reportes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadReportData(); }, [businessId]));

  // --- FUNCIÓN ESTRELLA: IMPRIMIR CIERRE DEL DÍA ---
  const handlePrintEndOfDay = async () => {
    try {
      let orders: any[] = [];
      
      if (Platform.OS === 'web') {
        if (!businessId) return;
        // 🛡️ Blindaje de datos también en la impresión web
        const q = query(collection(firestore, 'orders'), where('businessId', '==', businessId));
        const ordersSnap = await getDocs(q);
        orders = ordersSnap.docs.map(doc => doc.data());
      } else {
        orders = await localDb.getAllAsync<any>('SELECT * FROM orders');
      }
      
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      
      const pedidosDeHoy = orders.filter(o => new Date(o.createdAt) >= hoy);

      if (pedidosDeHoy.length === 0) {
        if (Platform.OS === 'web') window.alert("No hay pedidos registrados en el día de hoy para imprimir.");
        else Alert.alert("Sin datos", "No hay pedidos registrados en el día de hoy para imprimir.");
        return;
      }

      let totalCaja = 0;
      
      let htmlContent = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <title>Cierre del Día</title>
            <style>
              body { font-family: monospace; font-size: 14px; margin: 0; padding: 10px; color: #000; }
              h1 { text-align: center; color: #135C58; margin-bottom: 5px; font-family: 'Helvetica', sans-serif; }
              p.subtitle { text-align: center; color: #666; margin-top: 0; margin-bottom: 20px; font-family: 'Helvetica', sans-serif; }
              .order-card { border: 2px dashed #333; padding: 10px; margin-bottom: 15px; border-radius: 8px; page-break-inside: avoid; }
              .order-header { border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 10px; display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; }
              .flex { display: flex; justify-content: space-between; }
              .bold { font-weight: bold; }
              .unit-price { font-size: 11px; color: #555; margin-top: 2px; margin-bottom: 8px; }
              .order-total { border-top: 1px solid #000; padding-top: 5px; margin-top: 5px; font-size: 18px; font-weight: bold; text-align: right; }
              .grand-total { background-color: #135C58; color: white; padding: 15px; border-radius: 8px; text-align: center; font-size: 20px; margin-top: 30px; font-weight: bold; font-family: 'Helvetica', sans-serif; }
              @media print { body { padding: 0; } }
            </style>
          </head>
          <body>
            <h1>REPORTE DETALLADO DEL DÍA</h1>
            <p class="subtitle">Fecha: ${new Date().toLocaleDateString('es-AR')}</p>
      `;

      pedidosDeHoy.forEach(order => {
        totalCaja += order.total;
        const time = new Date(order.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const parsedItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

        htmlContent += `
          <div class="order-card">
            <div class="order-header">
              <span>👤 ${order.clientName}</span>
              <span>🕒 ${time}</span>
            </div>
            <div style="font-size: 11px; color: #666; margin-bottom: 10px;">Cod: ${order.id.replace('ORD-', '')}</div>
        `;

        parsedItems.forEach((item: any) => {
          if (!item || !item.product) return;
          const unitPrice = item.unitPrice || (item.subtotal / item.quantity);
          htmlContent += `
            <div>
              <div class="flex">
                <span style="width: 70%; font-weight: bold;">${item.quantity}x ${item.product.name}</span>
                <span style="font-weight: bold;">$${item.subtotal.toLocaleString('es-AR')}</span>
              </div>
              <div class="unit-price">
                1x $${unitPrice.toLocaleString('es-AR')}
              </div>
            </div>
          `;
        });

        if (order.notes) {
          htmlContent += `<p style="font-size: 13px; margin: 5px 0;"><span class="bold">Nota:</span> ${order.notes}</p>`;
        }
        
        htmlContent += `
            <div class="order-total">
              Subtotal Pedido: $${order.total.toLocaleString('es-AR')}
            </div>
          </div>
        `;
      });

      htmlContent += `
            <div class="grand-total">
              TOTAL RECAUDADO HOY: $${totalCaja.toLocaleString('es-AR')}
            </div>
            <p style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">Generado por Preventistas Web</p>
          </body>
        </html>
      `;

      // 👇 LÓGICA DE IMPRESIÓN ROBUSTA PARA WEB Y CELULAR 👇
      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          // Damos un pequeño respiro para que el navegador renderice el DOM antes de lanzar el print
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 300);
        } else {
          window.alert("⚠️ Por favor, permite las ventanas emergentes (pop-ups) en tu navegador para poder imprimir el reporte.");
        }
      } else {
        await Print.printAsync({ html: htmlContent });
      }

    } catch (error) {
      console.error("Error imprimiendo cierre:", error);
      if (Platform.OS === 'web') window.alert("No se pudo generar el documento de cierre.");
      else Alert.alert("Error", "No se pudo generar el documento de cierre.");
    }
  };

  if (isLoading) return <ActivityIndicator size="large" color="#135C58" style={{ flex: 1, justifyContent: 'center' }} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>REPORTES</Text>
        <View style={{ width: 30 }} /> 
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={styles.totalesRow}>
          <View style={[styles.totalCard, { backgroundColor: '#8E44AD' }]}>
            <Text style={styles.totalLabel}>VENTAS</Text>
            <Text style={styles.totalValue}>$ {totales.ventas.toLocaleString('es-AR')}</Text>
          </View>
          <View style={[styles.totalCard, { backgroundColor: '#FF6B6B' }]}>
            <Text style={styles.totalLabel}>GANANCIAS</Text>
            <Text style={styles.totalValue}>$ {totales.ganancias.toLocaleString('es-AR')}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ventas y Ganancias</Text>
          <LineChart
            data={chartData}
            width={screenWidth - 40} 
            height={220}
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(142, 68, 173, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(100, 100, 100, ${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: { r: "4", strokeWidth: "2", stroke: "#8E44AD" }
            }}
            bezier
            style={{ marginVertical: 8, borderRadius: 16 }}
          />
        </View>

        <TouchableOpacity style={styles.printBtn} onPress={handlePrintEndOfDay}>
          <Text style={styles.printBtnText}>🖨️ IMPRIMIR CIERRE DEL DÍA</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top 10 Productos con más ventas</Text>
          <View style={styles.listHeaderRow}>
            <Text style={styles.listHeaderLeft}>TÍTULO</Text>
            <Text style={styles.listHeaderRight}>Cantidad</Text>
          </View>
          {topProducts.map((p, index) => (
            <View key={index} style={styles.listItemRow}>
              <Text style={styles.listItemLeft} numberOfLines={2}>{p.name.toUpperCase()}</Text>
              <Text style={styles.listItemRight}>{p.qty}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top 10 Clientes con más ventas</Text>
          <View style={styles.listHeaderRow}>
            <Text style={styles.listHeaderLeft}>Nombre</Text>
            <Text style={styles.listHeaderRight}>VALOR</Text>
          </View>
          {topClients.map((c, index) => (
            <View key={index} style={styles.listItemRow}>
              <Text style={styles.listItemLeft} numberOfLines={1}>{c.name}</Text>
              <Text style={styles.listItemRight}>$ {c.total.toLocaleString('es-AR')}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0A5C53', paddingTop: Platform.OS === 'web' ? 20 : 50, paddingBottom: 15, paddingHorizontal: 15 
  },
  backBtn: { padding: 5 },
  backIcon: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
  
  scrollContent: { padding: 15 },
  
  totalesRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  totalCard: { width: '48%', padding: 15, borderRadius: 8, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
  totalLabel: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginBottom: 5 },
  totalValue: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#eee', elevation: 1 },
  cardTitle: { fontSize: 16, color: '#333', marginBottom: 15 },
  
  printBtn: { backgroundColor: '#34C759', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginBottom: 15, elevation: 2 },
  printBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 8, marginBottom: 8 },
  listHeaderLeft: { fontSize: 12, fontWeight: 'bold', color: '#888', flex: 1 },
  listHeaderRight: { fontSize: 12, fontWeight: 'bold', color: '#888', width: 80, textAlign: 'right' },
  
  listItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9f9f9' },
  listItemLeft: { fontSize: 13, color: '#555', flex: 1, paddingRight: 10 },
  listItemRight: { fontSize: 14, color: '#333', width: 90, textAlign: 'right' }
});