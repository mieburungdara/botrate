const { Markup } = require('telegraf');
const db = require('../config/db');

const rejectReasons = [
    'Konten tidak sesuai',
    'Kualitas rendah',
    'Duplikat',
    'Melanggar aturan',
    'Lainnya'
];

async function handleApprove(ctx) {
    const albumId = ctx.match[1];
    
    const [albums] = await db.execute('SELECT * FROM albums WHERE id = ?', [albumId]);
    if (albums.length === 0) {
        return ctx.answerCbQuery('Album tidak ditemukan', true);
    }
    
    const album = albums[0];
    if (album.status !== 'pending') {
        return ctx.answerCbQuery('Album sudah diproses', true);
    }

    // Update status album
    await db.execute(`
        UPDATE albums 
        SET status = 'approved', approved_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `, [albumId]);

    // Kirim ke channel publik
    const link = `https://t.me/${process.env.BOT_USERNAME.replace('@', '')}?start=${album.unique_token}`;
    
    await ctx.telegram.sendMessage(
        process.env.PUBLIC_CHANNEL_ID,
        `📢 Album Baru Tersedia!\n\n⭐ Rating: Belum ada rating\n📥 Jumlah unduhan: 0\n\nKlik link untuk mendapatkan album:\n${link}`,
        Markup.inlineKeyboard([
            Markup.button.url('📥 Dapatkan Album', link)
        ])
    );

    // Edit pesan moderator
    await ctx.editMessageReplyMarkup({
        inline_keyboard: [[Markup.button.callback('✅ Disetujui', 'noop')]]
    });

    // Kirim notifikasi ke pengirim
    await ctx.telegram.sendMessage(
        album.chat_id,
        '✅ Album Anda telah disetujui dan sudah dipublikasikan!'
    );

    await ctx.answerCbQuery('Album disetujui');
}

async function handleReject(ctx) {
    const albumId = ctx.match[1];
    
    const keyboard = Markup.inlineKeyboard(
        rejectReasons.map((reason, index) => [
            Markup.button.callback(reason, `reject_confirm_${albumId}_${index}`)
        ])
    );

    await ctx.editMessageReplyMarkup(keyboard.reply_markup);
    await ctx.answerCbQuery('Pilih alasan penolakan');
}

async function handleRejectConfirm(ctx) {
    const albumId = ctx.match[1];
    const reasonIndex = parseInt(ctx.match[2]);
    const reason = rejectReasons[reasonIndex];

    const [albums] = await db.execute('SELECT * FROM albums WHERE id = ?', [albumId]);
    if (albums.length === 0) {
        return ctx.answerCbQuery('Album tidak ditemukan', true);
    }
    
    const album = albums[0];
    if (album.status !== 'pending') {
        return ctx.answerCbQuery('Album sudah diproses', true);
    }

    // Update status album
    await db.execute(`
        UPDATE albums 
        SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP, reject_reason = ?
        WHERE id = ?
    `, [reason, albumId]);

    // Edit pesan moderator
    await ctx.editMessageReplyMarkup({
        inline_keyboard: [[Markup.button.callback(`❌ Ditolak: ${reason}`, 'noop')]]
    });

    // Kirim notifikasi ke pengirim
    await ctx.telegram.sendMessage(
        album.chat_id,
        `❌ Album Anda ditolak.\nAlasan: ${reason}`
    );

    await ctx.answerCbQuery('Album ditolak');
}

module.exports = { handleApprove, handleReject, handleRejectConfirm };
