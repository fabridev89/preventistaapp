// app/editar-cliente.tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import localDb from '../src/config/database';

// 👇 IMPORTACIONES FIREBASE Y AUTH 👇
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db as firestore } from '../src/config/firebase.config';
import { useAuthStore } from '../src/store/useAuthStore';

export default function EditarClienteScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  // Traemos el businessId para la whitelist
  const { businessId } = useAuthStore();

  const clientId = Array.isArray(id) ? id[0] : id;

  const [isLoading, setIsLoading] = useState(true);
  
  // 👇 NUEVO ESTADO PARA EL CÓDIGO INTERNO 👇
  const [internalCode, setInternalCode] = useState('');
  
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(''); 
  const [visitDay, setVisitDay] = useState('Lunes');
  const [defaultList, setDefaultList] = useState('list1');

  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const lists = ['list1', 'list2', 'list3'];

  useEffect(() => {
    const loadClient = async () => {
      if (!clientId) return;
      try {
        if (Platform.OS === 'web') {
          // --- LECTURA WEB (FIREBASE) ---
          const docRef = doc(firestore, 'clients', clientId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const client = docSnap.data();
            // 👇 CARGAMOS EL CÓDIGO INTERNO DESDE FIREBASE 👇
            setInternalCode(client.internalCode || '');
            
            setBusinessName(client.businessName || '');
            setAddress(client.address || '');
            setPhone(client.phone || '');
            setEmail(client.email || '');
            setVisitDay(client.visitDay || 'Lunes');
            setDefaultList(client.defaultList || 'list1');
          }
        } else {
          // --- LECTURA CELULAR (SQLITE) ---
          const result = await localDb.getAllAsync<any>('SELECT * FROM clients WHERE id = ?', [clientId]);
          if (result.length > 0) {
            const client = result[0];
            
            // 👇 CARGAMOS EL CÓDIGO INTERNO DESDE SQLITE 👇
            setInternalCode(client.internalCode || '');
            
            setBusinessName(client.businessName);
            setAddress(client.address);
            setPhone(client.phone || '');
            setEmail(client.email || '');
            setVisitDay(client.visitDay);
            setDefaultList(client.defaultList);
          }
        }
      } catch (error) {
        console.error("Error cargando cliente:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadClient();
  }, [clientId]);

  const handleSave = async () => {
    // 👇 Validación: Ahora el código también puede ser obligatorio si querés,
    // pero por defecto lo dejo opcional como estaba en el Excel.
    if (!businessName || !address) {
      if (Platform.OS === 'web') window.alert("El nombre y la dirección son obligatorios.");
      else Alert.alert("Error", "El nombre y la dirección son obligatorios.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    
    // 👇 Limpiamos y preparamos el código
    const cleanCode = internalCode.trim();

    const updatedClient = {
      // 👇 INCLUIMOS EL CÓDIGO INTERNO EN EL OBJETO DE ACTUALIZACIÓN 👇
      internalCode: cleanCode,
      businessName, 
      address, 
      phone, 
      email: cleanEmail, 
      visitDay, 
      defaultList, 
      updatedAt: Date.now()
    };

    try {
      if (Platform.OS === 'web') {
        // --- GUARDADO WEB ---
        await updateDoc(doc(firestore, 'clients', clientId), updatedClient);
      } else {
        // --- GUARDADO CELULAR ---
        await localDb.runAsync(
          `UPDATE clients 
            SET internalCode = ?, businessName = ?, address = ?, phone = ?, email = ?, visitDay = ?, defaultList = ?, updatedAt = ?, syncStatus = 'PENDING'
            WHERE id = ?`,
          [cleanCode, businessName, address, phone, cleanEmail, visitDay, defaultList, Date.now(), clientId]
        );
        // Intentamos subirlo a Firebase rápido
        try {
          await updateDoc(doc(firestore, 'clients', clientId), updatedClient);
          await localDb.runAsync(`UPDATE clients SET syncStatus = 'SYNCED' WHERE id = ?`, [clientId]);
        } catch (e) { console.log("Se sincronizará luego."); }
      }

      // 👇 ¡MAGIA! ACTUALIZACIÓN DE LA WHITELIST EN FIREBASE 👇
      // Si el cliente tiene un correo válido, lo metemos en la whitelist con su lista de precios
      if (cleanEmail.includes('@') && businessId) {
        try {
          await setDoc(doc(firestore, 'whitelist', cleanEmail), {
            email: cleanEmail,
            assignedList: defaultList,
            businessId: businessId,
            updatedAt: Date.now()
          }, { merge: true });
        } catch (err) {
          console.log("Error actualizando la whitelist: ", err);
        }
      }

      if (Platform.OS === 'web') {
        window.alert("¡Cliente actualizado correctamente!");
        router.back();
      } else {
        Alert.alert("Éxito", "Cliente actualizado correctamente.", [
          { text: "OK", onPress: () => router.back() }
        ]);
      }
    } catch (error) {
      console.error("Error actualizando cliente:", error);
      if (Platform.OS === 'web') window.alert("No se pudo actualizar el cliente.");
      else Alert.alert("Error", "No se pudo actualizar el cliente.");
    }
  };

  if (isLoading) return <ActivityIndicator size="large" color="#34C759" style={{ flex: 1 }} />;

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar Cliente</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.formContainer}>
        {/* 👇 NUEVO CAMPO DE ENTRADA PARA EL CÓDIGO DEL CLIENTE 👇 */}
        <Text style={styles.label}>Código del Cliente</Text>
        <TextInput 
          style={styles.input} 
          value={internalCode} 
          onChangeText={setInternalCode} 
          placeholder="Ej: 80" 
          keyboardType="default" // O numeric si solo usás números
        />

        <Text style={styles.label}>Nombre del Local *</Text>
        <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholder="Ej: Kiosco Don Carlos" />

        <Text style={styles.label}>Dirección *</Text>
        <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Calle y número" />

        <Text style={styles.label}>Teléfono</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Ej: 351..." keyboardType="phone-pad" />

        <Text style={styles.label}>Correo (Email)</Text>
        <TextInput 
          style={styles.input} 
          value={email} 
          onChangeText={setEmail} 
          placeholder="cliente@email.com" 
          keyboardType="email-address" 
          autoCapitalize="none"
        />

        <Text style={styles.label}>Día de Visita</Text>
        <View style={styles.chipContainer}>
          {days.map(day => (
            <TouchableOpacity key={day} style={[styles.chip, visitDay === day && styles.chipActive]} onPress={() => setVisitDay(day)}>
              <Text style={[styles.chipText, visitDay === day && styles.chipTextActive]}>{day}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Lista de Precios</Text>
        <View style={styles.chipContainer}>
          {lists.map(list => (
            <TouchableOpacity key={list} style={[styles.chip, defaultList === list && styles.chipActive]} onPress={() => setDefaultList(list)}>
              <Text style={[styles.chipText, defaultList === list && styles.chipTextActive]}>{list.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Guardar Cambios</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#34C759', paddingTop: Platform.OS === 'web' ? 20 : 50, paddingBottom: 15, paddingHorizontal: 15 },
  backBtn: { padding: 5 },
  backIcon: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  formContainer: { padding: 20 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 5, marginTop: 15 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 12, fontSize: 16, color: '#333' },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 5 },
  chip: { backgroundColor: '#e0e0e0', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  chipActive: { backgroundColor: '#007AFF' },
  chipText: { color: '#555', fontWeight: 'bold', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#34C759', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginTop: 30, elevation: 2 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});