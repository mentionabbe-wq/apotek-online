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

// Middleware ambil customer dari session (opsional)
function getCustomer(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  try {
    return db.prepare('SELECT c.* FROM sessions s JOIN customer c ON s.customer_id=c.id WHERE s.token=?').get(token);
  } catch { return null; }
}

// Kirim notifikasi ke apotek-app
async function notifSimfar(payload) {
  const webhookUrl = process.env.SIMFAR_WEBHOOK;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 5000
    });
  } catch (e) {
    console.warn('Notif SehatFarma gagal:', e.message);
  }
}

// POST /api/order/checkout
router.post('/checkout', async (req, res) => {
  const { nama, telepon, alamat, email, catatan, items, metode_bayar, jatuh_tempo } = req.body;
  const customer = getCustomer(req);

  const nmFinal   = nama   || customer?.nama   || '';
  const tlpFinal  = telepon|| customer?.telepon|| '';
  const almFinal  = alamat || customer?.alamat  || '';
  const kategori  = customer?.kategori || 'Umum';

  if (!nmFinal || !tlpFinal || !items?.length)
    return res.status(400).json({ success: false, message: 'Nama, telepon, dan item wajib diisi' });

  const metodeFinal = ['cod','transfer','qris','tempo'].includes(metode_bayar) ? metode_bayar : 'transfer';

  try {
    let subtotal = 0;
    const validItems = [];

    for (const item of items) {
      const produk = await getProdukById(item.obat_id);
      if (!produk) return res.status(400).json({ success: false, message: `Produk tidak ditemukan: ${item.nama_obat}` });

      const qtyKecil = item.qty_kecil || item.jumlah;
      if (produk.stok < qtyKecil)
        return res.status(400).json({ success: false, message: `Stok ${produk.nama} tidak cukup (tersisa ${produk.stok})` });

      const harga = item.harga_unit || produk.harga_jual;
      const sub = harga * item.jumlah;
      subtotal += sub;
      validItems.push({
        ...produk,
        jumlah: item.jumlah,
        qty_kecil: qtyKecil,
        unit_label: item.unit_label || produk.satuan,
        harga_jual: harga,
        subtotal: sub
      });
    }

    const ongkir = parseFloat(getPengaturan('ongkirDefault')) || 0;
    const total = subtotal + ongkir;
    const kode = genKodeOrder();

    // Status awal berdasarkan metode bayar
    const statusAwal = metodeFinal === 'cod' ? 'diproses' : 'menunggu_bayar';

    db.transaction(() => {
      let cust = db.prepare('SELECT id FROM customer WHERE telepon=?').get(tlpFinal);
      if (!cust) {
        db.prepare('INSERT INTO customer (nama,telepon,alamat,email,kategori) VALUES (?,?,?,?,?)').run(nmFinal, tlpFinal, almFinal, email||'', kategori);
        cust = db.prepare('SELECT id FROM customer WHERE telepon=?').get(tlpFinal);
      }

      db.prepare(`INSERT INTO order_online (kode,customer_id,customer_nama,customer_telepon,customer_alamat,catatan,subtotal,ongkir,total,metode_bayar,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(kode, cust.id, nmFinal, tlpFinal, almFinal, catatan||'', subtotal, ongkir, total, metodeFinal, statusAwal);

      const orderId = db.prepare('SELECT last_insert_rowid() as id').get().id;

      for (const item of validItems) {
        db.prepare(`INSERT INTO order_detail (order_id,obat_id,nama_obat,satuan,jumlah,harga_jual,subtotal) VALUES (?,?,?,?,?,?,?)`)
          .run(orderId, item.id, item.nama, item.unit_label, item.jumlah, item.harga_jual, item.subtotal);
      }
    })();

    const order = db.prepare('SELECT * FROM order_online WHERE kode=?').get(kode);
    order.items = validItems;

    // Webhook ke apotek-app
    await notifSimfar({
      type: metodeFinal === 'tempo' ? 'tempo' : 'order_baru',
      kode,
      customer: nmFinal,
      telepon: tlpFinal,
      alamat: almFinal,
      catatan: catatan || '',
      total,
      kategori,
      metode_bayar: metodeFinal,
      jatuh_tempo: metodeFinal === 'tempo' ? (jatuh_tempo || null) : null,
      items: validItems.length,
      item_names: validItems.map(i => `${i.nama} x${i.jumlah} ${i.unit_label}`),
      items_detail: validItems.map(i => ({ obat_id: i.id, local_id: i.local_id||'', nama: i.nama, jumlah: i.qty_kecil, unit: 'kecil' })),
      waktu: new Date().toISOString()
    });

    const info = {
      noRekening: getPengaturan('noRekening'),
      namaRekening: getPengaturan('namaRekening'),
      namaBank: getPengaturan('namaBank')
    };

    res.json({ success: true, kode, total, ongkir, subtotal, metode_bayar: metodeFinal, info_bayar: info, message: 'Order berhasil dibuat' });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ success: false, message: 'Gagal membuat order: ' + err.message });
  }
});

// POST /api/order/:kode/bukti — upload bukti transfer/qris
router.post('/:kode/bukti', upload.single('bukti'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'File tidak ada' });

  const order = db.prepare('SELECT * FROM order_online WHERE kode=?').get(req.params.kode);
  if (!order) return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
  if (order.status !== 'menunggu_bayar') return res.status(400).json({ success: false, message: 'Order sudah diproses' });

  db.prepare(`UPDATE order_online SET bukti_bayar=?, status='menunggu_konfirmasi', updated_at=CURRENT_TIMESTAMP WHERE kode=?`)
    .run(`/uploads/bukti/${req.file.filename}`, req.params.kode);

  // Baca file & encode base64 agar bisa ditampilkan di apotek-app (lintas container)
  let buktiData = '';
  try {
    const buf = fs.readFileSync(path.join(uploadDir, req.file.filename));
    const mime = req.file.mimetype || 'image/jpeg';
    buktiData = `data:${mime};base64,${buf.toString('base64')}`;
  } catch {}

  notifSimfar({
    type: 'bukti_bayar',
    kode: req.params.kode,
    customer: order.customer_nama,
    telepon: order.customer_telepon,
    total: order.total,
    metode_bayar: order.metode_bayar,
    bukti_data: buktiData,
    waktu: new Date().toISOString()
  });

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
