const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const SYSTEM_PROMPT = `Kamu adalah asisten apotek online yang membantu pelanggan menjawab pertanyaan seputar obat-obatan dan kesehatan.

Panduan:
- Jawab pertanyaan tentang obat: kegunaan, dosis umum, efek samping, cara konsumsi, kontraindikasi
- Selalu sarankan konsultasi dokter untuk kondisi serius atau resep
- Jangan diagnosa penyakit secara langsung
- Gunakan bahasa Indonesia yang ramah dan mudah dipahami
- Jika ditanya produk apotek, sarankan pelanggan untuk cek katalog produk di halaman utama
- Jawaban singkat dan jelas, maksimal 3-4 kalimat kecuali memang perlu penjelasan lebih

Contoh pertanyaan yang bisa dijawab:
- Kegunaan paracetamol, ibuprofen, amoxicillin, antasida, dll
- Cara minum obat yang benar
- Obat apa untuk gejala tertentu (flu, demam, sakit kepala, dll)
- Interaksi obat sederhana
- Penyimpanan obat
- Apa itu resep dokter dan kapan diperlukan`;

// Jawaban fallback berbasis aturan jika tidak ada API key
const FAQ = [
  { kata: ['paracetamol','parasetamol','acetaminophen'], jawab: 'Paracetamol digunakan untuk meredakan demam dan nyeri ringan hingga sedang seperti sakit kepala, nyeri otot, dan nyeri gigi. Dosis dewasa umumnya 500mg–1g setiap 4–6 jam, maksimal 4g per hari. Konsumsi setelah makan untuk mengurangi iritasi lambung.' },
  { kata: ['ibuprofen'], jawab: 'Ibuprofen adalah obat antiinflamasi nonsteroid (NSAID) untuk meredakan nyeri, demam, dan peradangan. Dosis dewasa: 200–400mg setiap 4–6 jam bersama makanan. Hindari jika punya masalah lambung atau ginjal. Konsultasi dokter untuk penggunaan jangka panjang.' },
  { kata: ['amoxicillin','amoksisilin'], jawab: 'Amoxicillin adalah antibiotik untuk infeksi bakteri seperti radang tenggorokan, infeksi saluran kemih, dan pneumonia. Wajib habiskan sesuai resep dokter meski gejala sudah membaik. Tidak efektif untuk infeksi virus seperti flu biasa.' },
  { kata: ['antasida','maag','lambung','mag'], jawab: 'Antasida digunakan untuk meredakan nyeri ulu hati, kembung, dan asam lambung berlebih. Diminum 1–2 jam setelah makan atau saat gejala muncul. Jangan konsumsi bersamaan dengan obat lain karena dapat mengganggu penyerapan.' },
  { kata: ['vitamin c','vitamin c'], jawab: 'Vitamin C berperan sebagai antioksidan dan mendukung sistem imun. Kebutuhan harian dewasa sekitar 65–90mg, namun suplemen biasanya 250–1000mg. Konsumsi berlebihan (>2000mg/hari) dapat menyebabkan diare dan gangguan pencernaan.' },
  { kata: ['cetirizine','cetirizin','alergi'], jawab: 'Cetirizine adalah antihistamin generasi kedua untuk mengatasi alergi seperti rhinitis alergi, gatal-gatal, dan biduran. Dosis dewasa: 10mg sekali sehari. Efek kantuk lebih minimal dibanding antihistamin generasi pertama.' },
  { kata: ['omeprazole','omeprazol'], jawab: 'Omeprazole adalah obat penghambat pompa proton (PPI) untuk mengurangi produksi asam lambung. Digunakan untuk GERD, tukak lambung, dan dispepsia. Biasanya diminum 30 menit sebelum makan pagi, dengan resep dokter.' },
  { kata: ['metformin'], jawab: 'Metformin adalah obat antidiabetes untuk menurunkan kadar gula darah pada diabetes tipe 2. Dikonsumsi bersama makanan untuk mengurangi efek samping pencernaan. Harus dengan resep dokter dan pemantauan rutin.' },
  { kata: ['salbutamol','ventolin','asma'], jawab: 'Salbutamol (Ventolin) adalah bronkodilator untuk meredakan serangan asma dan sesak napas. Digunakan melalui inhaler sesuai petunjuk dokter. Segera ke dokter/IGD jika serangan asma tidak membaik setelah penggunaan.' },
  { kata: ['demam','panas','fever'], jawab: 'Untuk demam ringan (37.5–38.5°C), perbanyak minum air dan istirahat. Paracetamol 500mg dapat membantu menurunkan demam. Segera ke dokter jika demam di atas 39°C, berlangsung lebih dari 3 hari, atau disertai kejang.' },
  { kata: ['diare'], jawab: 'Untuk diare, yang terpenting adalah mencegah dehidrasi dengan minum oralit atau banyak cairan. Oralit siap pakai tersedia di apotek. Hindari makanan berminyak dan pedas. Konsultasi dokter jika diare berlangsung lebih dari 2 hari atau disertai darah.' },
  { kata: ['batuk'], jawab: 'Pilihan obat batuk tergantung jenisnya: batuk berdahak gunakan ekspektoran (misal GG/guaifenesin), batuk kering gunakan antitusif (misal DMP/dextromethorphan). Madu hangat + jeruk nipis juga bisa membantu. Konsultasi dokter jika batuk lebih dari 2 minggu.' },
  { kata: ['flu','pilek','influenza'], jawab: 'Flu disebabkan virus sehingga tidak perlu antibiotik. Istirahat cukup, perbanyak minum air, dan konsumsi obat simtomatik: paracetamol untuk demam, dekongestan untuk hidung tersumbat, antihistamin untuk pilek. Biasanya sembuh dalam 7–10 hari.' },
  { kata: ['expired','kadaluarsa','kedaluwarsa'], jawab: 'Jangan gunakan obat yang sudah kadaluarsa. Obat kadaluarsa dapat kehilangan efektivitas atau bahkan berbahaya. Buang obat kadaluarsa ke tempat pengumpulan khusus atau apotek — jangan dibuang ke toilet/tempat sampah biasa.' },
  { kata: ['simpan','penyimpanan','menyimpan'], jawab: 'Simpan obat di tempat sejuk, kering, dan terhindar dari sinar matahari langsung (kecuali ada petunjuk khusus). Jauhkan dari jangkauan anak-anak. Obat cair dan beberapa antibiotik perlu disimpan di kulkas. Selalu ikuti petunjuk penyimpanan di kemasan.' },
  { kata: ['resep','dokter'], jawab: 'Obat keras seperti antibiotik, obat diabetes, obat jantung, dan psikiatri memerlukan resep dokter. Di apotek kami, obat dengan resep hanya dapat dibeli dengan membawa resep yang sah. Jangan konsumsi obat keras tanpa pengawasan dokter.' },
];

function jawabFallback(pesan) {
  const q = pesan.toLowerCase();
  for (const f of FAQ) {
    if (f.kata.some(k => q.includes(k))) return f.jawab;
  }
  return 'Terima kasih atas pertanyaannya. Untuk informasi lebih akurat terkait kondisi Anda, sebaiknya konsultasikan langsung dengan apoteker atau dokter kami. Anda juga bisa menghubungi kami melalui nomor telepon yang tertera di halaman apotek.';
}

// POST /api/chat
router.post('/', async (req, res) => {
  const { pesan, riwayat = [] } = req.body;
  if (!pesan) return res.status(400).json({ success: false });

  if (!ANTHROPIC_API_KEY) {
    return res.json({ success: true, jawaban: jawabFallback(pesan) });
  }

  try {
    const messages = [
      ...riwayat.slice(-6).map(r => ({ role: r.role, content: r.content })),
      { role: 'user', content: pesan }
    ];

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages
      }),
      timeout: 15000
    });
    const j = await r.json();
    const jawaban = j.content?.[0]?.text || jawabFallback(pesan);
    res.json({ success: true, jawaban });
  } catch {
    res.json({ success: true, jawaban: jawabFallback(pesan) });
  }
});

module.exports = router;
