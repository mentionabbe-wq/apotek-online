const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { db, getPengaturan } = require('../database');

const SIMFAR_URL = process.env.SIMFAR_URL || 'http://apotek-sehatfarma:3000';

// Cache QRIS agar tidak menembak apotek-app tiap checkout
let _bayarCache = { data: null, at: 0 };

// GET /api/pengaturan/pembayaran — QRIS statis & rekening dari apotek-app
router.get('/pembayaran', async (req, res) => {
  const now = Date.now();
  if (_bayarCache.data && now - _bayarCache.at < 60000) {
    return res.json({ success: true, data: _bayarCache.data });
  }
  try {
    const r = await fetch(`${SIMFAR_URL}/api/publik/pembayaran`, { timeout: 5000 });
    const j = await r.json();
    const data = j.data || { qris: '', rekening: [] };
    _bayarCache = { data, at: now };
    res.json({ success: true, data });
  } catch (e) {
    // Fallback ke pengaturan lokal bila apotek-app tak terjangkau
    res.json({ success: true, data: {
      qris: '',
      rekening: [{ bank: getPengaturan('namaBank'), nomor: getPengaturan('noRekening'), atasNama: getPengaturan('namaRekening') }]
    }});
  }
});

// GET /api/pengaturan/publik — info apotek untuk tampil di toko
router.get('/publik', (req, res) => {
  const keys = ['namaApotek', 'alamat', 'telepon', 'noRekening', 'namaRekening', 'namaBank', 'ongkirDefault'];
  const data = {};
  for (const k of keys) data[k] = getPengaturan(k);
  res.json({ success: true, data });
});

// GET /api/pengaturan/semua (admin)
router.get('/semua', (req, res) => {
  const key = req.headers['x-admin-key'];
  const saved = getPengaturan('adminKey') || 'admin123';
  if (key !== saved) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const rows = db.prepare('SELECT * FROM pengaturan').all();
  const data = {};
  for (const r of rows) data[r.key] = r.value;
  res.json({ success: true, data });
});

// PATCH /api/pengaturan (admin)
router.patch('/', (req, res) => {
  const key = req.headers['x-admin-key'];
  const saved = getPengaturan('adminKey') || 'admin123';
  if (key !== saved) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const updates = req.body;
  const upd = db.prepare('INSERT OR REPLACE INTO pengaturan (key,value) VALUES (?,?)');
  db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) upd.run(k, String(v));
  })();
  res.json({ success: true, message: 'Pengaturan disimpan' });
});

module.exports = router;
