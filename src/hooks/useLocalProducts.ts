// src/hooks/useLocalProducts.ts
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import localDb from '../config/database';
import { db as firestore } from '../config/firebase.config';
import { useAuthStore } from '../store/useAuthStore';
import { Product } from '../types/product';

export const useLocalProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'web') {
        // --- MODO WEB: LEER DIRECTO DE FIREBASE ---
        const currentBusinessId = useAuthStore.getState().businessId;
        if (!currentBusinessId) {
          setProducts([]);
          return;
        }

        const q = query(collection(firestore, 'products'), where('businessId', '==', currentBusinessId));
        const snapshot = await getDocs(q);
        
        const webProducts: Product[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            internalCode: data.internalCode || 'S/C',
            barcode: data.barcode || '',
            name: data.name || 'Sin Nombre',
            description: data.description || '',
            images: data.images || [],
            baseCost: Number(data.baseCost) || 0,
            markups: {
              list1: Number(data.list1) || 0,
              list2: Number(data.list2) || 0,
              list3: Number(data.list3) || 0,
            },
            extraDiscountPercentage: Number(data.extraDiscountPercentage) || 0,
            isHidden: !!data.isHidden,
            stock: Number(data.stock) || 0,
            abcCategory: data.abcCategory || 'General',
            createdAt: data.createdAt || Date.now(),
            updatedAt: data.updatedAt || Date.now(),
          } as Product;
        });
        
        // Ordenamos alfabéticamente
        webProducts.sort((a, b) => a.name.localeCompare(b.name));
        setProducts(webProducts);

      } else {
        // --- MODO APP: LEER DE SQLITE ---
        const result = await localDb.getAllAsync<any>(
          'SELECT * FROM products ORDER BY name ASC'
        );

        const formattedProducts: Product[] = result.map((row) => ({
          id: row.id,
          internalCode: row.internalCode,
          barcode: row.barcode,
          name: row.name,
          description: row.description,
          images: row.images ? JSON.parse(row.images) : [],
          baseCost: row.baseCost,
          markups: {
            list1: row.list1,
            list2: row.list2,
            list3: row.list3,
          },
          extraDiscountPercentage: row.extraDiscountPercentage,
          isHidden: row.isHidden === 1,
          stock: row.stock,
          abcCategory: row.abcCategory as any,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));

        setProducts(formattedProducts);
      }
    } catch (error) {
      console.error("Error cargando productos:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { products, isLoading, loadProducts };
};