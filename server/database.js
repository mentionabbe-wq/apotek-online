const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

// DB apotek-online sendiri
const DATA_DIR = process.env.DB_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'toko.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Base URL apotek-app (via Docker network internal)
const SIMFAR_URL = process.env.SIMFAR_URL || 'http://apotek-sehatfarma:3000';

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      telepon TEXT NOT NULL UNIQUE,
      npwp TEXT DEFAULT '',
      alamat TEXT DEFAULT '',
      email TEXT DEFAULT '',
      kategori TEXT DEFAULT 'Umum',
      password TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customer(id)
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
  console.log(`✓ Produk diambil dari: ${SIMFAR_URL}/api/publik/produk`);
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

// Ambil produk via HTTP dari apotek-app
async function getProdukSimfar(search = '', limit = 24, offset = 0) {
  try {
    const page = Math.floor(offset / limit) + 1;
    const url = `${SIMFAR_URL}/api/publik/produk?search=${encodeURIComponent(search)}&page=${page}`;
    const res = await fetch(url, { timeout: 5000 });
    const json = await res.json();
    return { items: json.items || [], total: json.total || 0 };
  } catch (e) {
    console.error('getProdukSimfar error:', e.message);
    return { items: [], total: 0 };
  }
}

// Ambil satu produk via HTTP
async function getProdukById(id) {
  try {
    const res = await fetch(`${SIMFAR_URL}/api/publik/produk/${id}`, { timeout: 5000 });
    const json = await res.json();
    return json.success ? json.data : null;
  } catch (e) {
    console.error('getProdukById error:', e.message);
    return null;
  }
}

module.exports = { db, initDatabase, getPengaturan, genKodeOrder, getProdukSimfar, getProdukById };
