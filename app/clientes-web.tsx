// app/clientes-web.tsx
import { useRouter } from 'expo-router';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db as firestore } from '../src/config/firebase.config';

export default function ClientesWebScreen() {
  const router = useRouter();
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // APUNTAMOS A 'clients' QUE ES DONDE EL AuthModal.tsx GUARDA EL REGISTRO
    const q = query(collection(firestore, 'clients'), where('status', '==', 'pending'));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendientes(data);
      setLoading(false);
    });
  }, []);

  const handleAprobar = async (id: string, lista: string) => {
    try {
      await updateDoc(doc(firestore, 'clients', id), {
        status: 'active',
        priceList: lista,
        defaultList: lista // Sincronizamos ambos campos por seguridad
      });
      Alert.alert("¡Aprobado!", "El cliente ya puede operar.");
    } catch (e) {
      Alert.alert("Error", "No se pudo aprobar el cliente.");
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={{marginBottom: 20}}>
        <Text style={{color: '#007AFF', fontWeight: 'bold'}}>← Volver</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Registros Web ({pendientes.length})</Text>
      {loading ? <ActivityIndicator size="large" /> : (
        <FlatList 
          data={pendientes}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.name}>{item.businessName}</Text>
              <Text style={{color: '#666'}}>{item.email}</Text>
              <Text style={{fontSize: 12, marginTop: 5}}>Dir: {item.address}</Text>
              <View style={styles.btnRow}>
                {['list1', 'list2', 'list3'].map(l => (
                  <TouchableOpacity key={l} style={styles.btnLista} onPress={() => handleAprobar(item.id, l)}>
                    <Text style={styles.btnText}>{l.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 50, backgroundColor: '#f5f5f5' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 2 },
  name: { fontSize: 16, fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btnLista: { backgroundColor: '#34C759', padding: 10, borderRadius: 5, flex: 1, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' }
});