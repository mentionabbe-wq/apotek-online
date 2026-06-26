const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/produk',     require('./routes/produk'));
app.use('/api/order',      require('./routes/order'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/pengaturan', require('./routes/pengaturan'));

// 404 API
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

initDatabase();

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  Apotek Online`);
  console.log(`  Port  : ${PORT}`);
  console.log(`  Toko  : http://localhost:${PORT}`);
  console.log(`  Admin : http://localhost:${PORT}/admin.html`);
  console.log(`========================================\n`);
});
