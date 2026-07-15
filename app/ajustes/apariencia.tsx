// app/ajustes/apariencia.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useBrandStore } from '../../src/store/useBrandStore';

export default function AparienciaScreen() {
  const router = useRouter();
  const { vendorName } = useAuthStore(); 
  const setBrand = useBrandStore((state) => state.setBrand);

  const [logo, setLogo] = useState<string | null>(null);
  const [empresaNombre, setEmpresaNombre] = useState(vendorName || '');

  useEffect(() => {
    const load = async () => {
      try {
        // UNIFICADO: Usamos AsyncStorage para ambas plataformas. 
        // Es rápido, no falla con migraciones y sirve para la web y la app.
        const savedLogo = await AsyncStorage.getItem('@brand_logo');
        const savedName = await AsyncStorage.getItem('@brand_name');
        
        if (savedLogo) setLogo(savedLogo);
        if (savedName) setEmpresaNombre(savedName);
      } catch (error) {
        console.error("Error cargando configuración de marca:", error);
      }
    };
    load();
  }, []);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], 
      quality: 0.3, // Comprimimos un poco para que guarde más rápido
      base64: true, // CLAVE: Lo guardamos en formato texto (base64) para que NUNCA se borre
    });

    if (!result.canceled && result.assets[0].base64) {
      setLogo(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleGuardarCambios = async () => {
    if (!empresaNombre.trim()) {
      if (Platform.OS === 'web') window.alert("El nombre de la distribuidora no puede estar vacío.");
      else Alert.alert("Atención", "El nombre de la distribuidora no puede estar vacío.");
      return;
    }

    try {
      // Guardado blindado
      await AsyncStorage.setItem('@brand_logo', logo || '');
      await AsyncStorage.setItem('@brand_name', empresaNombre.trim());
      
      // Actualizamos el store global (mando un color por defecto para que no se rompa tu store actual)
      setBrand(logo, empresaNombre.trim(), '#135C58');
      
      if (Platform.OS === 'web') {
        window.alert("¡La configuración se guardó correctamente!");
        router.back();
      } else {
        Alert.alert("¡Éxito!", "La configuración se guardó correctamente.", [
          { text: "OK", onPress: () => router.back() }
        ]);
      }
    } catch (error) {
      console.error("Error guardando apariencia:", error);
      if (Platform.OS === 'web') window.alert("Error: No se pudieron guardar los cambios.");
      else Alert.alert("Error", "No se pudieron guardar los cambios.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Marca Blanca</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        
        <View style={styles.section}>
          <Text style={styles.label}>Logo de la Empresa</Text>
          <TouchableOpacity style={styles.logoContainer} onPress={pickImage}>
            {logo ? (
              <Image source={{ uri: logo }} style={styles.logo} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text style={styles.logoPlaceholderText}>📷</Text>
              </View>
            )}
            <Text style={styles.subtitle}>Tocar para cambiar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Nombre para el Ticket / Catálogo</Text>
          <TextInput 
            style={styles.input}
            value={empresaNombre}
            onChangeText={setEmpresaNombre}
            placeholder="Ej: Distribuidora Centro"
          />
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnGuardar} onPress={handleGuardarCambios}>
          <Text style={styles.btnGuardarText}>GUARDAR CAMBIOS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#135C58', paddingTop: Platform.OS === 'web' ? 20 : 50, paddingBottom: 15, paddingHorizontal: 15 },
  backBtn: { padding: 5 },
  backIcon: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20, paddingBottom: 100 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, elevation: 1, borderWidth: 1, borderColor: '#e0e0e0' },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 15 },
  logoContainer: { alignItems: 'center' },
  logo: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: '#135C58', resizeMode: 'contain' },
  logoPlaceholder: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#e9ecef', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#ccc', borderStyle: 'dashed' },
  logoPlaceholderText: { fontSize: 50 },
  subtitle: { marginTop: 15, color: '#007AFF', fontWeight: 'bold', fontSize: 14 },
  input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, color: '#333' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 20, borderTopWidth: 1, borderTopColor: '#eee', elevation: 10 },
  btnGuardar: { backgroundColor: '#34C759', paddingVertical: 15, borderRadius: 10, alignItems: 'center' },
  btnGuardarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});