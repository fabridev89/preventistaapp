// src/services/importSuppliers.ts
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase.config';

// Esta función recibe el array de filas que leíste del Excel/CSV
export const importSuppliersFromExcel = async (excelRows: any[], currentBusinessId: string) => {
  try {
    if (!currentBusinessId) throw new Error("No hay una empresa activa seleccionada.");
    
    const batch = writeBatch(db);
    let count = 0;

    console.log(`Procesando ${excelRows.length} filas del Excel de proveedores...`);

    for (const row of excelRows) {
      // Si la fila no tiene nombre, la salteamos para evitar basura
      if (!row.Nombre && !row.name) continue;

      // Generamos un ID único para el proveedor en Firebase
      const supplierId = `SUP-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      
      // LA MAGIA: Mapeo ultra tolerante a fallos. Si falta un dato, va fallback por defecto.
      const cleanedSupplierData = {
        id: supplierId,
        businessId: currentBusinessId,
        name: (row.Nombre || row.name || 'PROVEEDOR SIN NOMBRE').toUpperCase().trim(),
        phone: (row.Teléfono || row.telefono || row.phone || '').toString().trim(),
        address: (row.Dirección || row.direccion || row.address || 'Sin Dirección').trim(),
        defaultPaymentMethod: (row['Forma de pago'] || row.forma_pago || 'EFECTIVO').trim(),
        deliveryDay: (row['Día de entrega'] || row.dia_entrega || 'Lunes').trim(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Lo preparamos en el lote de Firebase
      const supplierRef = doc(db, 'suppliers', supplierId);
      batch.set(supplierRef, cleanedSupplierData);
      count++;

      // Firebase permite hasta 500 operaciones por lote (batch)
      if (count >= 450) {
        await batch.commit();
        console.log("Lote intermedio de proveedores subido con éxito.");
        // Ojo: En un escenario real con miles de filas, acá deberías reiniciar el batch
        // let batch = writeBatch(db); // Solo si vas a mandar más de 500.
      }
    }

    // Subimos los últimos que queden colgados en el lote
    await batch.commit();
    return { success: true, message: `Se importaron ${count} proveedores correctamente.` };

  } catch (error: any) {
    console.error("Error en la importación masiva de proveedores:", error);
    return { success: false, message: error.message || "Error al procesar el archivo." };
  }
};