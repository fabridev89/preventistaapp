// src/components/ProductCard.tsx
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useCartStore } from '../store/useCartStore';
import { Product } from '../types/product';

interface ProductCardProps {
  product: Product;
  activeList: 'list1' | 'list2' | 'list3';
  isAdded: boolean;
  onToggleHidden: () => void;
  onDelete?: () => void;
}

export default function ProductCard({
  product,
  activeList,
  isAdded,
  onToggleHidden,
  onDelete,
}: ProductCardProps) {
  const router = useRouter(); 
  
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  
  const [quantity, setQuantity] = useState(1);

  // 👇 LÓGICA DE PRECIOS EXACTOS BLINDADA 👇
  const listPrice = Number(product[activeList as keyof Product]) || Number(product.baseCost) || 0;
  
  const discount = Number(product.extraDiscountPercentage || 0);
  const finalPrice = discount > 0 ? listPrice - (listPrice * (discount / 100)) : listPrice;

  const cartItem = items.find((item) => item.product.id === product.id);
  const inCartQty = cartItem ? cartItem.quantity : 0;
  const availableStock = (Number(product.stock) || 0) - inCartQty;

  const increaseQty = () => setQuantity(prev => prev + 1);
  const decreaseQty = () => setQuantity(prev => (prev > 1 ? prev - 1 : 1));

  const handleAdd = () => {
    // Mandamos el precio ya resuelto al carrito
    addItem({ ...product, unitPrice: finalPrice } as any, activeList, quantity); 
    setQuantity(1); 
  };

  const handleEdit = () => {
    router.push({
      pathname: '/editar-producto',
      params: { id: product.id }
    });
  };

  let imageUrl = null;
  if (product.images && String(product.images) !== "[]") {
    try {
      const parsed = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
      imageUrl = parsed[0];
    } catch (e) {
      imageUrl = null;
    }
  }

  return (
    <View style={[styles.card, isAdded && styles.cardAdded]}>
      
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image 
            source={{ uri: imageUrl }} 
            style={styles.productImage} 
            resizeMode="cover" 
          />
        ) : (
          <View style={styles.noImagePlaceholder}>
            <Text style={styles.noImageText}>Sin foto</Text>
          </View>
        )}

        <View style={styles.floatingBadgesLeft}>
          <View style={[styles.stockBadge, availableStock <= 0 ? styles.stockOut : styles.stockOk]}>
            <Text style={styles.stockBadgeText}>
              {availableStock > 0 ? `📦 ${availableStock}` : `⚠️ ${availableStock}`}
            </Text>
          </View>
          {product.extraDiscountPercentage > 0 && (
            <View style={[styles.badge, { marginTop: 4 }]}>
              <Text style={styles.badgeText}>-{product.extraDiscountPercentage}%</Text>
            </View>
          )}
        </View>

        {isAdded && (
          <View style={styles.cartFloatingBadge}>
            <Text style={styles.cartFloatingText}>✅ En carrito</Text>
          </View>
        )}
        

       {onDelete && (
  <TouchableOpacity
    style={styles.deleteButtonFloating}
    onPress={onDelete}
  >
    <Text style={styles.editButtonText}>🗑️</Text>
  </TouchableOpacity>
)}

<TouchableOpacity
  style={styles.editButtonFloating}
  onPress={handleEdit}
>
  <Text style={styles.editButtonText}>✏️</Text>
</TouchableOpacity>
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.code}>#{product.internalCode}</Text>
        <Text style={styles.title} numberOfLines={2}>{product.name}</Text>
        
        <View style={styles.pricesRow}>
          <Text style={styles.price}>${finalPrice.toLocaleString('es-AR')}</Text>
        </View>
        
        <View style={styles.qtyContainer}>
          <TouchableOpacity onPress={decreaseQty} style={styles.qtyBtn}>
            <Text style={styles.qtyBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.qtyText}>{quantity}</Text>
          <TouchableOpacity onPress={increaseQty} style={styles.qtyBtn}>
            <Text style={styles.qtyBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonsRow}>
          <TouchableOpacity 
            style={[styles.visibilityBtn, product.isHidden ? styles.hiddenBtn : styles.visibleBtn]} 
            onPress={onToggleHidden}
          >
            <Text style={[styles.visibilityBtnText, product.isHidden && styles.hiddenBtnText]}>
              {product.isHidden ? '🔴 Oculto' : '🟢 Visible'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.addButton, isAdded && styles.addButtonAdded]} onPress={handleAdd}>
            <Text style={styles.addButtonText}>{isAdded ? '+ Sumar' : 'Agregar'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },

  cardAdded: {
    backgroundColor: '#f0fdf4',
    borderColor: '#22c55e',
  },

  imageContainer: {
    width: '100%',
    height: Platform.OS === 'web' ? 200 : 150,
    backgroundColor: '#f9f9f9',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  productImage: {
    width: '100%',
    height: '100%',
  },

  noImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#eee',
  },

  noImageText: {
    color: '#aaa',
    fontSize: 12,
  },

  floatingBadgesLeft: {
    position: 'absolute',
    top: 8,
    left: 8,
    alignItems: 'flex-start',
    zIndex: 10,
  },

  badge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },

  stockBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },

  stockOk: {
    backgroundColor: '#e6f4ea',
  },

  stockOut: {
    backgroundColor: '#fce8e6',
  },

  stockBadgeText: {
    color: '#333',
    fontSize: 10,
    fontWeight: 'bold',
  },

  cartFloatingBadge: {
    position: 'absolute',
    top: 8,
    right: 76, // antes 42
    backgroundColor: '#22c55e',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 10,
  },

  // 👇 NUEVO
  deleteButtonFloating: {
    position: 'absolute',
    top: 8,
    right: 42,
    backgroundColor: '#fff',
    borderRadius: 15,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    zIndex: 10,
  },

  editButtonFloating: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 15,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    zIndex: 10,
  },

  editButtonText: {
    fontSize: 14,
  },

  cartFloatingText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },

  infoContainer: {
    padding: 10,
  },

  code: {
    fontSize: 10,
    color: '#888',
    fontWeight: 'bold',
    marginBottom: 2,
  },

  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    height: 40,
  },

  pricesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },

  price: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },

  qtyContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginBottom: 8,
    paddingHorizontal: 5,
  },

  qtyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  qtyBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },

  qtyText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },

  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },

  addButton: {
    flex: 1.5,
    backgroundColor: '#34C759',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },

  addButtonAdded: {
    backgroundColor: '#16a34a',
  },

  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },

  visibilityBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  visibleBtn: {
    backgroundColor: '#e6f4ea',
    borderColor: '#a8dab5',
  },

  hiddenBtn: {
    backgroundColor: '#fce8e6',
    borderColor: '#f5c2c7',
  },

  visibilityBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#137333',
  },

  hiddenBtnText: {
    color: '#c5221f',
  },
});