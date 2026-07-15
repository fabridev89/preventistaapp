// app/editar-producto.tsx
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import localDb from '../src/config/database';
import { useAuthStore } from '../src/store/useAuthStore';

import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db as firestore } from '../src/config/firebase.config';

// 👇 FUNCIÓN ANTIBOMBAS PARA LIMPIAR NÚMEROS SUCIOS ($1.500,00 -> 1500) 👇
const safeParseNumber = (val: string) => {
  if (!val) return 0;
  // Quitamos signos $, letras y espacios. Cambiamos coma por punto.
  const cleaned = val.toString().replace(/[^0-9.,-]/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export default function EditarProductoScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  
  const { businessId } = useAuthStore(); 

  const productId = Array.isArray(id) ? id[0] : id;
  const isEditing = !!productId; 

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const tempCode = `PROD-${Math.floor(Date.now() / 1000)}`;

  const [name, setName] = useState('');
  const [internalCode, setInternalCode] = useState(isEditing ? '' : tempCode);
  const [baseCost, setBaseCost] = useState('0');
  const [stock, setStock] = useState('0');
  
  const [abcCategory, setAbcCategory] = useState('General');
  const [existingCategories, setExistingCategories] = useState<string[]>(['General']);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  
  const [list1, setList1] = useState('0');
  const [list2, setList2] = useState('0');
  const [list3, setList3] = useState('0');
  const [extraDiscount, setExtraDiscount] = useState('0');
  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        let productsList: any[] = [];
        if (Platform.OS === 'web') {
          if (businessId) {
            const q = query(collection(firestore, 'products'), where('businessId', '==', businessId));
            const snapshot = await getDocs(q);
            productsList = snapshot.docs.map(d => d.data());
          }
        } else {
          productsList = await localDb.getAllAsync<any>('SELECT abcCategory FROM products');
        }

        const uniqueCats = new Set(productsList.map(p => (p.abcCategory || 'General').trim().toUpperCase()));
        const sortedCats = Array.from(uniqueCats).sort((a, b) => a.localeCompare(b));
        if (sortedCats.length > 0) {
          setExistingCategories(sortedCats);
          if (!isEditing) setAbcCategory(sortedCats[0]);
        }

        if (isEditing) {
          let product: any = null;
          if (Platform.OS === 'web') {
            product = productsList.find(p => p.id === productId);
          } else {
            const result = await localDb.getAllAsync<any>('SELECT * FROM products WHERE id = ?', [productId]);
            if (result.length > 0) product = result[0];
          }

          if (product) {
            setName(product.name);
            setInternalCode(product.internalCode);
            setBaseCost(product.baseCost.toString());
            setStock((product.stock || 0).toString());
            setAbcCategory((product.abcCategory || 'General').toUpperCase());
            setList1(product.list1?.toString() || '0');
            setList2(product.list2?.toString() || '0');
            setList3(product.list3?.toString() || '0');
            setExtraDiscount((product.extraDiscountPercentage || 0).toString());

            if (product.images && String(product.images) !== "[]") {
              try {
                const parsed = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
                if (parsed.length > 0) setImageUri(parsed[0]);
              } catch (e) {}
            }
          }
        }
      } catch (error) {
        console.error("Error cargando datos:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadInitialData();
  }, [isEditing, productId, businessId]);

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso necesario', 'Necesitamos acceso a tu galería para subir la foto.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], 
      quality: 0.2, // 👇 Bajamos la calidad al 20% para evitar que bloquee Firebase por peso
      base64: true, 
    });

    if (!result.canceled && result.assets[0].base64) {
      setImageUri(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleSave = async () => {
    if (!name || !baseCost) {
      if (Platform.OS === 'web') window.alert("El nombre y el costo base son obligatorios.");
      else Alert.alert("Error", "El nombre y el costo base son obligatorios.");
      return;
    }

    if (!businessId && Platform.OS === 'web') {
      window.alert("Error: No se detecta una sesión válida para guardar el producto. Refrescá la página.");
      return;
    }

    setIsSaving(true);

    const numBaseCost = safeParseNumber(baseCost);
    const numStock = parseInt(stock.toString().replace(/[^0-9]/g, ''), 10) || 0;
    const numList1 = safeParseNumber(list1);
    const numList2 = safeParseNumber(list2);
    const numList3 = safeParseNumber(list3);
    const numDiscount = safeParseNumber(extraDiscount);
    const updatedTime = Date.now();
    
    const cleanInternalCode = internalCode.trim() || `PROD-${updatedTime}`;
    const finalId = isEditing ? productId : `P-${updatedTime}-${Math.floor(Math.random() * 1000)}`; 
    const finalCategory = abcCategory.trim().toUpperCase() || 'GENERAL';
    const finalName = name.trim().toUpperCase();

    const imageStringToSave = imageUri ? JSON.stringify([imageUri]) : "[]";

    try {
      if (Platform.OS === 'web') {
        const productRef = doc(firestore, 'products', finalId);
        await setDoc(productRef, {
          id: finalId,
          internalCode: cleanInternalCode,
          name: finalName,
          baseCost: numBaseCost,
          stock: numStock,
          abcCategory: finalCategory,
          markups: { list1: numList1, list2: numList2, list3: numList3 },
          list1: numList1,
          list2: numList2,
          list3: numList3,
          extraDiscountPercentage: numDiscount,
          images: imageStringToSave,
          isHidden: false,
          updatedAt: updatedTime,
          ...(isEditing ? {} : { createdAt: updatedTime, businessId: businessId }) 
        }, { merge: true });

        window.alert(`Producto ${isEditing ? 'actualizado' : 'creado'} correctamente.`);
        // 👇 VUELVE AL CATÁLOGO 👇
        router.replace('/catalogo' as any);
      } else {
        if (isEditing) {
          await localDb.runAsync(
            `UPDATE products 
             SET name = ?, baseCost = ?, stock = ?, abcCategory = ?, list1 = ?, list2 = ?, list3 = ?, extraDiscountPercentage = ?, images = ?, updatedAt = ?, syncStatus = 'PENDING'
             WHERE id = ?`,
            [finalName, numBaseCost, numStock, finalCategory, numList1, numList2, numList3, numDiscount, imageStringToSave, updatedTime, finalId]
          );

          try {
            const productRef = doc(firestore, 'products', finalId);
            await updateDoc(productRef, {
              name: finalName, baseCost: numBaseCost, stock: numStock, abcCategory: finalCategory,
              markups: { list1: numList1, list2: numList2, list3: numList3 }, list1: numList1, list2: numList2, list3: numList3,
              extraDiscountPercentage: numDiscount, images: imageStringToSave, updatedAt: updatedTime
            });
            await localDb.runAsync(`UPDATE products SET syncStatus = 'SYNCED' WHERE id = ?`, [finalId]);
          } catch (cloudError) { console.log("Edición offline", cloudError); }
        } else {
          await localDb.runAsync(
            `INSERT INTO products 
             (id, internalCode, name, baseCost, stock, abcCategory, list1, list2, list3, extraDiscountPercentage, images, isHidden, createdAt, updatedAt, syncStatus) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'PENDING')`,
            [finalId, cleanInternalCode, finalName, numBaseCost, numStock, finalCategory, numList1, numList2, numList3, numDiscount, imageStringToSave, updatedTime, updatedTime]
          );

          try {
            const productRef = doc(firestore, 'products', finalId);
            await setDoc(productRef, {
              id: finalId, internalCode: cleanInternalCode, name: finalName, baseCost: numBaseCost, stock: numStock,
              abcCategory: finalCategory, markups: { list1: numList1, list2: numList2, list3: numList3 },
              list1: numList1, list2: numList2, list3: numList3, extraDiscountPercentage: numDiscount,
              images: imageStringToSave, isHidden: false, createdAt: updatedTime, updatedAt: updatedTime, businessId: businessId
            });
            await localDb.runAsync(`UPDATE products SET syncStatus = 'SYNCED' WHERE id = ?`, [finalId]);
          } catch (cloudError) { console.log("Creación offline", cloudError); }
        }
        
        Alert.alert("Éxito", "Producto guardado correctamente.", [
          // 👇 VUELVE AL CATÁLOGO 👇
          { text: "OK", onPress: () => router.replace('/catalogo' as any) }
        ]);
      }
    } catch (error: any) {
      console.error("Error guardando producto:", error);
      
      const errorDetail = error.message || "Error de red o conexión";
      
      if (Platform.OS === 'web') {
        window.alert(`No se pudo guardar el producto.\n\nDetalle técnico: ${errorDetail}`);
      } else {
        Alert.alert("Error", `No se pudo guardar:\n${errorDetail}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <ActivityIndicator size="large" color="#34C759" style={{ flex: 1, marginTop: 50 }} />;

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Editar Producto' : 'Nuevo Producto'}</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.formContainer}>
        
        <View style={styles.imagePickerContainer}>
          <TouchableOpacity style={styles.imagePickerBtn} onPress={handlePickImage}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.productImagePreview} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.cameraIcon}>📸</Text>
                <Text style={styles.imagePlaceholderText}>Subir Foto</Text>
              </View>
            )}
          </TouchableOpacity>
          {imageUri && (
            <TouchableOpacity style={styles.removeImageBtn} onPress={() => setImageUri(null)}>
              <Text style={styles.removeImageText}>🗑️ Quitar Foto</Text>
            </TouchableOpacity>
          )}
        </View>

        {isEditing ? (
          <View style={styles.codeBadge}>
            <Text style={styles.codeText}>Código: #{internalCode}</Text>
          </View>
        ) : (
          <View style={{ marginBottom: 15 }}>
            <Text style={styles.label}>Código (Opcional) *</Text>
            <TextInput style={styles.input} value={internalCode} onChangeText={setInternalCode} placeholder="Ej: 7790895000000" />
          </View>
        )}

        <Text style={styles.label}>Nombre del Producto *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ej: ALF BON O BON" autoCapitalize="characters" />

        <View style={styles.row}>
          <View style={styles.halfWidth}>
            <Text style={styles.label}>Costo Base ($) *</Text>
            <TextInput style={styles.input} value={baseCost} onChangeText={setBaseCost} keyboardType="numeric" />
          </View>
          <View style={styles.halfWidth}>
            <Text style={styles.label}>Stock Disponible</Text>
            <TextInput style={styles.input} value={stock} onChangeText={setStock} keyboardType="numeric" />
          </View>
        </View>

        <Text style={styles.label}>Categoría del Producto *</Text>
        {!isNewCategory ? (
          <View style={styles.categoryContainer}>
            <View style={styles.chipsContainer}>
              {existingCategories.map((cat) => (
                <TouchableOpacity 
                  key={cat} 
                  style={[styles.chip, abcCategory === cat && styles.chipActive]}
                  onPress={() => setAbcCategory(cat)}
                >
                  <Text style={[styles.chipText, abcCategory === cat && styles.chipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity 
              style={styles.newCategoryBtn} 
              onPress={() => {
                setIsNewCategory(true);
                setAbcCategory('');
                setNewCategoryInput('');
              }}
            >
              <Text style={styles.newCategoryBtnText}>➕ Crear Nueva Categoría</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.newCategoryInputContainer}>
            <TextInput 
              style={styles.input} 
              placeholder="Ej: BEBIDAS, LIMPIEZA..."
              value={newCategoryInput}
              autoCapitalize="characters"
              onChangeText={(text) => {
                setNewCategoryInput(text);
                setAbcCategory(text);
              }}
            />
            <TouchableOpacity 
              style={styles.cancelNewCategoryBtn} 
              onPress={() => {
                setIsNewCategory(false);
                setNewCategoryInput('');
                setAbcCategory(existingCategories[0] || 'GENERAL'); 
              }}
            >
              <Text style={styles.cancelNewCategoryBtnText}>✖ Volver a la lista</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Precios Finales</Text>

        <View style={styles.row}>
          <View style={styles.thirdWidth}>
            <Text style={styles.label}>Lista 1</Text>
            <TextInput style={styles.input} value={list1} onChangeText={setList1} keyboardType="numeric" />
          </View>
          <View style={styles.thirdWidth}>
            <Text style={styles.label}>Lista 2</Text>
            <TextInput style={styles.input} value={list2} onChangeText={setList2} keyboardType="numeric" />
          </View>
          <View style={styles.thirdWidth}>
            <Text style={styles.label}>Lista 3</Text>
            <TextInput style={styles.input} value={list3} onChangeText={setList3} keyboardType="numeric" />
          </View>
        </View>

        <View style={styles.divider} />
        
        <Text style={styles.label}>Descuento Extra (%)</Text>
        <TextInput style={[styles.input, { borderColor: '#FF3B30' }]} value={extraDiscount} onChangeText={setExtraDiscount} keyboardType="numeric" />
        <Text style={styles.helperText}>Se restará del precio final de venta.</Text>

        <TouchableOpacity style={[styles.saveBtn, isSaving && { backgroundColor: '#a8dab5' }]} onPress={handleSave} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>{isEditing ? 'Guardar Cambios' : 'Crear Producto'}</Text>
          )}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: Platform.OS === 'web' ? 15 : 50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#34C759', paddingTop: Platform.OS === 'web' ? 10 : 40, paddingBottom: 15, paddingHorizontal: 15 },
  backBtn: { padding: 5 },
  backIcon: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  formContainer: { padding: 20 },
  
  imagePickerContainer: { alignItems: 'center', marginBottom: 20 },
  imagePickerBtn: { width: Platform.OS === 'web' ? 190 : 140, height: Platform.OS === 'web' ? 190 : 140, borderRadius: 16, backgroundColor: '#e0e0e0', overflow: 'hidden', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#ccc', borderStyle: 'dashed' },
  productImagePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  imagePlaceholder: { alignItems: 'center' },
  cameraIcon: { fontSize: 36, marginBottom: 5 },
  imagePlaceholderText: { fontSize: 13, color: '#666', fontWeight: 'bold' },
  removeImageBtn: { marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#ffe6e6', borderRadius: 20 },
  removeImageText: { color: '#FF3B30', fontSize: 12, fontWeight: 'bold' },

  codeBadge: { backgroundColor: '#e0e0e0', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 15 },
  codeText: { fontSize: 12, fontWeight: 'bold', color: '#555' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  halfWidth: { width: '48%' },
  thirdWidth: { width: '31%' },
  label: { fontSize: 13, fontWeight: 'bold', color: '#555', marginBottom: 5, marginTop: 15 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 12, fontSize: 15, color: '#333' },
  divider: { height: 1, backgroundColor: '#ddd', marginVertical: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: -5 },
  helperText: { fontSize: 11, color: '#888', marginTop: 4, fontStyle: 'italic' },
  saveBtn: { backgroundColor: '#34C759', paddingVertical: 15, borderRadius: 8, alignItems: 'center', marginTop: 30, elevation: 2 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  categoryContainer: { backgroundColor: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', marginTop: 5 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { backgroundColor: '#e0e0e0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  chipActive: { backgroundColor: '#135C58' },
  chipText: { fontSize: 13, color: '#555', fontWeight: 'bold' },
  chipTextActive: { color: '#fff' },
  newCategoryBtn: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 5, alignItems: 'center' },
  newCategoryBtnText: { color: '#007AFF', fontWeight: 'bold', fontSize: 14 },
  newCategoryInputContainer: { marginTop: 5 },
  cancelNewCategoryBtn: { marginTop: 8, alignItems: 'flex-end', paddingRight: 5 },
  cancelNewCategoryBtnText: { color: '#FF3B30', fontSize: 13, fontWeight: '600' }
});