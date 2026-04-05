const rateLimitCache = new Map();
const LIMIT_MS = 1000; // 1 detik interval minimal antar pesan
const MAX_MESSAGES_PER_MINUTE = 20;

/**
 * Middleware untuk mencegah spam/flooding dari user ke bot.
 */
const spamMiddleware = async (ctx, next) => {
    if (!ctx.from) return next();
    const userId = ctx.from.id;
    const now = Date.now();

    // Inisialisasi atau ambil data user dari cache
    if (!rateLimitCache.has(userId)) {
        rateLimitCache.set(userId, {
            lastMsgTime: 0,
            msgCount: 0,
            resetTime: now + 60000
        });
    }

    const userData = rateLimitCache.get(userId);

    // 1. Cek interval minimal (Anti-Rapid-Fire)
    if (now - userData.lastMsgTime < LIMIT_MS) {
        // Abaikan atau beri peringatan jika mau, tapi abaikan lebih hemat resource
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery('Mendingan santai aja ya, jangan diklik terus-terusan. 😊', { show_alert: true });
        }
        return;
    }

    // 2. Cek kuota per menit (Anti-Flooding)
    if (now > userData.resetTime) {
        userData.msgCount = 0;
        userData.resetTime = now + 60000;
    }

    userData.msgCount++;
    userData.lastMsgTime = now;

    if (userData.msgCount > MAX_MESSAGES_PER_MINUTE) {
        if (ctx.message) {
            await ctx.reply('⚠️ Anda terlalu cepat mengirim pesan. Silahkan coba lagi dalam satu menit.');
        }
        return;
    }

    return next();
};

// Pembersihan cache secara berkala setiap 10 menit untuk mencegah memory leak
setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of rateLimitCache.entries()) {
        if (now - data.lastMsgTime > 300000) { // Jika tidak aktif lebih dari 5 menit
            rateLimitCache.delete(userId);
        }
    }
}, 600000);

module.exports = { spamMiddleware };
