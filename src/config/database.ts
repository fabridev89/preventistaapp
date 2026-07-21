// src/config/database.ts
import * as SQLite from 'expo-sqlite';

// Abrimos la base de datos nativa
const db = SQLite.openDatabaseSync('preventista_local.db');

export const initLocalDatabase = async () => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY NOT NULL, internalCode TEXT NOT NULL, barcode TEXT, name TEXT NOT NULL, description TEXT, images TEXT, baseCost REAL NOT NULL, list1 REAL NOT NULL, list2 REAL NOT NULL, list3 REAL NOT NULL, extraDiscountPercentage REAL DEFAULT 0, isHidden INTEGER DEFAULT 0, stock INTEGER DEFAULT 0, abcCategory TEXT, createdAt INTEGER, updatedAt INTEGER);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY NOT NULL, clientId TEXT NOT NULL, clientName TEXT NOT NULL, total REAL NOT NULL, items TEXT NOT NULL, createdAt INTEGER NOT NULL, syncStatus TEXT DEFAULT 'PENDING', notes TEXT DEFAULT '', status TEXT DEFAULT 'PENDIENTE');
    
    -- 👇 ACTUALIZAMOS LA TABLA DE CLIENTES AGREGANDO 'balance' 👇
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY NOT NULL, 
      internalCode TEXT, 
      businessName TEXT NOT NULL, 
      address TEXT NOT NULL, 
      defaultList TEXT NOT NULL DEFAULT 'list1', 
      visitDay TEXT NOT NULL, 
      phone TEXT, 
      email TEXT, 
      balance REAL DEFAULT 0, -- 👈 NUEVA COLUMNA INICIALIZADA EN 0
      createdAt INTEGER NOT NULL, 
      updatedAt INTEGER, 
      syncStatus TEXT DEFAULT 'PENDING'
    );
    
    CREATE TABLE IF NOT EXISTS brand_settings (id INTEGER PRIMARY KEY CHECK (id = 1), logoUri TEXT, primaryColor TEXT DEFAULT '#34C759');
    CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, phone TEXT, address TEXT, defaultPaymentMethod TEXT DEFAULT 'EFECTIVO', deliveryDay TEXT DEFAULT 'Lunes', createdAt INTEGER NOT NULL, syncStatus TEXT DEFAULT 'PENDING');
    CREATE TABLE IF NOT EXISTS purchase_orders (id TEXT PRIMARY KEY NOT NULL, supplierId TEXT NOT NULL, supplierName TEXT NOT NULL, total REAL NOT NULL, items TEXT NOT NULL, paymentMethod TEXT DEFAULT 'EFECTIVO', status TEXT DEFAULT 'PENDIENTE DE PAGO', createdAt INTEGER NOT NULL, syncStatus TEXT DEFAULT 'PENDING');
  `);
};

export default db;