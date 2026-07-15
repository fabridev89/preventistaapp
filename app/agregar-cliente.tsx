// app/agregar-cliente.tsx
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { doc, setDoc } from 'firebase/firestore';
import localDb from '../src/config/database';
import { db as firestore } from '../src/config/firebase.config';
import { useAuthStore } from '../src/store/useAuthStore';

export default function AgregarClientScreen() {
  const router = useRouter();

  const { businessId } = useAuthStore();

  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(''); 
  
  const [selectedDay, setSelectedDay] = useState<'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes'>('Lunes');
  const [selectedList, setSelectedList] = useState<'list1' | 'list2' | 'list3'>('list1');

  const [isSaving, setIsSaving] = useState(false);

  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const lists = ['list1', 'list2', 'list3'];

  const handleSave = async () => {
    if (isSaving) return;

    if (!businessName || !address) {
      if (Platform.OS === 'web') {
        window.alert('Datos incompletos: El nombre del negocio y la dirección son obligatorios.');
      } else {
        Alert.alert('Datos incompletos', 'El nombre del negocio y la dirección son obligatorios.');
      }
      return;
    }

    if (!businessId && Platform.OS === 'web') {
      window.alert("Error de sesión: No se detecta tu empresa.");
      return;
    }

    setIsSaving(true); 

    const newId = `CLI-${Date.now()}`;
    const cleanEmail = email.trim().toLowerCase();

    const newClient = {
      id: newId,
      businessId: businessId, 
      businessName,
      address,
      phone,
      email: cleanEmail,
      visitDay: selectedDay,
      defaultList: selectedList,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: 'SYNCED'
    };

    try {
      if (Platform.OS === 'web') {
        await setDoc(doc(firestore, 'clients', newId), newClient);
      } else {
        await localDb.runAsync(
          `INSERT OR REPLACE INTO clients (id, businessName, address, phone, email, visitDay, defaultList, createdAt, updatedAt, syncStatus) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId, businessName, address, phone, cleanEmail, selectedDay, selectedList, Date.now(), Date.now(), 'PENDING']
        );
        
        try {
          await setDoc(doc(firestore, 'clients', newId), newClient);
          await localDb.runAsync(`UPDATE clients SET syncStatus = 'SYNCED' WHERE id = ?`, [newId]);
        } catch (e) { console.log("Se sincronizará luego."); }
      }

      if (cleanEmail.includes('@') && businessId) {
        try {
          await setDoc(doc(firestore, 'whitelist', cleanEmail), {
            email: cleanEmail,
            assignedList: selectedList,
            businessId: businessId,
            updatedAt: Date.now()
          }, { merge: true });
        } catch (err) {
          console.log("Error creando la whitelist: ", err);
        }
      }

      if (Platform.OS === 'web') {
        window.alert('¡Client Guardado exitosamente!');
        router.back(); 
      } else {
        Alert.alert('¡Client Guardado!', 'El client se guardó correctamente.', [
          { text: 'Genial', onPress: () => router.back() }
        ]);
      }
    } catch (error: any) {
      console.error("Error guardando client:", error);
      if (Platform.OS === 'web') window.alert(`Error: No se pudo guardar.`);
      else Alert.alert('Error', 'No se pudo guardar.');
      setIsSaving(false); 
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Client</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nombre del Local / Kiosco *</Text>
          <TextInput 
            style={styles.input} 
            value={businessName} 
            onChangeText={setBusinessName} 
            placeholder="Ej. Kiosco El Sol"
            editable={!isSaving}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Dirección *</Text>
          <TextInput 
            style={styles.input} 
            value={address} 
            onChangeText={setAddress} 
            placeholder="Ej. Av. San Martín 1500"
            editable={!isSaving}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Teléfono / WhatsApp</Text>
          <TextInput 
            style={styles.input} 
            value={phone} 
            onChangeText={setPhone} 
            placeholder="Ej. 3512345678"
            keyboardType="phone-pad"
            editable={!isSaving}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Correo (Email)</Text>
          <TextInput 
            style={styles.input} 
            value={email} 
            onChangeText={setEmail} 
            placeholder="client@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!isSaving}
          />
        </View>

        <Text style={styles.sectionTitle}>Día de Visita</Text>
        <View style={styles.chipsContainer}>
          {days.map((day) => (
            <TouchableOpacity 
              key={day} 
              style={[styles.chip, selectedDay === day && styles.chipActive, isSaving && { opacity: 0.5 }]}
              onPress={() => !isSaving && setSelectedDay(day as any)}
            >
              <Text style={[styles.chipText, selectedDay === day && styles.chipTextActive]}>{day}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Lista de Precios Asignada</Text>
        <View style={styles.chipsContainer}>
          {lists.map((list) => (
            <TouchableOpacity 
              key={list} 
              style={[styles.chip, selectedList === list && styles.chipActive, isSaving && { opacity: 0.5 }]}
              onPress={() => !isSaving && setSelectedList(list as any)}
            >
              <Text style={[styles.chipText, selectedList === list && styles.chipTextActive]}>
                {list.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity 
          style={[styles.saveButton, isSaving && { backgroundColor: '#a8dab5' }]} 
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>💾 Guardar Client</Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: Platform.OS === 'web' ? 10 : 50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 },
  backButton: { fontSize: 16, color: '#007AFF', fontWeight: 'bold' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  formContainer: { paddingHorizontal: 20, paddingBottom: 50 },
  inputGroup: { marginBottom: 15 },
  label: { fontSize: 14, color: '#555', marginBottom: 6, fontWeight: '600' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 12, fontSize: 16, color: '#333' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#666', marginTop: 10, marginBottom: 10 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: { backgroundColor: '#e0e0e0', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20 },
  chipActive: { backgroundColor: '#007AFF' },
  chipText: { fontSize: 14, color: '#555', fontWeight: 'bold' },
  chipTextActive: { color: '#fff' },
  saveButton: { backgroundColor: '#34C759', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginTop: 10, minHeight: 54, justifyContent: 'center' },
  saveButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});