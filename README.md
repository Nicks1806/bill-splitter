# 🧾 Split Bill

Web app simpel buat bagi-bagi tagihan (makan, belanja, dll) ke beberapa orang. Masing-masing bayar sesuai apa yang dia ambil + pajak/service dibagi proporsional (adil — yang ambil banyak bayar pajak lebih banyak juga).

## ✨ Fitur

- 👥 Tambah siapa aja yang ikut bayar
- 🍽️ Tambah barang/menu, assign ke 1 orang atau di-share ke beberapa orang (auto bagi rata)
- 💰 Pajak %, Service Charge %, dan Diskon (% atau Rp)
- 📊 Hitungan otomatis per orang + breakdown rinci
- 📸 **Scan foto struk** otomatis (pakai OCR — gratis, jalan di browser, gak butuh internet/API)
- 🔗 **Share link** — encode tagihan ke URL, kirim ke temen, mereka bisa langsung lihat tagihannya
- 💾 Riwayat tersimpan di browser (localStorage)
- 📱 Mobile-friendly, cocok dipake langsung di HP pas lagi di tempat

## 🚀 Cara Pakai

### Cara paling cepat
Double-click file `index.html` → langsung kebuka di browser.

> ℹ️ Karena pake fitur Clipboard API (buat "Salin Link Share"), beberapa browser butuh halaman dibuka via HTTP/HTTPS, bukan file://. Kalau tombol share gagal, app otomatis kasih prompt buat copy manual.

### Cara host dengan local server (recommended)
Buka folder ini di terminal/PowerShell, lalu jalankan salah satu:

```bash
# Python 3
python -m http.server 8000

# Node.js (kalo punya npx)
npx serve

# atau langsung pake VS Code Live Server extension
```

Lalu buka http://localhost:8000

### Deploy ke Vercel (gratis)
1. Push repo ini ke GitHub
2. Buka [vercel.com](https://vercel.com) → New Project → Import repo
3. Vercel auto-detect static site → klik Deploy
4. Done — dapet URL `.vercel.app` yang bisa di-share

Atau drag folder ke [netlify.com/drop](https://app.netlify.com/drop) buat alternatif.

## 📝 Cara Pakai App

1. **Isi info tagihan** — judul (contoh: "Makan di Bu Tini") + tanggal.
2. **Tambah orang** — ketik nama, klik Tambah (atau tekan Enter).
3. **Tambah barang** — klik "+ Tambah Barang", isi nama + harga + jumlah, pilih siapa yang ambil.
   - Kalau gak ada yang dipilih → otomatis dibagi rata ke semua orang (cocok buat barang shared kayak air mineral).
4. **(Opsional) Scan foto struk** — upload foto, OCR otomatis baca itemnya. Edit kalau ada yang salah, baru klik tambah.
5. **Isi pajak/service/diskon** — sesuai struk.
6. **Lihat ringkasan** — tiap orang tagihannya berapa, dengan breakdown rinci.
7. **Share** — klik "Salin Link Share", paste ke chat. Atau "Simpan ke Riwayat" buat catatan.

## 🧮 Cara Hitungnya Adil?

Misal 3 orang split tagihan, total subtotal Rp 300.000, pajak 10%, service 5%:

- A ambil item Rp 150.000 → bayar 50% × pajak & service
- B ambil item Rp 100.000 → bayar 33.3% × pajak & service
- C ambil item Rp 50.000 → bayar 16.7% × pajak & service

Pajak diterapkan setelah service charge (sesuai konvensi struk Indonesia: PB1 dihitung dari subtotal + service charge).

Kalau ada item yang di-share (contoh: 2 orang minum air mineral Rp 10.000), harganya otomatis dibagi rata di antara mereka (Rp 5.000 per orang).

## 🛠️ Stack

- HTML + CSS + JavaScript murni (no build step!)
- [Tailwind CSS](https://tailwindcss.com/) via CDN
- [Tesseract.js](https://tesseract.projectnaptha.com/) buat OCR client-side
- Data semua di browser (localStorage) — nothing leaves your device

## 📂 Struktur File

```
bill-splitter/
├── index.html           ← halaman utama
├── styles.css           ← styling tambahan
├── js/
│   ├── utils.js         ← helper umum (format Rupiah, dll)
│   ├── state.js         ← state app + simpan/load
│   ├── calculator.js    ← logika hitung adil
│   ├── share.js         ← encode/decode share link
│   ├── ocr.js           ← scan struk (Tesseract)
│   ├── ui.js            ← render UI
│   └── app.js           ← wire-up event
└── README.md            ← file ini
```

## 🔒 Privasi

Semua data disimpan di browser kamu. Tidak ada server, tidak ada akun, tidak ada tracking. Share link cuma berisi data tagihan yang di-encode — kalau gak di-share, gak ada yang tau.
