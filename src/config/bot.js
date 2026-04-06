const { Telegraf } = require('telegraf');
require('dotenv').config();

// Validate BOT_TOKEN is set for security
if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN environment variable is required');
}

const bot = new Telegraf(process.env.BOT_TOKEN, {
    telegram: { webhookReply: true }
});

/**
 * Middleware Global Audit Logging (Fix Bug 42)
 * Mencatat jejak aktivitas tanpa mengekspos isi pesan sensitif (Privacy-First)
 */
bot.use(async (ctx, next) => {
    const start = Date.now();
    const updateType = ctx.updateType.toUpperCase();
    const userId = ctx.from?.id || 'System';
    const firstName = ctx.from?.first_name || 'Guest';

    // Logging terstruktur: memudahkan audit keamanan & troubleshooting (Fix Bug 42)
    console.log(`[Audit] ${new Date().toISOString()} | ${updateType} | ID: ${userId} (${firstName})`);

    // Proses pipeline middleware selanjutnya (handler album, start, dll)
    await next();

    // Deteksi Slow Response: menandai query database atau API yang lambat (> 2 detik)
    const duration = Date.now() - start;
    if (duration > 2000) {
        console.warn(`[Performance] Slow update ${updateType} for ${userId} took ${duration}ms! Check DB load.`);
    }
});

module.exports = bot;
