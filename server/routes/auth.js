const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { db } = require('../database');

const SIMFAR_URL = process.env.SIMFAR_URL || 'http://apotek-sehatfarma:3000';

async function syncPelangganKeApp(data) {
  try {
    await fetch(`${SIMFAR_URL}/api/publik/pelanggan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeout: 4000
    });
  } catch {}
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { nama, telepon, npwp, alamat, email, kategori, password } = req.body;
  if (!nama || !telepon || !password)
    return res.status(400).json({ success: false, message: 'Nama, telepon, dan password wajib diisi' });
  if (!['Umum', 'Medis'].includes(kategori))
    return res.status(400).json({ success: false, message: 'Kategori tidak valid' });

  try {
    const exists = db.prepare('SELECT id FROM customer WHERE telepon=?').get(telepon);
    if (exists) return res.status(409).json({ success: false, message: 'Nomor telepon sudah terdaftar' });

    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO customer (nama,telepon,npwp,alamat,email,kategori,password) VALUES (?,?,?,?,?,?,?)'
    ).run(nama, telepon, npwp||'', alamat||'', email||'', kategori||'Umum', hash);

    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token,customer_id) VALUES (?,?)').run(token, result.lastInsertRowid);

    // Sync ke pelanggan apotek-app (non-blocking)
    syncPelangganKeApp({ nama, telepon, alamat, npwp, email, kategori });

    res.json({ success: true, token, customer: { id: result.lastInsertRowid, nama, telepon, kategori } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { telepon, password } = req.body;
  if (!telepon || !password)
    return res.status(400).json({ success: false, message: 'Telepon dan password wajib diisi' });

  try {
    const customer = db.prepare('SELECT * FROM customer WHERE telepon=?').get(telepon);
    if (!customer) return res.status(401).json({ success: false, message: 'Nomor telepon tidak terdaftar' });

    const ok = await bcrypt.compare(password, customer.password);
    if (!ok) return res.status(401).json({ success: false, message: 'Password salah' });

    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token,customer_id) VALUES (?,?)').run(token, customer.id);

    res.json({ success: true, token, customer: { id: customer.id, nama: customer.nama, telepon: customer.telepon, npwp: customer.npwp, alamat: customer.alamat, email: customer.email, kategori: customer.kategori } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false });
  const session = db.prepare('SELECT s.*, c.nama, c.telepon, c.npwp, c.alamat, c.email, c.kategori FROM sessions s JOIN customer c ON s.customer_id=c.id WHERE s.token=?').get(token);
  if (!session) return res.status(401).json({ success: false, message: 'Sesi tidak valid' });
  res.json({ success: true, customer: { id: session.customer_id, nama: session.nama, telepon: session.telepon, npwp: session.npwp, alamat: session.alamat, email: session.email, kategori: session.kategori } });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  res.json({ success: true });
});

module.exports = router;
