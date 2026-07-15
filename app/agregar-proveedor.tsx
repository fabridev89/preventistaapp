// app/agregar-proveedor.tsx
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import localDb from '../src/config/database';

// 👇 IMPORTACIONES NUEVAS PARA FIREBASE Y AUTH 👇
import { doc, setDoc } from 'firebase/firestore';
import { db as firestore } from '../src/config/firebase.config';
import { useAuthStore } from '../src/store/useAuthStore';

export default function AgregarProveedorScreen() {
  const router = useRouter();
  
  // 👇 TRAEMOS EL ID DE LA EMPRESA 👇
  const { businessId } = useAuthStore();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [deliveryDay, setDeliveryDay] = useState('Lunes');

  const handleSave = async () => {
    if (!name.trim()) {
      if (Platform.OS === 'web') window.alert("Por favor ingresá el nombre del proveedor.");
      else Alert.alert("Requerido", "Por favor ingresá el nombre del proveedor.");
      return;
    }

    const newId = `SUP-${Date.now()}`;
    const timestamp = Date.now();

    try {
      if (Platform.OS === 'web') {
        // --- GUARDADO MODO WEB (FIREBASE DIRECTO) ---
        if (!businessId) {
          window.alert("Error: No se detectó tu sesión de usuario.");
          return;
        }

        const supRef = doc(firestore, 'suppliers', newId);
        await setDoc(supRef, {
          id: newId,
          businessId: businessId, // Etiquetado con tu empresa
          name: name.toUpperCase().trim(),
          phone: phone.trim(),
          address: address.trim(),
          defaultPaymentMethod: paymentMethod.toUpperCase().trim(),
          deliveryDay: deliveryDay.trim(),
          createdAt: timestamp,
          syncStatus: 'SYNCED'
        });

        window.alert("¡Éxito! Proveedor guardado correctamente.");
        router.back();
      } else {
        // --- GUARDADO MODO APP (SQLITE + FIREBASE) ---
        await localDb.runAsync(
          `INSERT INTO suppliers 
          (id, name, phone, address, defaultPaymentMethod, deliveryDay, createdAt, syncStatus) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId, 
            name.toUpperCase().trim(), 
            phone.trim(), 
            address.trim(), 
            paymentMethod.toUpperCase().trim(), 
            deliveryDay.trim(), 
            timestamp, 
            'PENDING'
          ]
        );

        // Intentamos subirlo a Firebase de inmediato
        try {
          const supRef = doc(firestore, 'suppliers', newId);
          await setDoc(supRef, {
            id: newId,
            businessId: businessId,
            name: name.toUpperCase().trim(),
            phone: phone.trim(),
            address: address.trim(),
            defaultPaymentMethod: paymentMethod.toUpperCase().trim(),
            deliveryDay: deliveryDay.trim(),
            createdAt: timestamp,
            syncStatus: 'SYNCED'
          });
          // Si sube bien, marcamos como sincronizado en local
          await localDb.runAsync(`UPDATE suppliers SET syncStatus = 'SYNCED' WHERE id = ?`, [newId]);
        } catch (e) {
          console.log("Guardado offline, se sincronizará luego.");
        }

        Alert.alert("¡Éxito!", "Proveedor guardado correctamente.", [
          { text: "OK", onPress: () => router.back() }
        ]);
      }
    } catch (error) {
      console.error("Error guardando proveedor:", error);
      if (Platform.OS === 'web') window.alert("Error: No se pudo guardar el proveedor.");
      else Alert.alert("Error", "No se pudo guardar el proveedor.");
    }
  };

  return (
    <View style={styles.container}>
      {/* Cabecera */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuevo Proveedor</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre del Proveedor *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ej: DISTRIBUIDORA ARCOR"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Teléfono</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ej: 3511234567"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dirección</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ej: Calle Principal 123"
              value={address}
              onChangeText={setAddress}
            />
          </View>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.label}>Forma de Pago</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Ej: EFECTIVO"
                value={paymentMethod}
                onChangeText={setPaymentMethod}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Día de Entrega</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Ej: Lunes"
                value={deliveryDay}
                onChangeText={setDeliveryDay}
              />
            </View>
          </View>

        </View>

        <TouchableOpacity style={styles.btnGuardar} onPress={handleSave}>
          <Text style={styles.btnGuardarText}>GUARDAR PROVEEDOR</Text>
        </TouchableOpacity>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#135C58', paddingTop: Platform.OS === 'web' ? 20 : 50, paddingBottom: 15, paddingHorizontal: 15 },
  backBtn: { padding: 5 },
  backIcon: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  content: { padding: 20 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, marginBottom: 20 },
  
  inputGroup: { marginBottom: 15 },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#fafafa', color: '#333' },
  
  btnGuardar: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 10, alignItems: 'center', elevation: 2 },
  btnGuardarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});