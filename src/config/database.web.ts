// src/config/database.web.ts

// 🚀 BYPASS TOTAL PARA LA WEB
// Como la web lee y escribe directo en Firebase, simulamos la base de datos 
// local para que la app no explote intentando buscar SQLite o archivos WASM.

export const initLocalDatabase = async () => {
  console.log("✅ Web detectada: Omitiendo inicialización de SQLite (conectado a Firebase directo).");
};

const dbProxy = {
  getAllAsync: async <T>(query: string, params: any[] = []) => {
    return []; // Devuelve un array vacío para que las listas no se rompan
  },
  getFirstAsync: async <T>(query: string, params: any[] = []) => {
    return null;
  },
  runAsync: async (query: string, params: any[] = []) => {
    return { changes: 0, lastInsertRowId: 0 };
  },
  execAsync: async (source: string) => {
    return;
  },
  withTransactionAsync: async (callback: () => Promise<void>) => {
    await callback(); // Ejecuta el código interno directamente
  }
};

export default dbProxy as any;