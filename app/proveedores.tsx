// app/proveedores.tsx
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as XLSX from 'xlsx';
import localDb from '../src/config/database';

export default function ProveedoresScreen() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const loadSuppliers = async () => {
    try {
      const result = await localDb.getAllAsync<any>('SELECT * FROM suppliers ORDER BY name ASC');
      setSuppliers(result);
    } catch (error) {
      console.error("Error cargando proveedores:", error);
    }
  };

  // Usamos useFocusEffect para que recargue la lista al volver de agregar uno a mano
  useFocusEffect(
    useCallback(() => {
      loadSuppliers();
    }, [])
  );

  const handleImportCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;
      setIsImporting(true);

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
      
      const workbook = XLSX.read(fileContent, { type: 'base64' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data: any[] = XLSX.utils.sheet_to_json(sheet);

      let count = 0;

      for (const row of data) {
        if (!row.Nombre && !row.name) continue;

        const newId = `SUP-${Date.now()}-${count}`;
        const name = (row.Nombre || row.name || 'PROVEEDOR SIN NOMBRE').toUpperCase().trim();
        const phone = (row.Teléfono || row.telefono || row.phone || '').toString().trim();
        const address = (row.Dirección || row.direccion || row.address || '').trim();
        const defaultPaymentMethod = (row['Forma de pago'] || row.forma_pago || 'EFECTIVO').trim();
        const deliveryDay = (row['Día de entrega'] || row.dia_entrega || 'Lunes').trim();

        await localDb.runAsync(
          `INSERT OR REPLACE INTO suppliers 
          (id, name, phone, address, defaultPaymentMethod, deliveryDay, createdAt, syncStatus) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId, name, phone, address, defaultPaymentMethod, deliveryDay, Date.now(), 'PENDING']
        );
        count++;
      }

      setIsImporting(false);
      Alert.alert("¡Importación Exitosa!", `Se cargaron ${count} proveedores desde el archivo.\n\nNo olvides presionar "Sync" en la Hoja de Ruta para subirlos a la nube.`);
      loadSuppliers();

    } catch (error) {
      console.error("Error importando archivo:", error);
      setIsImporting(false);
      Alert.alert("Error", "No se pudo leer el archivo. Asegurate de que tenga encabezados válidos.");
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mis Proveedores</Text>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.importBtn} onPress={handleImportCSV} disabled={isImporting}>
            {isImporting ? <ActivityIndicator size="small" color="#135C58" /> : <Text style={styles.importBtnText}>📥 CSV</Text>}
          </TouchableOpacity>

          {/* 👇 NUEVO BOTÓN PARA AGREGAR MANUALMENTE 👇 */}
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/agregar-proveedor' as any)}>
            <Text style={styles.addBtnText}>➕</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TextInput 
        style={styles.searchBar}
        placeholder="🔍 Buscar proveedor..."
        value={search}
        onChangeText={setSearch}
      />

      <FlatList 
        data={filteredSuppliers}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 15 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.supplierName}>👤 {item.name}</Text>
            {item.phone ? <Text style={styles.supplierDetail}>📞 Teléfono: {item.phone}</Text> : null}
            {item.address ? <Text style={styles.supplierDetail}>📍 Dirección: {item.address}</Text> : null}
            <View style={styles.rowInfo}>
              <Text style={styles.badge}>💰 {item.defaultPaymentMethod || 'EFECTIVO'}</Text>
              <Text style={styles.badge}>🚚 Entrega: {item.deliveryDay || 'Lunes'}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No se encontraron proveedores.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#135C58', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 15 },
  backBtn: { paddingRight: 10 },
  backIcon: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  headerActions: { flexDirection: 'row', gap: 8 },
  importBtn: { backgroundColor: '#a7e8b6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, elevation: 1, justifyContent: 'center' },
  importBtnText: { color: '#135C58', fontWeight: 'bold', fontSize: 13 },
  addBtn: { backgroundColor: '#34C759', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6, elevation: 1, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  searchBar: { margin: 15, backgroundColor: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', fontSize: 16 },
  
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 15, marginBottom: 12, elevation: 1, borderWidth: 1, borderColor: '#e0e0e0' },
  supplierName: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 6 },
  supplierDetail: { fontSize: 13, color: '#666', marginBottom: 3 },
  rowInfo: { flexDirection: 'row', gap: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 8 },
  badge: { fontSize: 12, backgroundColor: '#e6f7eb', color: '#135C58', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 20 }
});