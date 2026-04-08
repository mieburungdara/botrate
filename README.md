# BotRate - Telegram Bot Rate & Moderation System

Bot Telegram untuk manajemen media dengan fitur moderasi, rating, dan distribusi. Dibangun dengan Laravel (PHP 8.5) + MySQL + Redis.

## Fitur

- **Moderasi via Group**: Media dikirim ke group moderasi dengan inline keyboard (Setuju/Tolak)
- **Alasan Penolakan**: Predefined (5 alasan) + custom (ketik manual)
- **Deep Link Unik**: Setiap media yang disetujui mendapat token unik untuk sharing
- **Channel Posting**: Informasi media diposting ke channel (tanpa media, hanya info + tombol)
- **Rating System**: User bisa memberi rating ⭐ 1-5 pada media
- **Anti-Spam**: Rate limiting berbasis Redis
- **Blacklist**: Sistem blacklist user
- **Web App**: Dashboard kontributor via Telegram WebApp
- **Housekeeping**: Auto-cleanup draft expired (14 hari)

## Arsitektur

```
User → Bot (Telegram) → Webhook → Laravel → MySQL + Redis
                              ↓
                    Moderation Group
                              ↓
                    Public Channel
```

## Persyaratan

- PHP 8.5+
- MySQL 8.0+ (InnoDB)
- Redis 6+
- Composer
- Telegram Bot Token

## Instalasi

### 1. Clone Repository

```bash
git clone https://github.com/mieburungdara/botrate.git
cd botrate
```

### 2. Install Dependencies

```bash
composer install
```

### 3. Setup Environment

```bash
cp .env.example .env
```

Edit `.env` dan sesuaikan konfigurasi:

```env
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_USERNAME=YourBotUsername
TELEGRAM_WEBHOOK_SECRET=your_secret
TELEGRAM_ADMIN_USER_ID=123456789
TELEGRAM_MODERATION_GROUP_ID=-100xxxxxxxxxx
TELEGRAM_PUBLIC_CHANNEL_ID=-100xxxxxxxxxx
TELEGRAM_CHANNEL_USERNAME=yourchannel

# Database
DB_HOST=127.0.0.1
DB_DATABASE=botrate
DB_USERNAME=root
DB_PASSWORD=

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### 4. Generate App Key

```bash
php artisan key:generate
```

### 5. Migrasi Database

```bash
php artisan migrate
```

### 6. Setup Webhook

```bash
php artisan telegram:webhook set
```

### 7. Jalankan Scheduler

Tambahkan ke crontab:

```bash
* * * * * cd /path/to/botrate && php artisan schedule:run >> /dev/null 2>&1
```

## Struktur Folder

```
botrate/
├── NODE_SYSTEM/              # Backup sistem Node.js (read-only)
├── app/
│   ├── Console/Commands/
│   │   ├── Housekeeping.php
│   │   └── TelegramWebhook.php
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── TelegramWebhookController.php
│   │   │   └── WebAppController.php
│   │   └── Middleware/
│   ├── Models/
│   │   ├── User.php
│   │   ├── Album.php
│   │   ├── Rating.php
│   │   ├── Download.php
│   │   └── Blacklist.php
│   └── Services/
│       └── Telegram/
│           ├── TelegramBot.php
│           ├── Handlers/
│           │   ├── AlbumHandler.php
│           │   ├── ModerationHandler.php
│           │   └── DistributionHandler.php
│           └── Middleware/
│               ├── BlacklistMiddleware.php
│               ├── SpamMiddleware.php
│               └── UserMiddleware.php
├── config/
│   ├── telegram.php
│   └── botrate.php
├── database/migrations/
├── resources/views/webapp/
├── routes/
│   ├── api.php
│   ├── web.php
│   └── console.php
├── .env
├── composer.json
└── artisan
```

## Command

| Command | Deskripsi |
|---------|-----------|
| `php artisan telegram:webhook set` | Setup webhook |
| `php artisan telegram:webhook delete` | Hapus webhook |
| `php artisan telegram:webhook info` | Info webhook |
| `php artisan botrate:housekeeping` | Cleanup draft expired |

## Alur Bot

1. User kirim media → Bot simpan sebagai draft
2. Bot forward ke group moderasi dengan info pengirim
3. Admin klik ✅ Setuju → Post ke channel + notifikasi user
4. Admin klik ❌ Tolak → Pilih alasan → Notifikasi user
5. User lain klik deep link → Bot kirim media + rating keyboard

## Lisensi

MIT