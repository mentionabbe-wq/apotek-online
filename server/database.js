const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB apotek-online sendiri
const DATA_DIR = process.env.DB_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'toko.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// DB apotek-app (read-only untuk ambil produk & stok)
const simfarPath = process.env.SIMFAR_DB || '/simfar-data/apotek.db';
let dbSimfar = null;
try {
  if (fs.existsSync(simfarPath)) {
    dbSimfar = new Database(simfarPath, { readonly: true });
    console.log('✓ Terhubung ke database apotek-app');
  } else {
    console.warn('⚠ Database apotek-app tidak ditemukan di:', simfarPath);
  }
} catch (e) {
  console.warn('⚠ Gagal buka DB apotek-app:', e.message);
}

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      telepon TEXT NOT NULL,
      alamat TEXT DEFAULT '',
      email TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_online (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL,
      customer_nama TEXT DEFAULT '',
      customer_telepon TEXT DEFAULT '',
      customer_alamat TEXT DEFAULT '',
      catatan TEXT DEFAULT '',
      subtotal REAL DEFAULT 0,
      ongkir REAL DEFAULT 0,
      total REAL DEFAULT 0,
      metode_bayar TEXT DEFAULT 'transfer',
      status TEXT DEFAULT 'menunggu_bayar',
      bukti_bayar TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customer(id)
    );

    CREATE TABLE IF NOT EXISTS order_detail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      obat_id INTEGER NOT NULL,
      nama_obat TEXT DEFAULT '',
      satuan TEXT DEFAULT '',
      jumlah INTEGER NOT NULL,
      harga_jual REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES order_online(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pengaturan (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);

  // Default pengaturan
  const defaults = {
    namaApotek: process.env.NAMA_APOTEK || 'Apotek Dian Farma',
    alamat: process.env.ALAMAT_APOTEK || 'Jl. Kesehatan No. 1',
    telepon: process.env.TELEPON_APOTEK || '08123456789',
    noRekening: '1234567890',
    namaRekening: 'Dian Farma',
    namaBank: 'BCA',
    ongkirDefault: '0',
    orderCounter: '1'
  };
  const ins = db.prepare('INSERT OR IGNORE INTO pengaturan (key,value) VALUES (?,?)');
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);

  console.log('✓ Database toko siap');
}

function getPengaturan(key) {
  return db.prepare('SELECT value FROM pengaturan WHERE key=?').get(key)?.value || '';
}

function genKodeOrder() {
  const n = parseInt(getPengaturan('orderCounter') || '1');
  db.prepare('INSERT OR REPLACE INTO pengaturan (key,value) VALUES (?,?)').run('orderCounter', String(n + 1));
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`;
  return `ORD-${ym}-${String(n).padStart(4,'0')}`;
}

// Ambil produk dari apotek-app
function getProdukSimfar(search = '', limit = 50, offset = 0) {
  if (!dbSimfar) return { items: [], total: 0 };
  try {
    const where = search
      ? `WHERE (LOWER(nama) LIKE LOWER('%${search}%') OR LOWER(kategori) LIKE LOWER('%${search}%')) AND stok > 0`
      : 'WHERE stok > 0';
    const items = dbSimfar.prepare(`SELECT id, kode, nama, kategori, stok, harga_jual, satuan FROM obat ${where} ORDER BY nama LIMIT ? OFFSET ?`).all(limit, offset);
    const total = dbSimfar.prepare(`SELECT COUNT(*) as c FROM obat ${where}`).get().c;
    return { items, total };
  } catch (e) {
    console.error('getProdukSimfar error:', e.message);
    return { items: [], total: 0 };
  }
}

function getProdukById(id) {
  if (!dbSimfar) return null;
  try {
    return dbSimfar.prepare('SELECT id, kode, nama, kategori, stok, harga_jual, satuan FROM obat WHERE id=?').get(id);
  } catch { return null; }
}

module.exports = { db, dbSimfar, initDatabase, getPengaturan, genKodeOrder, getProdukSimfar, getProdukById };
