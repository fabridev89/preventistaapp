// src/utils/excelExporter.ts
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

// 👇 FUNCIÓN DE SEGURIDAD PARA CORTAR TEXTOS LARGOS Y EVITAR EL ERROR DE EXCEL
const safeString = (val: any) => {
  const str = String(val || '');
  return str.length > 32000 ? str.substring(0, 32000) + "..." : str;
};

export const exportCatalogToExcel = async (products: any[]) => {
  try {
    if (!products || products.length === 0) {
      return { success: false, message: "No hay productos para exportar." };
    }

    const dataToExport = products.map(p => {
      let imgStr = '';
      try { 
        // Si hay error en el JSON, devolvemos string vacío
        imgStr = typeof p.images === 'string' ? JSON.parse(p.images)[0] || '' : ''; 
      } catch (e) { imgStr = ''; }

      const safeNumber = (val: any) => {
        const num = Number(val);
        return isNaN(num) ? 0 : num;
      };

      const cost = safeNumber(p.baseCost);
      const price1 = safeNumber(p.list1) || safeNumber(p.markups?.list1) || cost;
      const price2 = safeNumber(p.list2) || safeNumber(p.markups?.list2) || cost;
      const price3 = safeNumber(p.list3) || safeNumber(p.markups?.list3) || cost;

      return {
        // 👇 APLICAMOS SAFE STRING A TODO
        'codigo': safeString(p.internalCode),
        'titulo': safeString(p.name || 'Sin Nombre'),
        'descripcion': safeString(p.description),
        'categoria': safeString(p.abcCategory || 'General'),
        'subcategoria': '', 
        'tipo': '', 
        'recomendados': '', 
        'lista 1': parseFloat(price1.toFixed(2)),
        'lista 2': parseFloat(price2.toFixed(2)),
        'lista 3': parseFloat(price3.toFixed(2)),
        'costo': parseFloat(cost.toFixed(2)),
        'stock': safeNumber(p.stock),
        'image': safeString(imgStr)
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Catálogo");

    if (Platform.OS === 'web') {
      const fileName = `Catalogo_Stock_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      return { success: true, message: "Descarga iniciada." };
    } else {
      const fs: any = FileSystem;
      const docDir = fs.documentDirectory;

      if (!docDir) {
        return { success: false, message: "Error al acceder a la memoria." };
      }

      const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const fileUri = `${docDir}Catalogo_Stock.xlsx`;
      
      await fs.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
      
      if (!(await Sharing.isAvailableAsync())) {
         return { success: false, message: "Función compartir no disponible." };
      }
      
      await Sharing.shareAsync(fileUri, { 
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        dialogTitle: 'Exportar Catálogo' 
      });
      
      return { success: true, message: "Archivo generado con éxito." };
    }
  } catch (error: any) {
    console.error("Error exportando Excel:", error);
    // Ahora si falla, te dará el error real en la alerta
    return { success: false, message: `Error crítico: ${error?.message || 'Error desconocido'}` };
  }
};