# Bot Telegram Album Media

Bot Telegram untuk menerima media (foto/video tunggal atau album), moderasi, dan distribusi terkontrol dengan fitur rating dan Mini Web App.

## Fitur

✅ Menerima foto tunggal, video tunggal, dan album media grup  
✅ Moderasi di channel khusus dengan tombol Setuju/Tolak  
✅ Alasan penolakan dengan pilihan preset  
✅ Link download unik untuk setiap album yang disetujui  
✅ Sistem rating 1-5 bintang setelah download  
✅ Mini Web App untuk melihat daftar album dan statistik  
✅ Auto-register user dan blacklist system  
✅ Webhook dengan keamanan secret token

## Instalasi

1. Salin file konfigurasi:
```bash
cp .env.example .env
```

2. Edit file `.env` dan isi semua konfigurasi:
```env
BOT_TOKEN=token_bot_dari_botfather
BOT_USERNAME=@username_bot
WEBHOOK_DOMAIN=https://domain-anda.com
WEBHOOK_SECRET=token_rahasia_anda
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=password_database
DB_NAME=telegram_bot
MODERATOR_CHANNEL_ID=-100xxxxxxxxx
PUBLIC_CHANNEL_ID=-100xxxxxxxxx
ADMIN_USER_ID=123456789
```

3. Import struktur database:
```bash
mysql -u root -p telegram_bot < database/migration.sql
```

4. Install dependensi:
```bash
npm install
```

5. Jalankan bot:
```bash
# Development
npm run dev

# Production
npm start
```

## Pengaturan Bot di BotFather

1. Jalankan `/setdomain` dan masukkan domain webhook Anda
2. Jalankan `/setmenubutton` untuk menambahkan Mini Web App:
   - URL: `https://domain-anda.com/webapp`
   - Teks: `Dashboard`

## Hak Akses Bot

Pastikan bot ditambahkan sebagai ADMIN di kedua channel dengan hak:
- ✅ Kirim Pesan
- ✅ Edit Pesan
- ✅ Hapus Pesan (opsional)

## Struktur Proyek

```
├── src/
│   ├── config/          # Konfigurasi database dan bot
│   ├── middleware/      # Middleware autentikasi
│   ├── handlers/        # Handler pesan dan callback
│   ├── helpers/         # Utility functions
│   └── models/          # Database models
├── webapp/              # Frontend Mini Web App
├── database/            # File migrasi SQL
├── server.js            # Entry point server
└── .env                 # Konfigurasi environment
```

## API Endpoints

- `POST /telegram-webhook` - Webhook Telegram
- `GET /api/user/profile` - Profil user terautentikasi
- `GET /api/user/albums` - Daftar album user
- `GET /api/admin/stats` - Statistik global (khusus admin)
- `GET /webapp` - Mini Web App frontend

## Lisensi

ISC
