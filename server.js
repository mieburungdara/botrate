require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./src/config/db');
const bot = require('./src/config/bot');
const { userMiddleware } = require('./src/middleware/user');
const { adminMiddleware } = require('./src/middleware/admin');
const { webAppAuthMiddleware } = require('./src/middleware/webapp');
const { blacklistMiddleware } = require('./src/middleware/blacklist');
const { spamMiddleware } = require('./src/middleware/spam');
const { handleAlbum, handleSingleMedia } = require('./src/handlers/album');
const { handleApprove, handleReject, handleRejectConfirm } = require('./src/handlers/moderation');
const { handleStartWithToken, handleRating } = require('./src/handlers/distribution');
const { getUserProfile, getUserAlbums, getGlobalStats } = require('./src/handlers/webapp');

/**
 * Inisialisasi admin awal dari .env jika belum ada di database.
 */
async function initAdmin() {
    const adminId = process.env.ADMIN_USER_ID;
    if (!adminId) {
        console.warn('[Init] ADMIN_USER_ID tidak ditemukan di .env');
        return;
    }

    try {
        const [rows] = await db.execute('SELECT user_id FROM users WHERE user_id = ?', [adminId]);
        if (rows.length === 0) {
            console.log(`[Init] Mendaftarkan admin utama: ${adminId}`);
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
app.use(express.json());

// Static files untuk Web App
app.use('/webapp', express.static(path.join(__dirname, 'webapp')));

// Fallback untuk SPA (Single Page Application)
// Semua request ke /webapp/* yang bukan file statis akan dikembalikan ke index.html
app.get('/webapp/*', (req, res, next) => {
    // Jika request ke /webapp/api, biarkan lewat ke handler API
    if (req.path.startsWith('/webapp/api')) return next();
    res.sendFile(path.join(__dirname, 'webapp', 'index.html'));
});

// API Endpoints Web App
app.get('/api/user/profile', webAppAuthMiddleware, getUserProfile);
app.get('/api/user/albums', webAppAuthMiddleware, getUserAlbums);
app.delete('/api/user/albums/:id', webAppAuthMiddleware, deleteAlbum);
app.get('/api/user/albums/:id/stats', webAppAuthMiddleware, getAlbumDownloadStats);
app.get('/api/admin/stats', webAppAuthMiddleware, getGlobalStats);

// Middleware global bot
bot.use(blacklistMiddleware);
bot.use(spamMiddleware);
bot.use(userMiddleware);

// Handler SEMUAL media: foto tunggal, video tunggal, dokumen tunggal, dan album
bot.on(['photo', 'video', 'document'], async (ctx) => {
    if (ctx.message.media_group_id) {
        // Ini adalah bagian dari album media grup
        return handleAlbum(ctx);
    } else {
        // Ini adalah media tunggal (foto/video)
        return handleSingleMedia(ctx);
    }
});

// Handler start (Token & Normal)
bot.start(async (ctx) => {
    const startPayload = ctx.payload; // Mengambil data setelah /start secara otomatis via Telegraf

    if (startPayload && /^[a-f0-9]{32}$/.test(startPayload)) {
        // Jika ada payload token valid
        ctx.match = [null, startPayload]; // Mock match untuk kompatibilitas handler lama
        return handleStartWithToken(ctx);
    }

    // Start normal
    return ctx.reply('👋 Selamat datang! Kirimkan album foto atau video untuk dipublikasikan setelah moderasi.');
});

// Handler callback query moderasi
bot.action(/^approve_(\d+)$/, adminMiddleware, handleApprove);
bot.action(/^reject_(\d+)$/, adminMiddleware, handleReject);
bot.action(/^reject_confirm_(\d+)_(\d+)$/, adminMiddleware, handleRejectConfirm);

// Handler rating
bot.action(/^rate_(\d+)_(\d)$/, handleRating);

bot.action('noop', (ctx) => ctx.answerCbQuery());

// Error handling
bot.catch((err, ctx) => {
    console.error(`Bot error for ${ctx.updateType}:`, err);
});

// Webhook endpoint (Standard Telegraf Middleware)
app.post(process.env.WEBHOOK_PATH, (req, res, next) => {
    // Verifikasi webhook secret sebagai lapisan keamanan tambahan
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (secret !== process.env.WEBHOOK_SECRET) {
        return res.sendStatus(403);
    }
    next();
}, bot.webhookCallback(process.env.WEBHOOK_PATH));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Middleware penangan error global (API) - Hardening Tahap 5
app.use((err, req, res, next) => {
    console.error('[GlobalError]', err.stack);
    const status = err.status || 500;
    res.status(status).json({
        error: true,
        message: 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err.message : 'Silahkan hubungi admin jika masalah berlanjut.'
    });
});

// Start server function
const startServer = async () => {
    const port = process.env.PORT || 3000;
    
    try {
        await bot.telegram.setWebhook(`${process.env.WEBHOOK_DOMAIN}${process.env.WEBHOOK_PATH}`, {
            secret_token: process.env.WEBHOOK_SECRET,
            allowed_updates: ['message', 'callback_query']
        });

        // Jalankan inisialisasi admin
        await initAdmin();

        const server = app.listen(port, () => {
            console.log(`Server berjalan di port ${port}`);
            console.log(`Webhook terdaftar: ${process.env.WEBHOOK_DOMAIN}${process.env.WEBHOOK_PATH}`);
            console.log(`Web App tersedia: ${process.env.WEBHOOK_DOMAIN}/webapp`);
        });

        // Mekanisme Graceful Shutdown
        const shutdown = async (signal) => {
            console.log(`\n[${signal}] Memulai proses shutdown bersih...`);
            
            server.close(async () => {
                console.log('HTTP Server telah ditutup.');
                try {
                    await db.end();
                    console.log('Koneksi Database Pool telah diputus.');
                    process.exit(0);
                } catch (dbErr) {
                    console.error('Gagal memutus koneksi DB:', dbErr);
                    process.exit(1);
                }
            });

            // Batas waktu paksa 10 detik
            setTimeout(() => {
                console.error('Shutdown gagal ditutup bersih dalam waktu 10s, memaksa keluar.');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

    } catch (err) {
        console.error('Gagal menjalankan server:', err);
        process.exit(1);
    }
};

startServer();
