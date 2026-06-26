const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { db, genKodeOrder, getProdukById, getPengaturan } = require('../database');

const uploadDir = path.join(__dirname, '..', 'uploads', 'bukti');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `bukti_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Kirim notifikasi ke SehatFarma
async function notifSimfar(order) {
  const webhookUrl = process.env.SIMFAR_WEBHOOK;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'order_baru',
        kode: order.kode,
        customer: order.customer_nama,
        telepon: order.customer_telepon,
        total: order.total,
        items: order.items?.length || 0,
        item_names: (order.items || []).map(i => `${i.nama} x${i.jumlah}`),
        items_detail: (order.items || []).map(i => ({ obat_id: i.id, nama: i.nama, jumlah: i.jumlah })),
        waktu: new Date().toISOString()
      }),
      timeout: 5000
    });
  } catch (e) {
    console.warn('Notif SehatFarma gagal (tidak masalah):', e.message);
  }
}

// POST /api/order/checkout
router.post('/checkout', async (req, res) => {
  const { nama, telepon, alamat, email, catatan, items, metode_bayar } = req.body;

  if (!nama || !telepon || !items?.length) {
    return res.status(400).json({ success: false, message: 'Nama, telepon, dan item wajib diisi' });
  }

  try {
    // Validasi & hitung dari data apotek-app
    let subtotal = 0;
    const validItems = [];

    for (const item of items) {
      const produk = await getProdukById(item.obat_id);
      if (!produk) return res.status(400).json({ success: false, message: `Produk tidak ditemukan: ${item.nama_obat}` });
      if (produk.stok < item.jumlah) return res.status(400).json({ success: false, message: `Stok ${produk.nama} tidak cukup (tersisa ${produk.stok})` });

      const sub = produk.harga_jual * item.jumlah;
      subtotal += sub;
      validItems.push({ ...produk, jumlah: item.jumlah, harga_jual: produk.harga_jual, subtotal: sub });
    }

    const ongkir = parseFloat(getPengaturan('ongkirDefault')) || 0;
    const total = subtotal + ongkir;
    const kode = genKodeOrder();

    db.transaction(() => {
      // Simpan/update customer
      let customer = db.prepare('SELECT id FROM customer WHERE telepon=?').get(telepon);
      if (!customer) {
        db.prepare('INSERT INTO customer (nama,telepon,alamat,email) VALUES (?,?,?,?)').run(nama, telepon, alamat || '', email || '');
        customer = db.prepare('SELECT id FROM customer WHERE telepon=?').get(telepon);
      }

      db.prepare(`INSERT INTO order_online (kode,customer_id,customer_nama,customer_telepon,customer_alamat,catatan,subtotal,ongkir,total,metode_bayar)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(kode, customer.id, nama, telepon, alamat || '', catatan || '', subtotal, ongkir, total, metode_bayar || 'transfer');

      const orderId = db.prepare('SELECT last_insert_rowid() as id').get().id;

      for (const item of validItems) {
        db.prepare(`INSERT INTO order_detail (order_id,obat_id,nama_obat,satuan,jumlah,harga_jual,subtotal) VALUES (?,?,?,?,?,?,?)`)
          .run(orderId, item.id, item.nama, item.satuan, item.jumlah, item.harga_jual, item.subtotal);
      }
    })();

    const order = db.prepare('SELECT * FROM order_online WHERE kode=?').get(kode);
    order.items = validItems;

    // Kirim notif ke SehatFarma (async, tidak blocking)
    notifSimfar(order);

    // Info pembayaran
    const info = {
      noRekening: getPengaturan('noRekening'),
      namaRekening: getPengaturan('namaRekening'),
      namaBank: getPengaturan('namaBank')
    };

    res.json({ success: true, kode, total, ongkir, subtotal, info_bayar: info, message: 'Order berhasil dibuat' });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ success: false, message: 'Gagal membuat order: ' + err.message });
  }
});

// POST /api/order/:kode/bukti — upload bukti transfer
router.post('/:kode/bukti', upload.single('bukti'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'File tidak ada' });

  const order = db.prepare('SELECT * FROM order_online WHERE kode=?').get(req.params.kode);
  if (!order) return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
  if (order.status !== 'menunggu_bayar') return res.status(400).json({ success: false, message: 'Order sudah diproses' });

  db.prepare(`UPDATE order_online SET bukti_bayar=?, status='menunggu_konfirmasi', updated_at=CURRENT_TIMESTAMP WHERE kode=?`)
    .run(`/uploads/bukti/${req.file.filename}`, req.params.kode);

  // Notif ulang ke SehatFarma — ada bukti bayar baru
  notifSimfar({ ...order, kode: req.params.kode, status: 'menunggu_konfirmasi', tipe: 'bukti_bayar' });

  res.json({ success: true, message: 'Bukti pembayaran berhasil dikirim' });
});

// GET /api/order/:kode — cek status order
router.get('/:kode', (req, res) => {
  const order = db.prepare('SELECT * FROM order_online WHERE kode=?').get(req.params.kode);
  if (!order) return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
  const detail = db.prepare('SELECT * FROM order_detail WHERE order_id=?').all(order.id);
  res.json({ success: true, data: { ...order, detail } });
});

module.exports = router;
