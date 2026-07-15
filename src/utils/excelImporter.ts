// src/utils/excelImporter.ts
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';
import localDb from '../config/database';
import { db as firestore } from '../config/firebase.config';
import { useAuthStore } from '../store/useAuthStore';

const findValue = (row: any, possibleKeys: string[]) => {
  const rowKeys = Object.keys(row);
  const foundKey = rowKeys.find(k => possibleKeys.includes(k.toLowerCase().trim()));
  return foundKey ? row[foundKey] : null;
};

export const importProductsFromExcel = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const currentBusinessId = useAuthStore.getState().businessId;
    if (!currentBusinessId) {
      return { success: false, message: 'No se detectó un usuario activo para asociar los datos.' };
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, message: 'Operación cancelada.' };
    }

    let workbook;

    if (Platform.OS === 'web') {
      try {
        const response = await fetch(result.assets[0].uri);
        const arrayBuffer = await response.arrayBuffer();
        workbook = XLSX.read(arrayBuffer, { type: 'array' });
      } catch (error) {
        console.error("Error leyendo Excel en Web:", error);
        return { success: false, message: 'No se pudo decodificar el archivo en la web.' };
      }
    } else {
      const fileUri = result.assets[0].uri;
      // 👇 Solución al rojito de EncodingType (usamos el literal 'base64')
      const fileBase64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
      workbook = XLSX.read(fileBase64, { type: 'base64' });
    }

    let batch = writeBatch(firestore);
    let operationCount = 0;
    let totalImported = 0;
    let totalWhitelisted = 0;

    const clientslistSheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes('client')
    );

    if (clientslistSheetName) {
      const clientslistData: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[clientslistSheetName]);
      const whitelistRef = collection(firestore, 'whitelist');

      for (const row of clientslistData) {
        const email = String(findValue(row, ['correo', 'email', 'mail']) || '').trim().toLowerCase();
        const rawList = String(findValue(row, ['lista', 'listaprecio', 'tipo']) || '').toLowerCase();

        if (email && email.includes('@')) {
          let assignedList = 'list1';
          if (rawList.includes('2')) assignedList = 'list2';
          if (rawList.includes('3')) assignedList = 'list3';

          const whitelistDoc = {
            email,
            assignedList,
            businessId: currentBusinessId,
            updatedAt: Date.now()
          };

          batch.set(doc(whitelistRef, email), whitelistDoc, { merge: true });
          operationCount++;
          totalWhitelisted++;

          if (operationCount >= 400) {
            await batch.commit();
            batch = writeBatch(firestore);
            operationCount = 0;
          }
        }
      }
    }

    const productsSheetName = workbook.SheetNames.find(name => name.toLowerCase().includes('producto') || name.toLowerCase().includes('product')) 
      || workbook.SheetNames.filter(name => name !== clientslistSheetName)[0] 
      || workbook.SheetNames[0];

    const worksheet = workbook.Sheets[productsSheetName];
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

    if (rawData.length === 0 && totalWhitelisted === 0) {
       return { success: false, message: 'El archivo Excel está vacío o no tiene el formato correcto.' };
    }

    for (const row of rawData) {
      const internalCode = String(findValue(row, ['codigo', 'código', 'codigo base']) || Date.now().toString());
      const name = String(findValue(row, ['titulo', 'título', 'nombre']) || 'Producto sin nombre');
      const barcode = String(findValue(row, ['codigo de barra', 'código de barras']) || '');
      
      const cost = parseFloat(findValue(row, ['costo actual', 'costo'])) || 0;
      
      const price1 = parseFloat(findValue(row, ['lista 1', 'precio', 'precio (precio de venta al público)'])) || cost;
      const price2 = parseFloat(findValue(row, ['lista 2', 'precio2'])) || cost;
      const price3 = parseFloat(findValue(row, ['lista 3', 'precio3'])) || cost;

      const categoryName = String(findValue(row, ['categoria', 'categoría', 'rubro']) || 'General');

      let extractedImages: string[] = [];
      const imageField = findValue(row, ['imagen', 'imágen', 'foto', 'image']);
      
      if (imageField && typeof imageField === 'string') {
        if (imageField.includes('"url"')) {
          try {
            const parsedImage = JSON.parse(imageField);
            if (Array.isArray(parsedImage) && parsedImage.length > 0 && parsedImage[0].url) {
              extractedImages.push(parsedImage[0].url);
            }
          } catch (e) { console.log("Error parseando imagen de:", name); }
        } else if (imageField.startsWith('http')) {
          extractedImages.push(imageField.trim());
        }
      }

      const imageStr = JSON.stringify(extractedImages);
      const newId = `PROD-${Date.now()}-${operationCount}`;
      const prodRef = doc(firestore, 'products', newId);

      const productData = {
        id: newId,
        businessId: currentBusinessId, 
        internalCode,
        barcode,
        name,
        description: String(findValue(row, ['descripcion', 'descripción']) || ''),
        images: imageStr,
        baseCost: cost,
        list1: price1,
        list2: price2,
        list3: price3,
        markups: { list1: price1, list2: price2, list3: price3 }, 
        extraDiscountPercentage: 0,
        isHidden: false,
        stock: parseInt(findValue(row, ['stock', 'stock actual'])) || 0,
        abcCategory: categoryName,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      batch.set(prodRef, productData, { merge: true });

      if (Platform.OS !== 'web') {
         await localDb.runAsync(
           `INSERT OR REPLACE INTO products 
           (id, internalCode, name, description, abcCategory, list1, list2, list3, baseCost, stock, images, isHidden, createdAt, updatedAt) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
           [newId, internalCode, name, productData.description, categoryName, price1, price2, price3, cost, productData.stock, imageStr, Date.now(), Date.now()]
         );
      }
      
      operationCount++;
      totalImported++;

      if (operationCount >= 400) {
        await batch.commit();
        batch = writeBatch(firestore);
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
       await batch.commit();
    }
    
    let finalMessage = `Se importaron ${totalImported} productos con éxito.`;
    if (totalWhitelisted > 0) {
      finalMessage += `\nAdemás, se agregaron ${totalWhitelisted} correos a la lista de accesos automáticos.`;
    }

    return { success: true, message: finalMessage };

  } catch (error: any) {
    console.error('Error importando Excel:', error);
    return { success: false, message: 'Ocurrió un error al procesar el archivo.' };
  }
};