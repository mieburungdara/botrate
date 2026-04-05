require('dotenv').config();
const express = require('express');
const path = require('path');
const bot = require('./src/config/bot');
const { userMiddleware } = require('./src/middleware/user');
const { adminMiddleware } = require('./src/middleware/admin');
const { webAppAuthMiddleware } = require('./src/middleware/webapp');
const { handleAlbum, handleSingleMedia } = require('./src/handlers/album');
const { handleApprove, handleReject, handleRejectConfirm } = require('./src/handlers/moderation');
const { handleStartWithToken, handleRating } = require('./src/handlers/distribution');
const { getUserProfile, getUserAlbums, getGlobalStats } = require('./src/handlers/webapp');

const app = express();
app.use(express.json());

// Static files untuk Web App
app.use('/webapp', express.static(path.join(__dirname, 'webapp')));

// API Endpoints Web App
app.get('/api/user/profile', webAppAuthMiddleware, getUserProfile);
app.get('/api/user/albums', webAppAuthMiddleware, getUserAlbums);
app.get('/api/admin/stats', webAppAuthMiddleware, getGlobalStats);

// Middleware global bot
bot.use(userMiddleware);

// Handler SEMUA media: foto tunggal, video tunggal, dan album
bot.on(['photo', 'video'], async (ctx) => {
    if (ctx.message.media_group_id) {
        // Ini adalah bagian dari album media grup
        return handleAlbum(ctx);
    } else {
        // Ini adalah media tunggal (foto/video)
        return handleSingleMedia(ctx);
    }
});

// Handler start dengan token
bot.start(/^start ([a-f0-9]{32})$/, handleStartWithToken);

// Handler start normal
bot.start((ctx) => {
    ctx.reply('👋 Selamat datang! Kirimkan album foto atau video untuk dipublikasikan setelah moderasi.');
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

// Webhook endpoint
app.post(process.env.WEBHOOK_PATH, async (req, res) => {
    // Verifikasi webhook secret
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (secret !== process.env.WEBHOOK_SECRET) {
        return res.sendStatus(403);
    }

    await bot.handleUpdate(req.body, res);
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Setup webhook ketika server mulai
const startServer = async () => {
    const port = process.env.PORT || 3000;
    
    await bot.telegram.setWebhook(`${process.env.WEBHOOK_DOMAIN}${process.env.WEBHOOK_PATH}`, {
        secret_token: process.env.WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query']
    });

    app.listen(port, () => {
        console.log(`Server berjalan di port ${port}`);
        console.log(`Webhook terdaftar: ${process.env.WEBHOOK_DOMAIN}${process.env.WEBHOOK_PATH}`);
        console.log(`Web App tersedia: ${process.env.WEBHOOK_DOMAIN}/webapp`);
    });
};

startServer();
