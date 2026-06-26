const express = require('express');
const router = express.Router();
const { db } = require('../database');

// Middleware auth sederhana (pakai password dari pengaturan)
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  const saved = db.prepare("SELECT value FROM pengaturan WHERE key='adminKey'").get()?.value || 'admin123';
  if (key !== saved) return res.status(401).json({ success: false, message: 'Unauthorized' });
  next();
}

// GET /api/admin/orders?status=&page=
router.get('/orders', adminAuth, (req, res) => {
  const { status, page = 1 } = req.query;
  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;
  const where = status ? `WHERE status=?` : '';
  const params = status ? [status, limit, offset] : [limit, offset];
  const orders = db.prepare(`SELECT * FROM order_online ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as c FROM order_online ${where}`).get(status ? status : undefined)?.c || 0;
  res.json({ success: true, data: orders, total });
});

// GET /api/admin/orders/:kode
router.get('/orders/:kode', adminAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM order_online WHERE kode=?').get(req.params.kode);
  if (!order) return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
  const detail = db.prepare('SELECT * FROM order_detail WHERE order_id=?').all(order.id);
  res.json({ success: true, data: { ...order, detail } });
});

// PATCH /api/admin/orders/:kode/status
router.patch('/orders/:kode/status', adminAuth, (req, res) => {
  const { status } = req.body;
  const valid = ['menunggu_bayar', 'menunggu_konfirmasi', 'diproses', 'dikirim', 'selesai', 'dibatalkan'];
  if (!valid.includes(status)) return res.status(400).json({ success: false, message: 'Status tidak valid' });

  db.prepare("UPDATE order_online SET status=?, updated_at=CURRENT_TIMESTAMP WHERE kode=?").run(status, req.params.kode);
  res.json({ success: true, message: 'Status diperbarui' });
});

// GET /api/admin/stats — ringkasan dashboard
router.get('/stats', adminAuth, (req, res) => {
  const menunggu = db.prepare("SELECT COUNT(*) as c FROM order_online WHERE status='menunggu_konfirmasi'").get().c;
  const diproses = db.prepare("SELECT COUNT(*) as c FROM order_online WHERE status='diproses'").get().c;
  const hari_ini = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(total),0) as total FROM order_online WHERE DATE(created_at)=DATE('now')").get();
  const bulan_ini = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(total),0) as total FROM order_online WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')").get();
  res.json({ success: true, data: { menunggu_konfirmasi: menunggu, diproses, hari_ini, bulan_ini } });
});

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  const saved = db.prepare("SELECT value FROM pengaturan WHERE key='adminKey'").get()?.value || 'admin123';
  if (password !== saved) return res.status(401).json({ success: false, message: 'Password salah' });
  res.json({ success: true, key: saved });
});

module.exports = router;
