const express = require('express');
const router = express.Router();
const { db, getPengaturan } = require('../database');

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
