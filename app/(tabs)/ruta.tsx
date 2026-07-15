// app/(tabs)/ruta.tsx
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { collection, deleteDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as XLSX from 'xlsx';
import localDb from '../../src/config/database';
import { db as firestore } from '../../src/config/firebase.config';
import { syncClientsToLocal, syncPendingClients } from '../../src/services/syncService';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useClientStore } from '../../src/store/useClientStore';
import { Client } from '../../src/types/client';

export default function RutaScreen() {
  const router = useRouter();
  const setActiveClient = useClientStore((state) => state.setActiveClient);
  const businessId = useAuthStore((state) => state.businessId);

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedDay, setSelectedDay] = useState('Lunes');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [isExporting, setIsExporting] = useState(false); 

  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

  const loadClients = async () => {
    try {
      if (Platform.OS === 'web') {
        if (!businessId) return;
        const q = query(
          collection(firestore, 'clients'), 
          where('businessId', '==', businessId),
          where('visitDay', '==', selectedDay)
        );
        const snapshot = await getDocs(q);
        const webClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[];
        webClients.sort((a, b) => a.businessName.localeCompare(b.businessName));
        setClients(webClients);
      } else {
        const result = await localDb.getAllAsync<Client>(
          'SELECT * FROM clients WHERE visitDay = ? ORDER BY businessName ASC',
          [selectedDay]
        );
        setClients(result);
      }
    } catch (error) {
      console.error("Error cargando clientes:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadClients();
    }, [selectedDay, businessId])
  );

  const handleSelectClient = (client: Client) => {
    setActiveClient(client);
    router.push('/catalogo' as any);
  };

  const handleSyncClients = async () => {
    if (Platform.OS === 'web') {
      Alert.alert("Aviso", "En la web los datos siempre están sincronizados en tiempo real.");
      await loadClients();
      return;
    }
    
    setIsSyncing(true);
    await syncPendingClients();
    const result = await syncClientsToLocal();
    setIsSyncing(false);
    Alert.alert(result.success ? "Éxito" : "Error", "La base de clientes está 100% sincronizada.");
    if (result.success) await loadClients();
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      let allClients: Client[] = [];
      
      if (Platform.OS === 'web') {
        if (!businessId) {
          window.alert("Sesión no válida para exportar.");
          setIsExporting(false);
          return;
        }
        const q = query(collection(firestore, 'clients'), where('businessId', '==', businessId));
        const snap = await getDocs(q);
        allClients = snap.docs.map(d => d.data() as Client);
      } else {
        allClients = await localDb.getAllAsync<Client>('SELECT * FROM clients ORDER BY businessName ASC');
      }

      if (allClients.length === 0) {
        if (Platform.OS === 'web') window.alert("No hay clientes para exportar.");
        else Alert.alert("Atención", "No hay clientes registrados.");
        setIsExporting(false);
        return;
      }

      const dataToExport = allClients.map(c => ({
        Cliente: c.businessName,
        DIRECCION: c.address || '',
        TELEFONO: c.phone || '',
        'Correo (Email)': c.email || '',
        ListaPrecio: c.defaultList ? c.defaultList.replace('list', '') : '1',
        DIA: c.visitDay || 'Lunes'
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

      if (Platform.OS === 'web') {
        XLSX.writeFile(workbook, "Respaldos_Clientes.xlsx");
      } else {
        const base64Data = XLSX.write(workbook, { type: 'base64' });
        const fileUri = FileSystem.documentDirectory + "Respaldos_Clientes.xlsx";
        await FileSystem.writeAsStringAsync(fileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(fileUri, { 
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
          dialogTitle: 'Exportar Base de Clientes' 
        });
      }
    } catch (error) {
      console.error("Error exportando clientes:", error);
      if (Platform.OS === 'web') window.alert("Ocurrió un error al exportar el archivo.");
      else Alert.alert("Error", "Ocurrió un error al exportar el archivo.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;
      setIsImporting(true);

      let data: any[] = [];

      if (Platform.OS === 'web') {
        const file = result.assets[0].file; 
        if (!file) throw new Error("No se pudo obtener el archivo.");
        
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(sheet);
      } else {
        const fileUri = result.assets[0].uri;
        const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
        const workbook = XLSX.read(fileContent, { type: 'base64' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(sheet);
      }

      let count = 0;
      const batch = writeBatch(firestore); 

      for (const row of data) {
        const businessName = (row.Cliente || '').toString().toUpperCase();
        if (!businessName) continue;

        const newId = `CLI-${Date.now()}-${count}`;
        const address = row.DIRECCION || '';
        const phone = row.TELEFONO ? row.TELEFONO.toString() : '';
        const email = row['Correo (Email)'] ? row['Correo (Email)'].toString().trim().toLowerCase() : ''; 
        
        const rawList = row.ListaPrecio || '1';
        const defaultList = `list${rawList.toString().replace(/\D/g, '') || '1'}`;

        const rawDay = (row.DIA || 'Lunes').toString().toLowerCase();
        const visitDay = rawDay.charAt(0).toUpperCase() + rawDay.slice(1);

        if (Platform.OS === 'web') {
           if (!businessId) continue;
           const clientRef = doc(firestore, 'clients', newId);
           batch.set(clientRef, {
              id: newId,
              businessId: businessId,
              businessName,
              address,
              phone,
              email: email,
              defaultList,
              visitDay,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              syncStatus: 'SYNCED',
              status: 'active'
           });
        } else {
           await localDb.runAsync(
             `INSERT OR REPLACE INTO clients 
             (id, businessName, address, phone, email, defaultList, visitDay, createdAt, updatedAt, syncStatus) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
             [newId, businessName, address, phone, email, defaultList, visitDay, Date.now(), Date.now(), 'PENDING']
           );
        }

        // 👇 ¡LA MAGIA DE LA WHITELIST DIRECTO DESDE EL EXCEL! 👇
        if (email.includes('@') && businessId) {
          const whitelistRef = doc(firestore, 'whitelist', email);
          batch.set(whitelistRef, {
            email: email,
            assignedList: defaultList,
            businessId: businessId,
            updatedAt: Date.now()
          }, { merge: true });
        }

        count++;
      }

      // Ejecutamos el guardado de forma global (clientes en Web + whitelist en Web y App)
      if (count > 0) {
         try {
           await batch.commit(); 
         } catch (e) {
           console.log("Sincronización en segundo plano de la whitelist pendiente...", e);
         }
      }

      setIsImporting(false);
      
      if (Platform.OS === 'web') {
         window.alert(`¡Importación Exitosa! Se procesaron y subieron ${count} clientes a la nube.`);
      } else {
         Alert.alert("¡Importación Exitosa!", `Se procesaron ${count} clientes. Toca "🔄 Sync" para subirlos.`);
      }
      
      loadClients();

    } catch (error) {
      console.error("Error importando Excel:", error);
      setIsImporting(false);
      if (Platform.OS === 'web') {
         window.alert("Error: No se pudo leer el archivo Excel. Verificá el formato.");
      } else {
         Alert.alert("Error", "No se pudo leer el archivo Excel.");
      }
    }
  };

  const handleDeleteClient = async (id: string, name: string) => {
    if (Platform.OS === 'web') {
      const confirmado = window.confirm(`Eliminar Cliente\n\n¿Estás seguro de que querés eliminar a ${name}? Esta acción no se puede deshacer.`);
      if (confirmado) {
        try {
          await deleteDoc(doc(firestore, 'clients', id));
          window.alert("El cliente fue borrado con éxito.");
          loadClients(); 
        } catch (error) {
          window.alert("Ocurrió un problema al intentar eliminar el cliente.");
        }
      }
    } else {
      Alert.alert(
        "Eliminar Cliente",
        `¿Estás seguro de que querés eliminar a ${name}? Esta acción no se puede deshacer.`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Eliminar",
            style: "destructive",
            onPress: async () => {
              try {
                await localDb.runAsync('DELETE FROM clients WHERE id = ?', [id]);
                await deleteDoc(doc(firestore, 'clients', id));

                Alert.alert("Eliminado", "El cliente fue borrado con éxito.");
                loadClients(); 
              } catch (error) {
                console.error("Error eliminando cliente:", error);
                Alert.alert("Error", "Ocurrió un problema al intentar eliminar el cliente.");
              }
            }
          }
        ]
      );
    }
  };

  const handleWipeAllClients = async () => {
    if (Platform.OS === 'web') {
      const confirmado = window.confirm("⚠️ VACIAR HOJA DE RUTA\n\n¿Estás seguro de borrar TODOS los clientes de forma definitiva?");
      if (confirmado) {
        setIsWiping(true);
        try {
          if (businessId) {
            const q = query(collection(firestore, 'clients'), where('businessId', '==', businessId));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
              let batch = writeBatch(firestore);
              let count = 0;

              for (const document of snapshot.docs) {
                batch.delete(document.ref);
                count++;

                if (count >= 400) {
                  await batch.commit();
                  batch = writeBatch(firestore);
                  count = 0;
                }
              }
              if (count > 0) await batch.commit();
            }
          }
          setIsWiping(false);
          window.alert("Se eliminaron todos los clientes correctamente.");
          loadClients();
        } catch (error) {
          setIsWiping(false);
          window.alert("No se pudo vaciar la lista de clientes.");
        }
      }
    } else {
      Alert.alert(
        "⚠️ VACIAR HOJA DE RUTA",
        "¿Estás seguro de borrar TODOS los clientes? Se eliminarán de este teléfono y de la nube por completo.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Sí, borrar todo",
            style: "destructive",
            onPress: async () => {
              setIsWiping(true);
              try {
                await localDb.runAsync('DELETE FROM clients');

                if (businessId) {
                  const q = query(collection(firestore, 'clients'), where('businessId', '==', businessId));
                  const snapshot = await getDocs(q);

                  if (!snapshot.empty) {
                    let batch = writeBatch(firestore);
                    let count = 0;

                    for (const document of snapshot.docs) {
                      batch.delete(document.ref);
                      count++;

                      if (count >= 400) {
                        await batch.commit();
                        batch = writeBatch(firestore);
                        count = 0;
                      }
                    }
                    if (count > 0) await batch.commit();
                  }
                }

                setIsWiping(false);
                Alert.alert("Limpieza Completa", "Se eliminaron todos los clientes correctamente.");
                loadClients();
              } catch (error) {
                console.error("Error vaciando clientes:", error);
                setIsWiping(false);
                Alert.alert("Error", "No se pudo vaciar la lista de clientes.");
              }
            }
          }
        ]
      );
    }
  };

  const filteredClients = useMemo(() => {
    return clients.filter(c => 
      c.businessName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [clients, searchQuery]);

  return (
    <View style={styles.container}>
      
      <View style={styles.header}>
        <Text style={styles.title}>Hoja de Ruta</Text>
        <Text style={styles.subtitle}>Gestiona tu base y visitas diarias</Text>
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput 
          style={styles.searchInput} 
          placeholder="Buscar cliente por nombre..." 
          placeholderTextColor="#999" 
          value={searchQuery} 
          onChangeText={setSearchQuery} 
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
            <Text style={styles.clearSearchText}>✖</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.toolbarWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarScroll}>
          
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#34C759' }]} onPress={() => router.push('/agregar-cliente' as any)}>
            <Text style={styles.actionBtnText}>➕ Nuevo Cliente</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF9500' }]} onPress={handleSyncClients} disabled={isSyncing}>
            {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.actionBtnText}>🔄 Sincronizar</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#e6f7eb', borderColor: '#a8dab5', borderWidth: 1 }]} onPress={handleExportExcel} disabled={isExporting}>
            {isExporting ? <ActivityIndicator size="small" color="#135C58" /> : <Text style={[styles.actionBtnText, { color: '#135C58' }]}>📤 Exportar Excel</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#e6f7eb', borderColor: '#a8dab5', borderWidth: 1 }]} onPress={handleImportCSV} disabled={isImporting}>
            {isImporting ? <ActivityIndicator size="small" color="#135C58" /> : <Text style={[styles.actionBtnText, { color: '#135C58' }]}>📥 Importar Excel</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#ffebe9', borderColor: '#ffc1bd', borderWidth: 1 }]} onPress={handleWipeAllClients} disabled={isWiping}>
            {isWiping ? <ActivityIndicator size="small" color="#FF3B30" /> : <Text style={[styles.actionBtnText, { color: '#FF3B30' }]}>🗑️ Vaciar Todo</Text>}
          </TouchableOpacity>

        </ScrollView>
      </View>

      <View style={styles.daysWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysScroll}>
          {days.map((day) => (
            <TouchableOpacity
              key={day}
              style={[styles.dayChip, selectedDay === day && styles.dayChipActive]}
              onPress={() => setSelectedDay(day)}
            >
              <Text style={[styles.dayChipText, selectedDay === day && styles.dayChipTextActive]}>
                {day}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {filteredClients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {clients.length === 0 
              ? `No hay clientes para el día ${selectedDay}.` 
              : `No se encontraron resultados para "${searchQuery}".`}
          </Text>
          <Text style={styles.emptySubText}>
            {clients.length === 0 
              ? 'Tocá "➕ Nuevo Cliente" o importá tu Excel.' 
              : 'Intentá buscar con otro nombre.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredClients}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.clientCard} onPress={() => handleSelectClient(item)}>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{item.businessName}</Text>
                {item.address ? <Text style={styles.clientAddress}>📍 {item.address}</Text> : null}
                {item.phone ? <Text style={styles.clientPhone}>📞 {item.phone}</Text> : null}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.defaultList.toUpperCase()}</Text>
                </View>

                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => router.push(`/editar-cliente?id=${item.id}` as any)}
                >
                  <Text style={{ fontSize: 13 }}>✏️</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteClient(item.id, item.businessName)}
                >
                  <Text style={{ fontSize: 13 }}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: Platform.OS === 'web' ? 20 : 50 },
  
  header: { paddingHorizontal: 20, marginBottom: 15 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#135C58' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },

  searchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#e0e0e0', 
    marginHorizontal: 20, 
    borderRadius: 10, 
    paddingHorizontal: 12, 
    marginBottom: 15, 
    height: 44 
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#333' },
  clearSearchBtn: { padding: 4 },
  clearSearchText: { color: '#888', fontSize: 16, fontWeight: 'bold' },

  toolbarWrapper: { marginBottom: 20 },
  toolbarScroll: { paddingHorizontal: 20, gap: 10, alignItems: 'center' },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, justifyContent: 'center', alignItems: 'center', elevation: 1 },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  daysWrapper: { marginBottom: 15 },
  daysScroll: { paddingHorizontal: 20, gap: 10 },
  dayChip: { backgroundColor: '#e0e0e0', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  dayChipActive: { backgroundColor: '#007AFF' },
  dayChipText: { fontSize: 14, color: '#555', fontWeight: 'bold' },
  dayChipTextActive: { color: '#fff' },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 16, fontWeight: 'bold', color: '#666', marginBottom: 6, textAlign: 'center' },
  emptySubText: { fontSize: 14, color: '#999', textAlign: 'center' },

  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  clientCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  clientInfo: { flex: 1, marginRight: 5 },
  clientName: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  clientAddress: { fontSize: 12, color: '#666', marginBottom: 2 },
  clientPhone: { fontSize: 11, color: '#888' },

  badge: { backgroundColor: '#34C759', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  editBtn: { backgroundColor: '#f0f0f0', padding: 8, borderRadius: 8 },
  deleteBtn: { backgroundColor: '#ffebe9', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ffd1cf' }
});