# Apotek Online — Panduan Install

## Struktur Project
```
apotek-online/
├── server/
│   ├── server.js
│   ├── database.js
│   └── routes/
│       ├── produk.js
│       ├── order.js
│       ├── admin.js
│       └── pengaturan.js
├── frontend/
│   ├── index.html        ← Toko untuk customer
│   └── admin.html        ← Panel admin
├── Dockerfile
├── docker-compose.yml
├── package.json
└── NOTIF_UNTUK_SIMFAR.js ← Pasang ke SehatFarma
```

---

## Langkah Install

### 1. Siapkan folder project
Taruh semua file sesuai struktur di atas.

### 2. Pasang notifikasi ke SehatFarma (PENTING)
- Copy isi `NOTIF_UNTUK_SIMFAR.js` ke file baru: `server/routes/notif.js` di project SehatFarma
- Tambahkan baris ini di `server.js` SehatFarma (setelah baris `/api/store`):
  ```js
  app.use('/api/store/notif', require('./routes/notif'));
  ```
- Rebuild SehatFarma:
  ```bash
  docker compose -f /path/ke/simfar/docker-compose.yml up -d --build
  ```

### 3. Build & jalankan apotek-online
```bash
cd apotek-online
docker compose up -d --build
```

### 4. Akses
- **Toko customer**: http://[IP-CasaOS]:3001
- **Admin panel**: http://[IP-CasaOS]:3001/admin.html
- Password admin default: `admin123`

---

## Cara Kerja Notifikasi di SehatFarma
Tambahkan script ini di `frontend/index.html` SehatFarma, sebelum tag `</body>`:

```html
<script>
// Polling notifikasi order online setiap 30 detik
async function cekNotifOrder() {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const r = await fetch('/api/store/notif', { headers: { 'Authorization': 'Bearer ' + token } });
    const j = await r.json();
    if (j.success && j.belum_dibaca > 0) {
      // Tampilkan popup notifikasi
      const latest = j.data.find(n => !n.dibaca);
      if (latest) showOrderNotif(latest, j.belum_dibaca);
    }
  } catch {}
}

function showOrderNotif(order, total) {
  // Hapus notif lama jika ada
  document.getElementById('orderNotifBadge')?.remove();

  const el = document.createElement('div');
  el.id = 'orderNotifBadge';
  el.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:#16a34a; color:white; border-radius:14px;
    padding:14px 18px; max-width:300px; cursor:pointer;
    box-shadow:0 8px 24px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease;
  `;
  el.innerHTML = `
    <style>@keyframes slideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}</style>
    <div style="font-weight:700;font-size:0.9rem">🛒 Order Online Baru!</div>
    <div style="font-size:0.8rem;margin-top:4px;opacity:0.9">${order.customer} — ${rupiah(order.total)}</div>
    <div style="font-size:0.75rem;margin-top:2px;opacity:0.75">Kode: ${order.kode}</div>
    ${total > 1 ? `<div style="font-size:0.72rem;margin-top:4px;opacity:0.75">+${total-1} order lainnya menunggu</div>` : ''}
    <div style="font-size:0.72rem;margin-top:8px;opacity:0.8">Klik untuk tandai dibaca ✕</div>
  `;
  el.onclick = async () => {
    await fetch('/api/store/notif/baca', { method:'PATCH', headers:{'Authorization':'Bearer '+(localStorage.getItem('token')||'')} });
    el.remove();
  };
  document.body.appendChild(el);

  // Auto tutup 15 detik
  setTimeout(() => el.remove(), 15000);
}

function rupiah(n) { return 'Rp '+(n||0).toLocaleString('id-ID'); }

// Mulai polling
cekNotifOrder();
setInterval(cekNotifOrder, 30000);
</script>
```

---

## Pengaturan Toko
Masuk ke `admin.html` → menu Pengaturan:
- Nama apotek, alamat, telepon
- Nomor rekening untuk transfer
- Ongkir default (0 = gratis)
- Ganti password admin

## Alur Order Customer
1. Buka toko → pilih produk → keranjang
2. Isi data pengiriman → konfirmasi order
3. Transfer ke rekening yang tertera
4. Upload foto bukti transfer
5. SehatFarma dapat notifikasi popup → admin konfirmasi → proses order
