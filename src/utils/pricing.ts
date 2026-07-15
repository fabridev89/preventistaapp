// src/utils/pricing.ts

export const calculateFinalPrice = (
  baseCost: number, 
  markupPercentage: number, // ¡OJO! Ahora este parámetro recibe el PRECIO FINAL DIRECTO de la lista
  extraDiscount: number = 0
): number => {
  
  // 1. Tomamos el precio de lista directo (que viene en markupPercentage). 
  // Si por algún error llega en 0, usamos el costo base como salvavidas.
  const listPrice = markupPercentage > 0 ? markupPercentage : baseCost;

  if (listPrice <= 0) return 0;

  // 2. Aplicamos el descuento extra si lo hubiera
  const finalPrice = extraDiscount > 0 
    ? listPrice - (listPrice * (extraDiscount / 100)) 
    : listPrice;
  
  // 3. Retornamos el precio limpio (ya no redondeamos hacia arriba para no alterar precios exactos)
  return finalPrice; 
};