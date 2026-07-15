// app/(tabs)/ajustes.tsx
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
// IMPORTAMOS PLATFORM PARA SABER SI ESTAMOS EN LA WEB
import { ActivityIndicator, Alert, Image, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import localDb from '../../src/config/database';
import { auth } from '../../src/config/firebase.config';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useBrandStore } from '../../src/store/useBrandStore';

export default function AjustesScreen() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const { businessId, vendorName, logout } = useAuthStore();
  
  const { logoUri, businessName, setBrand } = useBrandStore();

  useEffect(() => {
    const loadBrandSettings = async () => {
      try {
        const res: any = await localDb.getAllAsync('SELECT * FROM brand_settings WHERE id = 1');
        if (res.length > 0) {
          setBrand(res[0].logoUri, res[0].businessName || '', res[0].primaryColor || '#135C58');
        }
      } catch (e) {
        console.log("Error inicializando marca blanca en Ajustes", e);
      }
    };
    loadBrandSettings();
  }, []);

  const handleShareLink = async () => {
    if (!businessId) {
      Alert.alert("Error", "No se encontró el ID de la distribuidora.");
      return;
    }
    const catalogoUrl = `https://preventistaapp.web.app/${businessId}`;
    const mensaje = `¡Hola! Acá tenés nuestro catálogo online para hacer tus pedidos de forma rápida y fácil: \n\n${catalogoUrl}`;
    try {
      await Share.share({ message: mensaje });
    } catch (error) {
      console.error('Error al compartir:', error);
    }
  };

  // Función separada para que la puedan usar tanto la web como el celular
  const executeLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut(auth);
      logout();
      router.replace('/');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      setIsLoggingOut(false);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      // 🌐 LÓGICA PARA LA WEB (El Alert nativo de RN se marea acá)
      const confirmLogout = window.confirm("¿Estás seguro de que querés salir de tu cuenta?");
      if (confirmLogout) {
        executeLogout();
      }
    } else {
      // 📱 LÓGICA PARA EL CELULAR
      Alert.alert(
        "Cerrar Sesión",
        "¿Estás seguro de que querés salir de tu cuenta?",
        [
          { text: "Cancelar", style: "cancel" },
          { 
            text: "Sí, salir", 
            style: "destructive", 
            onPress: executeLogout
          }
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ajustes</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.profileHeader}>
            
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(businessName || vendorName)?.charAt(0).toUpperCase() || 'V'}
                </Text>
              </View>
            )}

            <View style={styles.profileInfo}>
              <Text style={styles.vendorName}>{businessName || vendorName || 'Vendedor'}</Text>
              <Text style={styles.businessId}>ID: {businessId}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>CONFIGURACIÓN DE LA EMPRESA</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/ajustes/apariencia' as any)}>
            <Text style={styles.settingText}>🎨 Apariencia (Marca Blanca)</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />

          <TouchableOpacity style={styles.settingRow} onPress={handleShareLink}>
            <Text style={styles.settingText}>🌐 Compartir Catálogo Web</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          
          <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/reportes' as any)}>
            <Text style={styles.settingText}>📊 Reportes y Estadísticas</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={isLoggingOut}>
          {isLoggingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#135C58', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  content: { padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 25, padding: 15, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  profileHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  avatarImage: { width: 60, height: 60, borderRadius: 30, marginRight: 15, borderWidth: 1, borderColor: '#ddd' },
  profileInfo: { flex: 1 },
  vendorName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  businessId: { fontSize: 14, color: '#666', marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#888', marginBottom: 8, marginLeft: 5 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  settingText: { fontSize: 16, color: '#333' },
  arrow: { fontSize: 20, color: '#ccc' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 5 },
  logoutButton: { backgroundColor: '#FF3B30', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 10 },
  logoutButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});