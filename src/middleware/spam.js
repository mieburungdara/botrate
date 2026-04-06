const rateLimitCache = new Map();
const LIMIT_MS = 1000; // 1 detik interval minimal (Anti-Rapid-Fire)
const MAX_MESSAGES_PER_MINUTE = 40; // Naikkan limit untuk mendukung album (Media Group)

// Validate ADMIN_USER_ID is set
if (!process.env.ADMIN_USER_ID) {
    throw new Error('ADMIN_USER_ID environment variable is required');
}

/**
 * Middleware untuk mencegah spam/flooding dari user ke bot.
 * Diperbarui untuk mendukung Album (Media Group) yang dikirim serentak.
 */
const spamMiddleware = async (ctx, next) => {
    if (!ctx.from) return next();
    
    // Abaikan pengecekan spam untuk admin utama
    if (ctx.from.id == process.env.ADMIN_USER_ID) return next();

    const userId = ctx.from.id;
    const now = Date.now();
    const isMediaGroup = !!ctx.message?.media_group_id;

    // Inisialisasi cache user jika belum ada
    if (!rateLimitCache.has(userId)) {
        rateLimitCache.set(userId, {
            lastMsgTime: 0,
            msgCount: 0,
            resetTime: now + 60000
        });
    }

    const userData = rateLimitCache.get(userId);

    // 1. CEK INTERVAL MINIMAL (Hanya untuk pesan tunggal & tombol)
    // Album dikirim secara simultan oleh Telegram, maka interval < 1s dianggap VALID untuk album
    if (!isMediaGroup && (now - userData.lastMsgTime < LIMIT_MS)) {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery('⚠️ Jangan diklik terlalu cepat. 😊', { show_alert: true });
        }
        return; // Hentikan pemrosesan
    }

    // 2. CEK KUOTA GLOBAL PER MENIT (Anti-Flooding)
    if (now > userData.resetTime) {
        userData.msgCount = 0;
        userData.resetTime = now + 60000;
    }

    userData.msgCount++;
    userData.lastMsgTime = now;

    if (userData.msgCount > MAX_MESSAGES_PER_MINUTE) {
        // Berikan peringatan hanya jika bukan bagian dari media group (agar tidak spam peringatan)
        if (ctx.message && !isMediaGroup) {
            await ctx.reply('⚠️ Anda terlalu cepat mengirim pesan. Silahkan tunggu sebentar (1 menit).');
        }
        return;
    }

    return next();
};

// Pembersihan cache secara berkala setiap 5 menit
setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of rateLimitCache.entries()) {
        if (now - data.lastMsgTime > 300000) {
            rateLimitCache.delete(userId);
        }
    }
}, 300000);

module.exports = { spamMiddleware };
