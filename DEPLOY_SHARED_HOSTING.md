# Panduan Lengkap Deploy BotRate di Shared Hosting

Dokumen ini berisi panduan langkah demi langkah untuk meng-deploy project BotRate (Laravel PHP) ke shared hosting standar (cPanel, DirectAdmin, Plesk, dll).

---

## 📋 Persyaratan Shared Hosting

Pastikan hosting Anda mendukung hal-hal berikut:
- ✅ PHP 8.5 atau lebih baru
- ✅ MySQL 8.0+ (atau MariaDB 10.5+)
- ✅ Redis (wajib untuk anti-spam dan rate limiting)
- ✅ Composer (tersedia di terminal/cPanel)

- ✅ Akses Cron Job
- ✅ SSL Certificate (wajib untuk Telegram Webhook)
- ✅ Akses terminal/SSH (direkomendasikan)

---

## 🚀 Langkah 1: Persiapan Project Lokal

Sebelum upload ke hosting, siapkan project di komputer lokal Anda:

```bash
# 1. Clone repository
git clone https://github.com/mieburungdara/botrate.git
cd botrate

# 2. Install dependencies Laravel
composer install --no-dev --optimize-autoloader

# 3. Generate file .env
cp .env.example .env

# 4. Build assets jika ada (jika menggunakan frontend)
# Jika ada frontend: npm install && npm run build
```

---

## 📤 Langkah 2: Upload File ke Hosting

### Opsi A: Upload via File Manager (cPanel)
1. Buat folder `botrate` di **luar folder public_html** (contoh: `/home/username/botrate`)
2. Upload SEMUA file project ke folder tersebut
3. HANYA folder `public/` yang dipindahkan ke dalam `public_html`
   ```
   Struktur yang benar:
   /home/username/
   ├── botrate/          # Semua file project Laravel (private)
   └── public_html/
       └── botrate/      # Hanya isi dari folder public/ Laravel
   ```

### Opsi B: Upload via Git (jika hosting mendukung)
```bash
# Di terminal hosting
cd ~
git clone https://github.com/mieburungdara/botrate.git
cd botrate
composer install --no-dev --optimize-autoloader
```

---

## 🔧 Langkah 3: Konfigurasi File .env di Hosting

Edit file `.env` di folder project (`/home/username/botrate/.env`) dan sesuaikan:

```env
# ------------------------------
# Konfigurasi Aplikasi
# ------------------------------
APP_NAME=BotRate
APP_ENV=production
APP_KEY=  # Generate nanti
APP_DEBUG=false
APP_URL=https://domain-anda.com/botrate

# ------------------------------
# Konfigurasi Database
# ------------------------------
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=nama_database_hosting
DB_USERNAME=username_database
DB_PASSWORD=password_database

# ------------------------------
# Konfigurasi Redis
# ------------------------------
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null  # Isi jika hosting membutuhkan password
REDIS_DB=0

# ------------------------------
# Konfigurasi Telegram
# ------------------------------
TELEGRAM_BOT_TOKEN=your_bot_token_dari_botfather
TELEGRAM_BOT_USERNAME=YourBotUsername
TELEGRAM_WEBHOOK_SECRET=string_random_bebas
TELEGRAM_ADMIN_USER_ID=id_telegram_anda
TELEGRAM_MODERATION_GROUP_ID=-100xxxxxxxxxx
TELEGRAM_PUBLIC_CHANNEL_ID=-100xxxxxxxxxx
TELEGRAM_CHANNEL_USERNAME=username_channel

# ------------------------------
# Optimasi Production
# ------------------------------
SESSION_DRIVER=redis
CACHE_STORE=redis
QUEUE_CONNECTION=redis
```

---

## 🔑 Langkah 4: Generate App Key dan Migrasi Database

Jalankan perintah ini di terminal hosting:

```bash
cd ~/botrate

# Generate application key
php artisan key:generate

# Jalankan migrasi database (PENTING!)
php artisan migrate --force

# Optimasi konfigurasi Laravel
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
```

---

## 🌐 Langkah 5: Setup Webhook Telegram

Telegram membutuhkan HTTPS untuk webhook. Pastikan domain Anda sudah memiliki SSL.

```bash
# Set webhook ke URL hosting Anda
php artisan telegram:webhook set

# Cek status webhook
php artisan telegram:webhook info
```

✅ Webhook harus menampilkan:
```
Webhook URL: https://domain-anda.com/botrate/api/telegram/webhook
Has custom certificate: No
Pending update count: 0
```

---

## ⏰ Langkah 6: Setup Cron Job (Scheduler)

BotRate membutuhkan cron job untuk housekeeping dan tugas otomatis.

1. Buka menu **Cron Jobs** di cPanel
2. Tambahkan cron job baru dengan pengaturan:
   - Interval: `Once per minute (* * * * *)`
   - Command:
     ```bash
     cd /home/username/botrate && php artisan schedule:run >> /dev/null 2>&1
     ```



---

## 📂 Langkah 7: Konfigurasi File Public/index.php

Edit file `public_html/botrate/index.php` dan sesuaikan path:

```php
// Ganti baris ini:
require __DIR__.'/../vendor/autoload.php';

// Menjadi:
require __DIR__.'/../../botrate/vendor/autoload.php';

// Dan ganti ini:
$app = require_once __DIR__.'/../bootstrap/app.php';

// Menjadi:
$app = require_once __DIR__.'/../../botrate/bootstrap/app.php';
```

---

## 🛠 Langkah 8: Konfigurasi .htaccess

Buat file `.htaccess` di `public_html/botrate/.htaccess`:

```apache
<IfModule mod_rewrite.c>
    <IfModule mod_negotiation.c>
        Options -MultiViews -Indexes
    </IfModule>

    RewriteEngine On

    # Handle Authorization Header
    RewriteCond %{HTTP:Authorization} .
    RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]

    # Redirect Trailing Slashes If Not A Folder...
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_URI} (.+)/$
    RewriteRule ^ %1 [L,R=301]

    # Send Requests To Front Controller...
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteRule ^ index.php [L]
</IfModule>

# Security Headers
<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
</IfModule>
```

---

## 🧪 Langkah 9: Testing Deploy

Jalankan perintah ini untuk memverifikasi semua konfigurasi:

```bash
cd ~/botrate

# Cek environment
php artisan env

# Cek koneksi database
php artisan tinker --execute="echo DB::connection()->getDatabaseName();"

# Cek koneksi Redis
php artisan tinker --execute="Redis::ping();"

# Test kirim pesan ke admin
php artisan tinker --execute="\App\Services\Telegram\TelegramBot::sendMessage(env('TELEGRAM_ADMIN_USER_ID'), '✅ Deploy berhasil! BotRate sudah online.');"
```

---

## ❗ Troubleshooting Umum Shared Hosting

### Masalah 1: Webhook tidak bekerja
- ✅ Pastikan URL menggunakan HTTPS
- ✅ Cek mod_rewrite aktif di hosting
- ✅ Pastikan tidak ada password protection di folder
- ✅ Cek error log: `storage/logs/laravel.log`

### Masalah 2: Permission denied
Jalankan perintah ini untuk memperbaiki permission:
```bash
chmod -R 755 ~/botrate
chmod -R 775 ~/botrate/storage
chmod -R 775 ~/botrate/bootstrap/cache
```

### Masalah 3: Redis tidak tersedia
Jika hosting tidak menyediakan Redis:
1. Ubah di `.env`:
   ```env
   CACHE_STORE=file
   SESSION_DRIVER=file
   QUEUE_CONNECTION=database
   ```
2. Jalankan: `php artisan queue:table && php artisan migrate`

### Masalah 4: Cron job tidak berjalan
- ✅ Pastikan path absolut benar
- ✅ Cek log cron job di cPanel
- ✅ Test jalankan manual: `php artisan schedule:run`

---

## 🚩 Hosting yang Direkomendasikan

| Provider | Keterangan |
|----------|------------|
| Hostinger | Mendukung Redis, cron |
| A2 Hosting | Mendukung semua fitur Laravel |
| SiteGround | Optimasi Laravel terbaik |
| Niagahoster | Shared hosting Indonesia dengan Redis |

---

## 📝 Catatan Penting

1. **JANGAN** upload folder `vendor` ke hosting - install di hosting saja: `composer install --no-dev`
2. **JANGAN** gunakan `APP_DEBUG=true` di production
3. Selalu jalankan `php artisan config:cache` setelah mengubah .env
4. Backup database secara rutin
5. Pastikan bot Telegram sudah dijadikan admin di group moderasi dan channel

---

## ✅ Checklist Deploy Akhir

- [ ] Semua file terupload dengan benar
- [ ] .env sudah dikonfigurasi
- [ ] Migrasi database berhasil
- [ ] Webhook Telegram ter-set dengan benar
- [ ] Cron job sudah ditambahkan
- [ ] Permission folder storage sudah benar
- [ ] SSL aktif dan berfungsi
- [ ] Test bot berhasil menerima dan mengirim pesan
