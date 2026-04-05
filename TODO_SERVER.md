# Daftar Tugas & Perbaikan Bug Sistem Backend (Bot Anon/Media)

## 🚨 Bug Kritis (Prioritas Tinggi)
- [x] **Migrasi Album Handler ke `sendMediaGroup` (Moderasi & Distribusi)**
  - **Lokasi:** `src/handlers/album.js` (Baris 77, 87) & `src/handlers/distribution.js` (Baris 22)
  - **Deskripsi:** `copyMessages` tidak mendukung modifikasi `caption` (untuk info pengirim) dan `reply_markup` pada album. Saat ini kembaliannya berupa array pesan yang menyebabkan error saat diakses sebagai objek tunggal (baris 87).
  - **Solusi:** 
    1. Gunakan `sendMediaGroup` untuk mengirim album dengan array media yang sudah disiapkan.
    2. Kirim pesan informasi user + tombol inline moderasi sebagai pesan teks terpisah (Opsi B).
    3. Simpan `message_id` dari pesan teks kontrol tersebut ke database `moderator_message_id` guna keperluan validasi callback moderasi.
- [x] **Absensinya Middleware Blacklist**
  - **Lokasi:** Global Handler
  - **Deskripsi:** Middleware untuk mengecek status `blacklist` user telah diimplementasikan di route utama, sehingga user yang diblokir akan ditolak aksesnya secara otomatis.
  - **Solusi:** Membuat `src/middleware/blacklist.js` dan mendaftarkannya di `server.js` sebelum middleware lainnya.

## ⚠️ Bug Medium
- [x] **Rating Calculation Gagal Update / Logic Flaw**
  - **Lokasi:** `src/handlers/distribution.js` (Baris 100)
  - **Deskripsi:** Query rating sebelumnya rentan terhadap ketidaktepatan presisi MySQL.
  - **Solusi:** Menggunakan kalkulasi manual yang presisi (toFixed 2) sebelum diinput ke database serta memperbarui pesan di channel secara otomatis.
- [x] **Timeout Handling Kurang Aman (Memory/Edge Case)**
  - **Lokasi:** `src/handlers/album.js` (Baris 46)
  - **Deskripsi:** Jika fungsi `processAlbum` gagal karena throw error (misal API Telegram down), proses akan dibatalkan, namun *timeout state* dan *memory leak* dari reference bot caching bisa tak terpenuhi bersih. 
  - **Solusi:** Validasi menggunakan `try/catch/finally` yang memadai, dan pembersihan timer/cache diletakkan di bagian awal blok `try`.
- [x] **Batas 10 Media Per Album Belum Dicek**
  - **Lokasi:** `src/handlers/album.js` (Baris 29)
  - **Deskripsi:** Array `album.message_ids.push(...)` bisa melebihi 10 apabila user curang/spam. Ini menyebabkan Telegram API menolak permintaan dengan *Bad Request*.
  - **Solusi:** Hentikan push jika `len >= 10` dan berikan peringatan ke user.

## 🛠️ Desain UI / Fitur Minus (Bug Minor)
- [x] **Web App Crash Tanpa Penanganan Kesalahan**
  - **Lokasi:** `src/handlers/webapp.js` (Jika query Gagal)
  - **Deskripsi:** API endpoint WebApp harus diamankan dengan Exception dan Response JSON valid.
  - **Solusi:** Menambahkan blok `try-catch` global pada semua fungsi handler API WebApp.
- [x] **Pesan Publik Tidak Sinkron Saat Rating Berubah**
  - **Lokasi:** `src/handlers/moderation.js` / `distribution.js`
  - **Deskripsi:** Link ke menu Channel sebelumnya tidak pernah diperbaharui setelah pengiriman pertama.
  - **Solusi:** Menyimpan `channel_message_id` ke database dan melakukan `editMessageText` ke channel publik setiap kali ada rating baru.
- [x] **Deteksi/Validasi Album Duplikat Gagal**
  - **Deskripsi:** User bisa melakukan *forward* kembali album persis yang baru diajukan tanpa batas. 
  - **Solusi:** Menambahkan deteksi duplikat berbasis caption + user ID dalam rentang waktu 30 menit terakhir.
- [x] **Pembuatan Akun Admin Tidak Berjalan Dinamis**
  - **Deskripsi:** Sistem tidak mengangkat akun admin utama dengan `ADMIN_USER_ID` di script ketika inisialisasi jika tidak ada di database.
  - **Solusi:** Menambahkan fungsi `initAdmin()` di `server.js` yang mengecek dan mendaftarkan admin otomatis saat startup.

## 📝 Catatan Audit Lain-lain:
- Isu mengenai *copyMessage* untuk Single Media sebenarnya **SUDAH BENAR** parameternya.
- Sistem kini lebih robust terhadap masalah memori dan keamanan API Telegram.

---
**Terkait Fitur yang Menyangkut Frontend (WebApp) & Backend:**
> Jika nanti ada fitur silang (contohnya perombakan data chart API statistik user dari Database ke Chart JS Frontend), akan dicantumkan pada file `TODO.md` secara khusus.
