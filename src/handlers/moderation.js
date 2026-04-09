const { Markup } = require('telegraf');
const db = require('../config/db');
const { AlbumStatus } = require('../constants/status');

const rejectReasons = [
    'Konten tidak sesuai',
    'Kualitas rendah',
    'Duplikat',
    'Melanggar aturan',
    'Lainnya'
];

async function handleApprove(ctx) {
    const albumId = ctx.match[1];
    
    // Update status media secara atomik (hanya jika sudah dikirim & masih pending)
    const [result] = await db.execute(`
        UPDATE albums 
        SET status = ?, approved_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND status = ?
    `, [AlbumStatus.APPROVED, albumId, AlbumStatus.PENDING]);

    if (result.affectedRows === 0) {
        return ctx.answerCbQuery('Media sudah diproses atau belum dikirim secara resmi', true);
    }

    // Ambil detail media
    const [albumRows] = await db.execute('SELECT * FROM albums WHERE id = ?', [albumId]);
    const album = albumRows[0];

    // Kirim ke channel publik (Gunakan username bot dinamis jika tersedia)
    const botUsername = (ctx.botInfo?.username || process.env.BOT_USERNAME || '').replace('@', '') || 'unknown_bot';
    const link = `https://t.me/${botUsername}?start=${album.unique_token}`;
    
    const publicMsg = await ctx.telegram.sendMessage(
        process.env.PUBLIC_CHANNEL_ID,
        `📢 Media Baru Tersedia!\n\n⭐ Rating: Belum ada rating\n📥 Jumlah unduhan: 0\n\nKlik link untuk mendapatkan media:\n${link}`,
        Markup.inlineKeyboard([
            Markup.button.url('📥 Dapatkan Media', link)
        ])
    );

    // Simpan ID pesan channel
    await db.execute(
        'UPDATE albums SET channel_message_id = ? WHERE id = ?',
        [publicMsg.message_id, albumId]
    );

    // Edit pesan moderator
    await ctx.editMessageReplyMarkup({
        inline_keyboard: [[Markup.button.callback('✅ Disetujui', 'noop')]]
    });

    // Kirim notifikasi ke pengirim
    try {
        await ctx.telegram.sendMessage(
            album.chat_id,
            '✅ Media Anda telah disetujui dan sudah dipublikasikan!'
        );
    } catch (notifErr) {
        console.warn(`[Moderation:Approve] Gagal kirim notifikasi ke user (User mungkin memblokir bot). UserID: ${album.user_id}, AlbumID: ${albumId}`);
    }

    // Hapus media & pesan moderasi agar channel bersih
    await cleanupModeratorMedia(ctx, album);

    await ctx.answerCbQuery('Media disetujui');
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

    // Update status media
    const [result] = await db.execute(`
        UPDATE albums 
        SET status = ?, rejected_at = CURRENT_TIMESTAMP, reject_reason = ?
        WHERE id = ? AND status = ?
    `, [AlbumStatus.REJECTED, reason, albumId, AlbumStatus.PENDING]);

    if (result.affectedRows === 0) {
        return ctx.answerCbQuery('Media sudah diproses atau belum dikirim secara resmi', true);
    }

    const [albumRows] = await db.execute('SELECT * FROM albums WHERE id = ?', [albumId]);
    const album = albumRows[0];

    // Edit pesan moderator
    await ctx.editMessageReplyMarkup({
        inline_keyboard: [[Markup.button.callback(`❌ Ditolak: ${reason}`, 'noop')]]
    });

    // Hapus media & pesan moderasi
    await cleanupModeratorMedia(ctx, album);

    // Kirim notifikasi ke pengirim
    try {
        await ctx.telegram.sendMessage(
            album.chat_id,
            `❌ Media Anda ditolak.\nAlasan: ${reason}`
        );
    } catch (notifErr) {
        console.warn(`[Moderation:Reject] Gagal kirim notifikasi ke user (User mungkin memblokir bot). UserID: ${album.user_id}, AlbumID: ${albumId}`);
    }

    await ctx.answerCbQuery('Media ditolak');
}

async function cleanupModeratorMedia(ctx, album) {
    const channelId = process.env.MODERATOR_CHANNEL_ID;
    
    // Kita sengaja TIDAK menghapus 'moderator_message_id' agar sisa jejak audit 
    // status (Disetujui/Ditolak) tetap ada di channel moderasi.
    
    // Hapus hanya media group (media berat) secara paralel (Fix Bug 54)
    if (album.moderator_media_ids) {
        try {
            const mediaIds = JSON.parse(album.moderator_media_ids);
            if (Array.isArray(mediaIds) && mediaIds.length > 0) {
                // Gunakan Promise.allSettled agar penghapusan cepat & tidak terhenti jika ada error
                await Promise.allSettled(
                    mediaIds.map(msgId => ctx.telegram.deleteMessage(channelId, msgId))
                );
            }
        } catch (err) {
            console.error('[CleanupModerator] Error:', err.message);
        }
    }
}

module.exports = { handleApprove, handleReject, handleRejectConfirm };
