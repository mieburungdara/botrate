const db = require('../config/db');

/**
 * Middleware untuk memblokir user yang masuk dalam daftar hitam (blacklist).
 * Berfungsi mencegah user bermasalah untuk mengirim pesan atau berinteraksi dengan bot.
 * 
 * @param {object} ctx - Telegraf context object.
 * @param {function} next - Next middleware function.
 * @returns {Promise<void>}
 */
async function blacklistMiddleware(ctx, next) {
    const userId = ctx.from?.id;
    if (!userId) return next();

    // PROTEKSI: Admin kebal terhadap sistem blacklist untuk mencegah bot terkunci
    if (userId == process.env.TELEGRAM_ADMIN_USER_ID) {
        return next();
    }

    try {
        // Cek ID user di tabel blacklist
        const [rows] = await db.execute('SELECT id, reason FROM blacklist WHERE user_id = ?', [userId]);
        
        if (rows.length > 0) {
            const reason = rows[0].reason || 'Tidak disebutkan.';
            console.log(`[Blacklist] Blocked interaction from user ${userId}. Reason: ${reason}`);
            
            // Berikan notifikasi hanya jika ini adalah pesan baru (bukan callback)
            if (ctx.message) {
                await ctx.reply(`🚫 **Akses Ditolak**\n\nAkun Anda telah masuk dalam daftar blokir sistem.\nAlasan: ${reason}\n\nHubungi admin jika Anda merasa ini adalah kesalahan.`);
            } else if (ctx.callbackQuery) {
                await ctx.answerCbQuery('Akun Anda diblokir.', { show_alert: true });
            }
            return; // Hentikan eksekusi handler selanjutnya
        }
    } catch (error) {
        console.error('Blacklist middleware database error:', error);
        // Tetap lanjut jika database error demi ketersediaan layananbot
        return next();
    }

    return next();
}

module.exports = { blacklistMiddleware };
