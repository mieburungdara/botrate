require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./src/config/db');
const bot = require('./src/config/bot');

// Impor middleware & handler
const { userMiddleware } = require('./src/middleware/user');
const { adminMiddleware } = require('./src/middleware/admin');
const { webAppAuthMiddleware } = require('./src/middleware/webapp');
const { blacklistMiddleware } = require('./src/middleware/blacklist');
const { spamMiddleware } = require('./src/middleware/spam');
const { handleAlbum, handleSingleMedia } = require('./src/handlers/album');
const { handleApprove, handleReject, handleRejectConfirm } = require('./src/handlers/moderation');
const { handleStartWithToken, handleRating } = require('./src/handlers/distribution');
const { 
    getUserProfile, getUserAlbums, getUserPendingMedia, submitMedia,
    updateMediaCaption, getGlobalStats, deleteAlbum, 
    getAlbumDownloadStats, updateUserSettings, searchAlbumsByAnonId 
} = require('./src/handlers/webapp');

/**
 * Inisialisasi admin awal dari .env jika belum ada di database.
 */
async function initAdmin() {
    const adminId = process.env.TELEGRAM_ADMIN_USER_ID;
    if (!adminId) return;

    try {
        const [rows] = await db.execute('SELECT user_id FROM users WHERE user_id = ?', [adminId]);
        if (rows.length === 0) {
            await db.execute(
                'INSERT INTO users (user_id, first_name, is_admin) VALUES (?, ?, TRUE)',
                [adminId, 'System Admin']
            );
        } else {
            await db.execute('UPDATE users SET is_admin = TRUE WHERE user_id = ?', [adminId]);
        }
    } catch (error) {
        console.error('[Init] Gagal inisialisasi admin:', error);
    }
}

const app = express();

// --- KEAMANAN API (Hardening Tahap 7) ---

// 1. Tambahkan header keamanan standar (Helmet)
app.use(helmet({
    contentSecurityPolicy: false, // Dimatikan agar tidak bentrok dengan Telegram WebApp SDK
    crossOriginEmbedderPolicy: false
}));

app.use(express.json());

// 2. Rate Limiting untuk mencegah DoS/Brute-force pada API sensitif
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 100, // Maksimal 100 request per IP per 15 menit
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak permintaan, silahkan coba lagi nanti.' }
});

// Gunakan limiter khusus pada API pencarian yang relatif berat
app.use('/api/albums/search', apiLimiter);

// Static files untuk Web App
app.use('/webapp', express.static(path.join(__dirname, 'webapp')));

// Middleware Proteksi Admin untuk API (Fix Bug 75)
const adminApiMiddleware = (req, res, next) => {
    if (!req.user || !req.user.is_admin) {
        console.warn(`[Security] Akses admin ilegal terdeteksi dari UserID: ${req.user ? req.user.user_id : 'Unknown'}`);
        return res.status(403).json({ error: 'Akses ditolak. Fitur khusus Administrator.' });
    }
    next();
};

// Endpoint API Web App (Akses via bot auth)
app.get('/api/user/profile', webAppAuthMiddleware, getUserProfile);
app.get('/api/user/albums', webAppAuthMiddleware, getUserAlbums);
app.get('/api/user/pending', webAppAuthMiddleware, getUserPendingMedia);
app.post('/api/user/albums/:id/submit', webAppAuthMiddleware, submitMedia);
app.put('/api/user/albums/:id/caption', webAppAuthMiddleware, updateMediaCaption);
app.get('/api/albums/search', webAppAuthMiddleware, searchAlbumsByAnonId);
app.delete('/api/user/albums/:id', webAppAuthMiddleware, deleteAlbum);
app.get('/api/user/albums/:id/stats', webAppAuthMiddleware, getAlbumDownloadStats);
app.post('/api/user/settings', webAppAuthMiddleware, updateUserSettings);
app.get('/api/admin/stats', webAppAuthMiddleware, adminApiMiddleware, getGlobalStats);

// Fallback untuk SPA
app.get('/webapp/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'webapp', 'index.html'));
});

// --- SISTEM BOT TELEGRAM ---

bot.use(blacklistMiddleware);
bot.use(spamMiddleware);
bot.use(userMiddleware);

bot.on(['photo', 'video', 'document'], async (ctx) => {
    if (ctx.message.media_group_id) {
        return handleAlbum(ctx);
    } else {
        return handleSingleMedia(ctx);
    }
});

bot.start(async (ctx) => {
    const startPayload = ctx.payload;
    if (startPayload && /^[a-f0-9]{32}$/.test(startPayload)) {
        ctx.match = [null, startPayload];
        return handleStartWithToken(ctx);
    }
    return ctx.reply('👋 Halo! Kirimkan media (foto/video/file) ke sini untuk kami moderasi dan publikasikan.');
});

bot.action(/^approve_(\d+)$/, adminMiddleware, handleApprove);
bot.action(/^reject_(\d+)$/, adminMiddleware, handleReject);
bot.action(/^reject_confirm_(\d+)_(\d+)$/, adminMiddleware, handleRejectConfirm);
bot.action(/^rate_(\d+)_(\d)$/, handleRating);
bot.action('noop', (ctx) => ctx.answerCbQuery());

bot.catch((err, ctx) => {
    // Keamanan: Sensor Bot Token di Log (Fix Bug 86)
    const safeError = err.message.replace(/[0-9]{8,10}:[a-zA-Z0-9_-]{35}/g, '[REDACTED_TOKEN]');
    console.error(`[BotError] ${ctx.updateType || 'Unknown'}:`, safeError);
});

// --- WEBHOOK & SERVER ---

app.post(process.env.WEBHOOK_PATH, (req, res, next) => {
    // 1. Validasi Body (Cegah payload sampah)
    if (!req.body || !req.body.update_id) {
        return res.status(400).send('Invalid Update');
    }

    // 2. Verifikasi Secret Token (Middleware Hardening)
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = process.env.WEBHOOK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
        console.warn(`[Security] Gagal verifikasi secret token dari IP: ${req.ip}`);
        return res.sendStatus(403);
    }
    next();
}, bot.webhookCallback(process.env.WEBHOOK_PATH));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Global Error Handler untuk API
app.use((err, req, res, next) => {
    console.error('[ServerError]', err.message);
    res.status(500).json({ error: 'Terjadi kesalahan sistem internal.' });
});

/**
 * Rutinitas pembersihan database berkala (Housekeeping - Tahap 14)
 * Menghapus draf media yang kedaluwarsa (14 hari tidak di-submit)
 */
async function startHousekeeping() {
    console.log('[Housekeeping] Memulai pembersihan berkala draf kedaluwarsa...');
    try {
        // 1. Hapus album yang tidak di-submit lebih dari 14 hari (pending)
        const [result] = await db.execute(`
            DELETE FROM albums 
            WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 14 DAY)
        `);
        
        if (result.affectedRows > 0) {
            console.log(`[Housekeeping] Berhasil menghapus ${result.affectedRows} draf media lama.`);
            
            // 2. Rekalkulasi album_count untuk user yang terdampak agar statistik tetap akurat
            await db.execute(`
                UPDATE users u SET album_count = (
                    SELECT COUNT(*) FROM albums a 
                    WHERE a.user_id = u.user_id AND a.status = 'approved'
                )
            `);
        }
    } catch (err) {
        console.error('[Housekeeping] Gagal menjalankan pembersihan:', err.message);
    }
}

const startServer = async () => {
    const port = process.env.PORT || 3000;
    try {
        // Validate WEBHOOK_SECRET is set
        if (!process.env.WEBHOOK_SECRET) {
            throw new Error('WEBHOOK_SECRET environment variable is required for webhook security');
        }
        
        await bot.telegram.setWebhook(`${process.env.WEBHOOK_DOMAIN}${process.env.WEBHOOK_PATH}`, {
            secret_token: process.env.WEBHOOK_SECRET,
            allowed_updates: ['message', 'callback_query']
        });

        await initAdmin();
        
        // Jalankan housekeeping saat startup & jadwalkan setiap 24 jam
        await startHousekeeping();
        const housekeepingInterval = setInterval(startHousekeeping, 24 * 60 * 60 * 1000);

        const server = app.listen(port, () => {
            console.log(`🚀 Server aktif di port ${port}`);
        });

        const shutdown = async (signal) => {
            console.log(`\n[${signal}] Mematikan layanan secara aman...`);
            
            // 1. Berhenti menerima update baru
            clearInterval(housekeepingInterval);
            
            try {
                // 2. Berhentikan Bot (Telegraf) secara resmi
                if (bot && bot.stop) {
                    await bot.stop(signal);
                    console.log('Instance Bot dihentikan.');
                }

                // 3. Tutup HTTP Server
                server.close(async () => {
                    console.log('HTTP Server ditutup.');
                    
                    try {
                        // 4. Tutup Koneksi Database (Terakhir)
                        await db.end();
                        console.log('Koneksi Database ditutup dengan aman.');
                        process.exit(0);
                    } catch (dbErr) {
                        console.error('Gagal menutup DB:', dbErr.message);
                        process.exit(1);
                    }
                });
            } catch (err) {
                console.error('Error saat shutdown:', err.message);
                process.exit(1);
            }

            // Fallback: Paksa mati jika stuck lebih dari 10 detik
            setTimeout(() => {
                console.error('Forced shutdown due to timeout');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

    } catch (err) {
        console.error('Fatal initialization error:', err);
        process.exit(1);
    }
};

startServer();