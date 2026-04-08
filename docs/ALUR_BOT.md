# Dokumentasi Alur Bot Telegram - BotRate

Dokumentasi ini menjelaskan alur lengkap interaksi user dengan bot, mulai dari menekan `/start` hingga akhir.

---

## Daftar Isi

1. [Arsitektur Umum](#arsitektur-umum)
2. [Alur Command `/start`](#alur-command-start)
   - [Skenario A: `/start` Tanpa Payload](#skenario-a-start-tanpa-payload)
   - [Skenario B: `/start` Dengan Token](#skenario-b-start-dengan-token)
3. [Middleware Pipeline](#middleware-pipeline)
4. [Alur Pengiriman Media](#alur-pengiriman-media)
5. [Alur Moderasi](#alur-moderasi)
6. [Alur Rating](#alur-rating)
7. [Database Schema](#database-schema)
8. [Keamanan](#keamanan)

---

## Arsitektur Umum

```
┌──────────────┐     Webhook      ┌──────────────────┐
│   Telegram   │ ────────────────►│  Express Server  │
│    Server    │ ◄────────────────│  (server.js)     │
└──────────────┘   Response       └────────┬─────────┘
                                           │
                                           ▼
                                    ┌──────────────────┐
                                    │   Telegraf Bot   │
                                    │   (bot.js)       │
                                    └────────┬─────────┘
                                             │
                          ┌──────────────────┼──────────────────┐
                          ▼                  ▼                  ▼
                   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
                   │ Middleware  │  │  Handlers   │  │   Utils     │
                   └─────────────┘  └─────────────┘  └─────────────┘
```

### Komponen Utama

| File | Fungsi |
|------|--------|
| `server.js` | Entry point, Express server, webhook handler |
| `src/config/bot.js` | Inisialisasi Telegraf bot & audit logging |
| `src/config/db.js` | Koneksi database MySQL |
| `src/middleware/` | Middleware pipeline (blacklist, spam, user) |
| `src/handlers/` | Handler untuk setiap tipe interaksi |

---

## Alur Command `/start`

### Diagram Alur

```
User menekan /start
       │
       ▼
┌─────────────────────────────────────────┐
│ 1. WEBHOOK RECEIVED (server.js)         │
│    - Terima POST dari Telegram API      │
│    - Validasi body memiliki update_id   │
│    - Verifikasi X-Telegram-Bot-API-     │
│      Secret-Token                        │
│    - Jika gagal → 403 Forbidden         │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│ 2. GLOBAL AUDIT LOGGING (bot.js)        │
│    - Catat timestamp mulai              │
│    - Log: [Audit] timestamp | type |    │
│      ID | nama                          │
│    - Setelah handler selesai: catat     │
│      durasi, warning jika >2 detik      │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│ 3. BLACKLIST MIDDLEWARE                 │
│    - Query: SELECT dari blacklist       │
│    - Jika ditemukan → blokir, beri      │
│      notifikasi alasan                  │
│    - Admin (ADMIN_USER_ID) → kebal      │
│    - Jika tidak → lanjut                │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│ 4. SPAM MIDDLEWARE                      │
│    - Cek rate limit: max 40 msg/menit   │
│    - Cek interval: min 1 detik          │
│    - Exception: media_group_id (album)  │
│    - Jika spam → hentikan + warning     │
│    - Jika OK → lanjut                   │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│ 5. USER MIDDLEWARE                      │
│    - Cek user di tabel users            │
│    - Jika baru:                         │
│      * Generate anonymous_id (BA-XXX)   │
│      * INSERT ke database               │
│    - Jika ada:                          │
│      * UPDATE username, last_active     │
│    - Simpan ke ctx.state.user           │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│ 6. /start HANDLER (server.js:113-120)   │
│    - Cek ctx.payload                    │
│    - Validasi format: 32-char hex       │
│    - Regex: /^[a-f0-9]{32}$/            │
│                                         │
│    if (ada token valid):                │
│      → handleStartWithToken(ctx)        │
│    else:                                │
│      → ctx.reply(pesan_sapaan)          │
└───────────────┬─────────────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
   Tanpa Token     Dengan Token
```

---

### Skenario A: `/start` Tanpa Payload

**Kondisi:** User membuka bot langsung atau via `/start` tanpa parameter tambahan.

```
┌─────────────────────────────────────────────────┐
│ Response:                                       │
│                                                 │
│ "👋 Halo! Kirimkan media (foto/video/file)     │
│  ke sini untuk kami moderasi dan publikasikan." │
└─────────────────────────────────────────────────┘
```

**Proses yang Terjadi:**
1. User baru otomatis terdaftar di tabel `users`
2. Anonymous_id di-generate (format: `BA-` + 9 hex karakter)
3. Data user disimpan: `user_id`, `username`, `first_name`, `last_name`
4. `last_active` di-update

**Kode Terkait:**
```javascript
// server.js baris 113-120
bot.start(async (ctx) => {
    const startPayload = ctx.payload;
    if (startPayload && /^[a-f0-9]{32}$/.test(startPayload)) {
        ctx.match = [null, startPayload];
        return handleStartWithToken(ctx);
    }
    return ctx.reply('👋 Halo! Kirimkan media (foto/video/file) ke sini untuk kami moderasi dan publikasikan.');
});
```

---

### Skenario B: `/start` Dengan Token

**Kondisi:** User mengklik link share dengan format `https://t.me/{bot_username}?start={unique_token}`

#### Langkah 1: Query Album

```sql
SELECT a.*, u.anonymous_id, u.is_public
FROM albums a
JOIN users u ON a.user_id = u.user_id
WHERE unique_token = ? AND status = 'approved'
```

**Hasil:**
- ✅ Ditemukan → lanjut ke Langkah 2
- ❌ Tidak ditemukan → Reply: `"❌ Link tidak valid atau media sudah dihapus."` → **SELESAI**

#### Langkah 2: Parse Media

```javascript
mediaItems = JSON.parse(album.media_items || '[]');
```

**Caption Preparation:**
```javascript
const escapeHtml = (text) => {
    return String(text)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#039;');
};

const contributor = album.is_public ? (album.anonymous_id || "Kreator") : "Kreator";
const fullCaption = `${escapedCaption}\n\n👤 <b>Kontribusi:</b> ${escapedContributor}`;
```

#### Langkah 3: Kirim Media

```
┌─────────────────────────────────────────────────┐
│ Filter Media:                                   │
│                                                 │
│ 📸 visualMedia (photo/video)                    │
│    → sendMediaGroup()                           │
│    → Caption di media pertama                   │
│                                                 │
│ 📄 documents                                    │
│    → Kirim terpisah per file                    │
│    → sendDocument()                             │
│    → Caption di dokumen pertama (jika tidak ada │
│      visual media)                              │
└─────────────────────────────────────────────────┘
```

**Catatan:** Telegram `sendMediaGroup` hanya mendukung campuran Photo & Video. Document tidak bisa dicampur dalam satu group.

#### Langkah 4: Update Statistik Unduhan

```sql
-- 1. Catat download (INSERT IGNORE mencegah double count)
INSERT IGNORE INTO downloads (album_id, user_id) VALUES (?, ?);

-- 2. Recalculate download_count
SELECT COUNT(*) as total FROM downloads WHERE album_id = ?;
UPDATE albums SET download_count = ? WHERE id = ?;

-- 3. Update counter global user
UPDATE users SET download_count = download_count + 1 WHERE user_id = ?;
```

#### Langkah 5: Tampilkan Rating Keyboard

**Cek:** Apakah user sudah rating sebelumnya?

```sql
SELECT id FROM ratings WHERE album_id = ? AND user_id = ?
```

**Jika belum pernah & bukan pemilik album:**
```
✅ Media berhasil dikirim!

Silahkan berikan rating untuk media ini:

[⭐] [⭐⭐] [⭐⭐⭐] [⭐⭐⭐⭐] [⭐⭐⭐⭐⭐]
```

**Jika sudah pernah atau pemilik album:** Tidak ada keyboard ditampilkan.

#### Kode Lengkap Handler

```javascript
// src/handlers/distribution.js - handleStartWithToken
async function handleStartWithToken(ctx) {
    const token = ctx.match[1];
    
    // 1. Query album
    const [albums] = await db.execute(`
        SELECT a.*, u.anonymous_id, u.is_public
        FROM albums a
        JOIN users u ON a.user_id = u.user_id
        WHERE unique_token = ? AND status = 'approved'
    `, [token]);

    // 2. Validasi
    if (albums.length === 0) {
        return ctx.reply('❌ Link tidak valid atau media sudah dihapus.');
    }

    // 3. Parse & kirim media
    const album = albums[0];
    const mediaItems = JSON.parse(album.media_items || '[]');
    
    // ... proses pengiriman media ...

    // 4. Update statistik
    await db.execute('INSERT IGNORE INTO downloads ...');
    
    // 5. Rating keyboard
    const [existingRating] = await db.execute(
        'SELECT id FROM ratings WHERE album_id = ? AND user_id = ?',
        [album.id, ctx.from.id]
    );
    
    if (existingRating.length === 0) {
        await ctx.reply('✅ Media berhasil dikirim!...', 
            Markup.inlineKeyboard([...ratingButtons...]));
    }
}
```

---

## Middleware Pipeline

### Urutan Eksekusi

```
Request → blacklistMiddleware → spamMiddleware → userMiddleware → Handler
```

### 1. Blacklist Middleware (`src/middleware/blacklist.js`)

**Fungsi:** Memblokir user yang masuk daftar hitam.

```javascript
async function blacklistMiddleware(ctx, next) {
    // Cek admin → langsung lanjut
    if (userId == process.env.ADMIN_USER_ID) return next();
    
    // Query blacklist
    const [rows] = await db.execute(
        'SELECT id, reason FROM blacklist WHERE user_id = ?', 
        [userId]
    );
    
    // Jika ditemukan → blokir
    if (rows.length > 0) {
        await ctx.reply(`🚫 Akses Ditolak\nAlasan: ${reason}`);
        return; // Hentikan eksekusi
    }
    
    return next();
}
```

### 2. Spam Middleware (`src/middleware/spam.js`)

**Fungsi:** Mencegah spam/flooding.

| Parameter | Nilai |
|-----------|-------|
| Max pesan per menit | 40 |
| Interval minimal | 1000ms |
| Admin exception | Ya |
| Album exception | Ya (untuk interval check) |

```javascript
const rateLimitCache = new Map();
const LIMIT_MS = 1000;
const MAX_MESSAGES_PER_MINUTE = 40;

const spamMiddleware = async (ctx, next) => {
    // Cek interval
    if (now - userData.lastMsgTime < LIMIT_MS) {
        return; // Hentikan
    }
    
    // Cek kuota per menit
    if (userData.msgCount > MAX_MESSAGES_PER_MINUTE) {
        await ctx.reply('⚠️ Anda terlalu cepat...');
        return;
    }
    
    return next();
};
```

### 3. User Middleware (`src/middleware/user.js`)

**Fungsi:** Registrasi & update data user.

```javascript
async function userMiddleware(ctx, next) {
    // Cek existing user
    const [rows] = await db.execute(
        'SELECT anonymous_id FROM users WHERE user_id = ?', 
        [id]
    );
    
    // Generate anonymous_id jika perlu
    if (rows.length === 0 || !rows[0].anonymous_id) {
        const randomBytes = crypto.randomBytes(5);
        newAnonId = 'BA-' + randomBytes.toString('hex').toUpperCase().substring(0, 9);
    }
    
    // INSERT atau UPDATE
    await db.execute(`
        INSERT INTO users (user_id, username, first_name, last_name, anonymous_id)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            last_active = CURRENT_TIMESTAMP
    `, [id, username, first_name, last_name, newAnonId]);
}
```

---

## Alur Pengiriman Media

### Diagram

```
User kirim media ke bot
        │
        ▼
┌───────────────────────────────────────┐
│ Cek: media_group_id ada?              │
│                                       │
│ YA → handleAlbum()                    │
│ TIDAK → handleSingleMedia()           │
└───────────────────────────────────────┘
```

### File Terkait

| Handler | File |
|---------|------|
| `handleAlbum` | `src/handlers/album.js` |
| `handleSingleMedia` | `src/handlers/album.js` |

---

## Alur Moderasi

### Diagram

```
Media masuk ke bot
        │
        ▼
┌─────────────────────────────────────┐
│ Simpan sebagai draft (pending)      │
│ - Status: 'pending'                 │
│ - unique_token: generate UUID       │
│ - message_ids: JSON array           │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│ Kirim ke admin untuk moderasi       │
│ - Preview media                     │
│ - Tombol Approve / Reject           │
└───────────────┬─────────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
   Approve          Reject
        │               │
        ▼               ▼
┌──────────────┐  ┌─────────────────────┐
│ status:      │  │ status: 'rejected'  │
│ 'approved'   │  │ + reject_reason     │
│ → Forward ke │  │ → Notifikasi user   │
│   channel    │  └─────────────────────┘
└──────────────┘
```

### Handler Moderasi

| Action | Callback | Handler |
|--------|----------|---------|
| Approve | `approve_{id}` | `handleApprove` |
| Reject | `reject_{id}` | `handleReject` |
| Confirm Reject | `reject_confirm_{id}_{reason}` | `handleRejectConfirm` |

---

## Alur Rating

### Diagram

```
User klik tombol rating
        │
        ▼
┌─────────────────────────────────────────────┐
│ parse callback: rate_{albumId}_{rating}     │
│ - albumId: ID album yang di-rating          │
│ - rating: 1-5                               │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│ Validasi:                                   │
│ ✓ Rating 1-5                                │
│ ✓ Album existe                              │
│ ✓ Bukan pemilik album (album.user_id !=     │
│   ctx.from.id)                              │
│ ✓ Belum pernah rating (unique constraint)   │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│ Simpan rating:                              │
│ INSERT INTO ratings (album_id, user_id,     │
│   rating)                                   │
│                                             │
│ Update statistik album:                     │
│ - rating_count++                            │
│ - rating_total += rating                    │
│ - rating_avg = ROUND(rating_total /         │
│   rating_count, 2)                          │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│ Update channel message (jika ada):          │
│ - Edit teks dengan statistik terbaru        │
│ - Tampilkan: rating, download count         │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│ Response ke user:                           │
│ "Terima kasih! Anda memberikan rating       │
│  ⭐⭐⭐⭐⭐."                                  │
└─────────────────────────────────────────────┘
```

### Kode Handler Rating

```javascript
// src/handlers/distribution.js - handleRating
async function handleRating(ctx) {
    const albumId = ctx.match[1];
    const rating = parseInt(ctx.match[2]);
    
    // Validasi
    if (album.user_id == ctx.from.id) {
        return ctx.answerCbQuery('⚠️ Anda tidak bisa memberikan rating pada karya sendiri.');
    }
    
    // Cek existing
    const [existingRating] = await db.execute(
        'SELECT id FROM ratings WHERE album_id = ? AND user_id = ?',
        [albumId, ctx.from.id]
    );
    
    if (existingRating.length > 0) {
        return ctx.answerCbQuery('Anda sudah memberikan rating sebelumnya.');
    }
    
    // Simpan & update statistik
    await db.execute(
        'INSERT IGNORE INTO ratings (album_id, user_id, rating) VALUES (?, ?, ?)', 
        [albumId, ctx.from.id, rating]
    );
    
    await db.execute(`
        UPDATE albums SET 
            rating_count = rating_count + 1, 
            rating_total = rating_total + ?,
            rating_avg = ROUND((rating_total + ?) / (rating_count + 1), 2)
        WHERE id = ?
    `, [rating, rating, albumId]);
    
    // Update channel
    if (album.channel_message_id && process.env.PUBLIC_CHANNEL_ID) {
        await ctx.telegram.editMessageText(...);
    }
    
    await ctx.editMessageText(`Terima kasih! Anda memberikan rating ${'⭐'.repeat(rating)}.`);
}
```

---

## Database Schema

### Tabel `users`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `user_id` | BIGINT | Primary Key, Telegram User ID |
| `username` | VARCHAR(255) | Username Telegram (nullable) |
| `first_name` | VARCHAR(255) | Nama depan |
| `last_name` | VARCHAR(255) | Nama belakang (nullable) |
| `is_admin` | BOOLEAN | Status admin |
| `anonymous_id` | VARCHAR(20) | ID anonim unik (BA-XXXXXXXXX) |
| `is_public` | BOOLEAN | Mode publik/private |
| `last_active` | DATETIME | Terakhir aktif |
| `album_count` | INT | Jumlah album yang di-submit |
| `download_count` | INT | Jumlah download |
| `created_at` | DATETIME | Waktu pendaftaran |

### Tabel `albums`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT | Primary Key, Auto Increment |
| `user_id` | BIGINT | Foreign Key ke users |
| `message_ids` | JSON | Array ID pesan media |
| `media_items` | JSON | Array detail media (type + media) |
| `chat_id` | BIGINT | ID chat asal |
| `caption` | TEXT | Caption media |
| `unique_token` | VARCHAR(32) | Token unik untuk share (32-char hex) |
| `status` | ENUM | 'pending', 'approved', 'rejected' |
| `moderator_message_id` | BIGINT | ID pesan moderasi |
| `reject_reason` | VARCHAR(100) | Alasan penolakan |
| `download_count` | INT | Jumlah unduhan |
| `rating_count` | INT | Jumlah rating |
| `rating_total` | INT | Total skor rating |
| `rating_avg` | DECIMAL(3,2) | Rata-rata rating (0.00-5.00) |
| `channel_message_id` | BIGINT | ID pesan di channel |
| `created_at` | DATETIME | Waktu pembuatan |
| `approved_at` | DATETIME | Waktu approval |
| `rejected_at` | DATETIME | Waktu penolakan |

### Tabel `ratings`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT | Primary Key |
| `album_id` | INT | Foreign Key ke albums |
| `user_id` | BIGINT | Foreign Key ke users |
| `rating` | TINYINT | Nilai rating (1-5) |
| `comment` | TEXT | Komentar (nullable) |
| `created_at` | DATETIME | Waktu rating |
| **UNIQUE KEY** | `(album_id, user_id)` | Mencegah duplikasi |

### Tabel `downloads`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT | Primary Key |
| `album_id` | INT | Foreign Key ke albums |
| `user_id` | BIGINT | Foreign Key ke users |
| **UNIQUE KEY** | `(album_id, user_id)` | Mencegah double count |

### Tabel `blacklist`

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | INT | Primary Key |
| `user_id` | BIGINT | Foreign Key ke users (UNIQUE) |
| `reason` | TEXT | Alasan blacklist |
| `banned_by` | BIGINT | Admin yang blacklist |
| `created_at` | DATETIME | Waktu blacklist |

---

## Keamanan

### 1. Webhook Security

- **Secret Token Verification:** Header `X-Telegram-Bot-API-Secret-Token` divalidasi
- **Body Validation:** Payload harus memiliki `update_id`
- **Helmet.js:** Header keamanan HTTP

### 2. Rate Limiting

| Scope | Limit | Keterangan |
|-------|-------|------------|
| API Umum | 100 req / 15 menit | Per IP |
| User ke Bot | 40 msg / menit | Per user ID |
| Interval Pesan | 1 detik | Per user (kecuali album) |

### 3. Blacklist System

- User yang di-blacklist tidak bisa berinteraksi
- Admin kebal terhadap blacklist
- Notifikasi alasan pemblokiran

### 4. Anti-Spam

- Cache-based rate limiting
- Exception untuk media groups (album)
- Auto cleanup cache setiap 5 menit

### 5. Token Sensor

```javascript
// Server.js - Global Error Handler
const safeError = err.message.replace(
    /[0-9]{8,10}:[a-zA-Z0-9_-]{35}/g, 
    '[REDACTED_TOKEN]'
);
```

### 6. HTML Escaping

```javascript
const escapeHtml = (text) => {
    return String(text)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#039;');
};
```

### 7. Housekeeping

- Auto-delete draft media > 14 hari
- Recalculate album_count setelah cleanup
- Interval: 24 jam

---

## Callback Actions

| Pattern | Action | Middleware |
|---------|--------|------------|
| `/start` | Sambutan atau distribusi | - |
| `/start {token}` | Distribusi media | userMiddleware |
| `approve_{id}` | Approve album | adminMiddleware |
| `reject_{id}` | Reject album (konfirmasi) | adminMiddleware |
| `reject_confirm_{id}_{reason}` | Konfirmasi reject | adminMiddleware |
| `rate_{albumId}_{rating}` | Beri rating (1-5) | - |
| `noop` | No-op (dummy callback) | - |

---

## Environment Variables

| Variable | Keterangan |
|----------|------------|
| `BOT_TOKEN` | Token bot Telegram |
| `ADMIN_USER_ID` | User ID admin utama |
| `DB_HOST` | Host database |
| `DB_USER` | User database |
| `DB_PASSWORD` | Password database |
| `DB_NAME` | Nama database |
| `WEBHOOK_PATH` | Path webhook (misal: /webhook/secret) |
| `WEBHOOK_DOMAIN` | Domain webhook (misal: https://example.com) |
| `WEBHOOK_SECRET` | Secret token webhook |
| `PUBLIC_CHANNEL_ID` | ID channel publik |
| `PORT` | Port server (default: 3000) |

---

## File Structure

```
botrate/
├── server.js                    # Entry point utama
├── migrate.js                   # Script migrasi database
├── .env.example                 # Contoh environment variables
├── package.json                 # Dependencies
├── README.md                    # Dokumentasi umum
├── TODO_SERVER.md               # Todo server
├── database/
│   └── migration.sql           # Schema database
├── src/
│   ├── config/
│   │   ├── bot.js              # Inisialisasi Telegraf
│   │   └── db.js               # Koneksi database
│   ├── handlers/
│   │   ├── album.js            # Handler album/media
│   │   ├── distribution.js     # Handler distribusi & rating
│   │   ├── moderation.js       # Handler moderasi
│   │   └── webapp.js           # Handler Web App API
│   ├── middleware/
│   │   ├── blacklist.js        # Middleware blacklist
│   │   ├── spam.js             # Middleware anti-spam
│   │   ├── user.js             # Middleware user
│   │   ├── admin.js            # Middleware admin
│   │   └── webapp.js           # Middleware Web App auth
│   ├── models/                  # Model database
│   ├── helpers/                 # Helper functions
│   ├── utils/                   # Utility functions
│   └── constants/               # Konstanta
└── webapp/
    ├── index.html              # Web App frontend
    ├── app.js                  # Web App logic
    └── style.css               # Web App styles
```

---

## Glossary

| Istilah | Definisi |
|---------|----------|
| **Album** | Kumpulan media (foto/video) dalam satu pengiriman grup |
| **unique_token** | Token 32-karakter hex untuk share media |
| **anonymous_id** | ID anonim user (format: BA-XXXXXXXXX) |
| **Media Group** | Pengiriman media ganda dari Telegram |
| **Webhook** | Endpoint untuk menerima update dari Telegram |
| **Callback Query** | Data dari tombol inline keyboard |
| **INSERT IGNORE** | SQL yang mengabaikan duplikasi key |
| **Housekeeping** | Proses pembersihan data berkala |

---

## Changelog Alur

| Versi | Perubahan |
|-------|-----------|
| v1.0 | Alur dasar /start, middleware, handler |
| v1.1 | Penambahan sistem rating |
| v1.2 | Penambahan blacklist & spam protection |
| v1.3 | Hardening keamanan webhook & token sensor |
| v1.4 | Housekeeping untuk draft expired |

---

*Dokumentasi ini dibuat berdasarkan analisa kode sumber BotRate. Terakhir diupdate: April 2026.*