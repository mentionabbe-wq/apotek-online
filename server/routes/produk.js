const express = require('express');
const router = express.Router();
const { getProdukSimfar, getProdukById } = require('../database');

// GET /api/produk?search=&page=1
router.get('/', async (req, res) => {
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 24;
  const offset = (page - 1) * limit;
  const result = await getProdukSimfar(search, limit, offset);
  res.json({ success: true, ...result, page, limit });
});

// GET /api/produk/:id
router.get('/:id', async (req, res) => {
  const produk = await getProdukById(parseInt(req.params.id));
  if (!produk) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
  res.json({ success: true, data: produk });
});

module.exports = router;
