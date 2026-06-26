// routes/notif.js — tambahkan ke server SehatFarma
// Daftarkan di server.js: app.use('/api/store/notif', require('./routes/notif'));

const express = require('express');
const router = express.Router();
const { db } = require('../database');

// POST /api/store/notif — terima notifikasi dari apotek-online
router.post('/', (req, res) => {
  const { type, kode, customer, telepon, total, items, waktu } = req.body;

  try {
    // Simpan notifikasi ke tabel store (sudah ada di SehatFarma)
    const notifList = (() => {
      try {
        const row = db.prepare("SELECT value FROM store WHERE key='order_online_notif'").get();
        return row ? JSON.parse(row.value) : [];
      } catch { return []; }
    })();

    notifList.unshift({
      id: Date.now(),
      type: type || 'order_baru',
      kode, customer, telepon,
      total, items,
      waktu: waktu || new Date().toISOString(),
      dibaca: false
    });

    // Simpan max 50 notifikasi
    const trimmed = notifList.slice(0, 50);
    db.prepare("INSERT OR REPLACE INTO store (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)")
      .run('order_online_notif', JSON.stringify(trimmed));

    res.json({ success: true });
  } catch (err) {
    console.error('Notif error:', err);
    res.status(500).json({ success: false });
  }
});

// GET /api/store/notif — ambil daftar notifikasi (untuk polling dari frontend SehatFarma)
router.get('/', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM store WHERE key='order_online_notif'").get();
    const list = row ? JSON.parse(row.value) : [];
    const belumDibaca = list.filter(n => !n.dibaca).length;
    res.json({ success: true, data: list, belum_dibaca: belumDibaca });
  } catch {
    res.json({ success: true, data: [], belum_dibaca: 0 });
  }
});

// PATCH /api/store/notif/baca — tandai semua sudah dibaca
router.patch('/baca', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM store WHERE key='order_online_notif'").get();
    const list = row ? JSON.parse(row.value) : [];
    const updated = list.map(n => ({ ...n, dibaca: true }));
    db.prepare("INSERT OR REPLACE INTO store (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)")
      .run('order_online_notif', JSON.stringify(updated));
    res.json({ success: true });
  } catch { res.json({ success: false }); }
});

module.exports = router;
