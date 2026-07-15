// src/types/product.ts

export type ABCCategory = 'A' | 'B' | 'C' | 'UNCLASSIFIED';

export interface Product {
  id: string;
  internalCode: string;
  barcode: string | null;
  name: string;
  description?: string;
  images: string[];

  baseCost: number;
  markups: {
    list1: number;
    list2: number;
    list3: number;
  };
  extraDiscountPercentage: number;

  isHidden: boolean;
  stock: number;
  abcCategory: ABCCategory;
  
  createdAt: number;
  updatedAt: number;
}