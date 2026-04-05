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
    
    // Update status album secara atomik (hanya jika masih pending)
    const [result] = await db.execute(`
        UPDATE albums 
        SET status = 'approved', approved_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND status = 'pending'
    `, [albumId]);

    if (result.affectedRows === 0) {
        // Jika status sudah berubah, berarti admin lain baru saja menyetujui/menolak
        return ctx.answerCbQuery('Album sudah diproses sebelumnya', true);
    }

    // Ambil detail album untuk kebutuhan notifikasi & publikasi
    const [albumRows] = await db.execute('SELECT * FROM albums WHERE id = ?', [albumId]);
    const album = albumRows[0];

    // Kirim ke channel publik
    const link = `https://t.me/${process.env.BOT_USERNAME.replace('@', '')}?start=${album.unique_token}`;
    
    const publicMsg = await ctx.telegram.sendMessage(
        process.env.PUBLIC_CHANNEL_ID,
        `📢 Album Baru Tersedia!\n\n⭐ Rating: Belum ada rating\n📥 Jumlah unduhan: 0\n\nKlik link untuk mendapatkan album:\n${link}`,
        Markup.inlineKeyboard([
            Markup.button.url('📥 Dapatkan Album', link)
        ])
    );

    // Simpan ID pesan channel untuk update rating nantinya
    await db.execute(
        'UPDATE albums SET channel_message_id = ? WHERE id = ?',
        [publicMsg.message_id, albumId]
    );

    // Edit pesan moderator
    await ctx.editMessageReplyMarkup({
        inline_keyboard: [[Markup.button.callback('✅ Disetujui', 'noop')]]
    });

    // Kirim notifikasi ke pengirim (Gunakan try-catch agar tidak gagalkan moderasi jika user memblok bot)
    try {
        await ctx.telegram.sendMessage(
            album.chat_id,
            '✅ Album Anda telah disetujui dan sudah dipublikasikan!'
        );
    } catch (notifErr) {
        console.warn(`[Moderation] Gagal kirim notifikasi ke user ${album.user_id}:`, notifErr.message);
    }

    // Hapus media lama di channel moderator agar channel tetap bersih
    await cleanupModeratorMedia(ctx, album);

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

    // Update status album secara atomik
    const [result] = await db.execute(`
        UPDATE albums 
        SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP, reject_reason = ?
        WHERE id = ? AND status = 'pending'
    `, [reason, albumId]);

    if (result.affectedRows === 0) {
        return ctx.answerCbQuery('Album sudah diproses sebelumnya', true);
    }

    // Ambil detail album untuk kebutuhan notifikasi
    const [albumRows] = await db.execute('SELECT * FROM albums WHERE id = ?', [albumId]);
    const album = albumRows[0];

    // Edit pesan moderator
    await ctx.editMessageReplyMarkup({
        inline_keyboard: [[Markup.button.callback(`❌ Ditolak: ${reason}`, 'noop')]]
    });

    // Hapus media lama di channel moderator
    await cleanupModeratorMedia(ctx, album);

    // Kirim notifikasi ke pengirim
    try {
        await ctx.telegram.sendMessage(
            album.chat_id,
            `❌ Album Anda ditolak.\nAlasan: ${reason}`
        );
    } catch (notifErr) {
        console.warn(`[Moderation] Gagal kirim notifikasi Reject ke user ${album.user_id}:`, notifErr.message);
    }

    await ctx.answerCbQuery('Album ditolak');
}

/**
 * Fungsi pembantu untuk menghapus pesan media dari channel moderator
 */
async function cleanupModeratorMedia(ctx, album) {
    if (album && album.moderator_media_ids) {
        try {
            const mediaIds = JSON.parse(album.moderator_media_ids);
            if (Array.isArray(mediaIds) && mediaIds.length > 0) {
                // Gunakan deleteMessages (jamak) jika tersedia, atau loop deleteMessage
                for (const msgId of mediaIds) {
                    try {
                        await ctx.telegram.deleteMessage(process.env.MODERATOR_CHANNEL_ID, msgId);
                    } catch (e) { /* Abaikan jika sudah terhapus */ }
                }
            }
        } catch (err) {
            console.warn('[Moderation] Gagal parsing moderator_media_ids:', err.message);
        }
    }
}

module.exports = { handleApprove, handleReject, handleRejectConfirm };
