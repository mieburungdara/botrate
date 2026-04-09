# Laporan Lengkap Sistem Monetisasi BotRate

## 📊 Gambaran Umum
BotRate adalah platform konten kreator berbasis Telegram Bot dengan sistem monetisasi berbasis donasi. Sistem menggunakan dompet digital internal dengan pembagian hasil yang jelas antara kreator dan admin platform. Semua transaksi menggunakan mata uang Rupiah (IDR).

---

## 💰 Bagaimana Kreator Menghasilkan Uang

### Sumber Pendapatan Utama Kreator
Saat ini, satu-satunya sumber pendapatan untuk kreator adalah melalui **donasi dari penonton** yang melihat konten mereka.

#### Fitur Donasi:
- Setiap konten (album/media) yang dipublikasikan dan disetujui secara otomatis memiliki tombol donasi
- Penonton dapat memilih nominal preset:
  - Rp 1.000
  - Rp 5.000
  - Rp 10.000
  - Rp 25.000
  - Rp 50.000
  - Rp 100.000
- Atau memasukkan nominal custom sesuai keinginan
- **Batas donasi**: Minimal Rp 1.000 | Maksimal Rp 100.000.000

#### Pembagian Hasil Donasi
| Pihak | Persentase | Keterangan |
|-------|------------|------------|
| Kreator | 90% | Diterima otomatis ke dompet kreator |
| Admin Platform | 10% | Fee layanan yang diambil sistem |

**Contoh perhitungan**:
> Jika penonton mendonasikan Rp 10.000:
> - Kreator menerima: Rp 9.000
> - Admin platform menerima: Rp 1.000

### Syarat Kreator Bisa Tarik Uang
Kreator hanya bisa melakukan penarikan saldo jika memenuhi syarat berikut:
1. ✅ Akun sudah terverifikasi KYC (upload KTP + selfie)
2. ✅ Saldo di dompet minimal **Rp 10.000**
3. ✅ Tidak ada penarikan yang sedang diproses

### Batas Penarikan Kreator
- Minimal penarikan: Rp 10.000
- Maksimal penarikan per request: Rp 10.000.000
- Admin akan memproses penarikan secara manual

---

## 🛡️ Bagaimana Admin Mendapatkan Pendapatan

### Sumber Pendapatan Admin Platform
Admin platform mendapatkan pendapatan dari beberapa sumber:

| Sumber Pendapatan | Persentase | Keterangan |
|-------------------|------------|------------|
| Komisi Donasi | 10% | Sumber pendapatan utama dari setiap transaksi donasi |
| Selisih Saldo Sistem | - | Dana yang tersisa di pool sistem dari top-up yang belum digunakan |

#### Cara Kerja Pendapatan Admin:
1. Setiap kali donasi terjadi, 10% dari nominal donasi **otomatis tetap berada di pool dana sistem**
2. Tidak ada pemisahan eksplisit "saldo admin" di database - pendapatan admin adalah selisih antara total top-up user dan total saldo semua user
3. Admin dapat melakukan penarikan manual dari pool dana sistem kapan saja

### Hak Akses Admin Terkait Monetisasi
- ✅ Memverifikasi dan menyetujui request top-up user
- ✅ Memproses dan menyetujui request penarikan kreator
- ✅ Melihat seluruh riwayat transaksi di sistem
- ✅ Melihat statistik pendapatan platform secara keseluruhan
- ✅ Mengubah parameter sistem (fee, batas penarikan, dll)

---

## 🔄 Alur Lengkap Sistem Monetisasi

```mermaid
flowchart TD
    A[User Top-Up Saldo] --> B[User upload bukti transfer]
    B --> C[Admin verifikasi bukti]
    C --> D{Verifikasi sukses?}
    D -->|Ya| E[Saldo user bertambah]
    D -->|Tidak| F[Top-up ditolak]
    
    E --> G[User buka konten kreator]
    G --> H[User pilih nominal donasi]
    H --> I[Cek saldo user cukup]
    I --> J{Saldo cukup?}
    J -->|Ya| K[Potong saldo user 100%]
    J -->|Tidak| L[Donasi gagal]
    
    K --> M[Tambah saldo kreator 90%]
    K --> N[10% tetap di pool sistem (pendapatan admin)]
    M & N --> O[Catat transaksi]
    O --> P[Kirim notifikasi ke user & kreator]
    
    Q[Kreator buat request penarikan] --> R[Saldo kreator di-lock sementara]
    R --> S[Admin review permintaan]
    S --> T{Disetujui?}
    T -->|Ya| U[Admin transfer manual ke rekening kreator]
    U --> V[Approve permintaan di sistem]
    T -->|Tidak| W[Kembalikan saldo ke kreator]
```

---

## ⚙️ Konfigurasi Sistem Saat Ini

Semua parameter monetisasi diatur di file `config/botrate.php`:

```php
<?php

return [
    'donation' => [
        'fee_percentage'    => 0.10, // 10% fee untuk admin
        'min_amount'        => 1000, // Rp 1.000
        'max_amount'        => 100000000, // Rp 100.000.000
    ],
    
    'withdrawal' => [
        'min_amount'        => 10000, // Rp 10.000
        'max_amount'        => 10000000, // Rp 10.000.000
        'processing_days'   => 1, // Proses maksimal 1 hari kerja
    ],
    
    'topup' => [
        'min_amount'        => 10000, // Rp 10.000
        'max_amount'        => 100000000, // Rp 100.000.000
    ],
    
    'verification' => [
        'required_for_withdrawal' => true,
    ],
];
```

---

## 📂 Struktur Kode Monetisasi

### File Utama Terkait Monetisasi:
| Lokasi File | Fungsi |
|-------------|--------|
| `app/Models/Transaction.php` | Model untuk semua jenis transaksi |
| `app/Models/Withdrawal.php` | Model untuk request penarikan |
| `app/Models/User.php` | Model user dengan kolom `balance` |
| `app/Http/Controllers/WalletController.php` | Endpoint dompet, topup, penarikan |
| `app/Http/Controllers/AdminController.php` | Endpoint admin untuk verifikasi |
| `app/Services/Telegram/Handlers/DonationHandler.php` | Logika penuh proses donasi |
| `config/botrate.php` | Semua konfigurasi monetisasi |

### Struktur Database Penting:

#### Tabel `transactions`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `type` | enum | `topup` / `donation` / `withdrawal` |
| `status` | enum | `pending` / `completed` / `failed` |
| `from_user_id` | bigint | Pengirim dana |
| `to_user_id` | bigint | Penerima dana |
| `amount` | decimal | Nominal transaksi |
| `payment_method` | string | Metode pembayaran |
| `payment_proof` | string | Path bukti transfer |

#### Tabel `users`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `balance` | decimal(15,2) | Saldo dompet user |
| `is_verified` | boolean | Status verifikasi KYC |
| `bank_name` | string | Nama bank untuk penarikan |
| `bank_number` | string | Nomor rekening |
| `bank_holder` | string | Nama pemilik rekening |

---

## 📈 Statistik & Laporan

### Laporan yang Tersedia untuk Admin:
1. **Total pendapatan platform** (akumulasi fee 10% dari semua donasi)
2. **Jumlah donasi per hari/minggu/bulan**
3. **Top kreator dengan pendapatan tertinggi**
4. **Riwayat semua transaksi** (dapat di-filter berdasarkan jenis, status, tanggal)
5. **Daftar request penarikan yang perlu diproses**

---

## ⚠️ Catatan Penting & Batasan Saat Ini

1. **Semua proses donasi berjalan OTOMATIS** - tidak perlu intervensi admin
2. **Top-up dan penarikan masih MANUAL** - admin harus memverifikasi setiap request satu persatu
3. **Belum ada payment gateway otomatis** - semua transfer dilakukan manual oleh admin
4. **Fee 10% bersifat tetap** - saat ini tidak ada sistem tier atau fee yang berbeda untuk kreator populer
5. **Pendapatan admin tidak dicatat secara eksplisit** - hanya dapat dihitung sebagai selisih saldo sistem
6. **Tidak ada fitur subscription atau paywall** - saat ini hanya donasi yang tersedia sebagai monetisasi

---

## 🚀 Rekomendasi Pengembangan Mendatang

Untuk meningkatkan sistem monetisasi di masa depan:
1. Tambahkan fitur **konten berbayar (paywall)** untuk kreator
2. Integrasikan **payment gateway otomatis** (Midtrans, Xendit) untuk top-up
3. Tambahkan sistem **tier kreator** dengan fee yang lebih rendah untuk kreator populer
4. Tambahkan fitur **referral program** untuk kreator
5. Tambahkan laporan pendapatan admin yang lebih detail dan otomatis

---

*Dokumen ini diperbarui pada 10 April 2026*