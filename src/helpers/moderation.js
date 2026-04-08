const { Markup } = require('telegraf');
const db = require('../config/db');
const bot = require('../config/bot');

/**
 * Mengirimkan album/media ke channel moderasi
 * @param {number} albumId - ID album di database
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function submitToModeration(albumId) {
    // Mulai koneksi dari pool untuk transaksi
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute('SELECT * FROM albums WHERE id = ? FOR UPDATE', [albumId]);
        if (rows.length === 0) {
            await connection.rollback();
            return { success: false, error: 'Media tidak ditemukan' };
        }

        const album = rows[0];
        if (album.is_submitted) {
            await connection.rollback();
            return { success: false, error: 'Media sudah dikirim ke moderasi' };
        }
        
        if (!album.caption) {
            await connection.rollback();
            return { success: false, error: 'Media harus memiliki caption sebelum dikirim ke moderasi' };
        }

        const [userRows] = await connection.execute('SELECT username, first_name FROM users WHERE user_id = ?', [album.user_id]);
        if (userRows.length === 0) {
            await connection.rollback();
            return { success: false, error: 'User tidak ditemukan' };
        }
        const user = userRows[0];

        // Validasi JSON Data
        let mediaItems = [];
        let messageIds = [];
        try {
            mediaItems = JSON.parse(album.media_items || '[]');
            messageIds = JSON.parse(album.message_ids || '[]');
        } catch (e) {
            await connection.rollback();
            return { success: false, error: 'Format data media tidak valid' };
        }

        let moderatorMessageId;
        let moderatorMediaIds = [];

        const moderatorCaption = `📥 <b>Media Baru untuk Moderasi</b>\n\n` +
            `👤 <b>Dari:</b> ${user.first_name} ${user.username ? `(@${user.username})` : ''}\n` +
            `🆔 <b>User ID:</b> <code>${album.user_id}</code>\n` +
            `📝 <b>Caption:</b>\n${album.caption}`;

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Setuju', `approve_${albumId}`),
                Markup.button.callback('❌ Tolak', `reject_${albumId}`)
            ]
        ]);

        if (mediaItems.length > 1) {
            // --- CASE: ALBUM (Multi Media) ---
            // Gunakan deep copy agar data asli tidak termanipulasi
            const mediaForModerator = mediaItems.map((item, index) => ({
                ...item,
                caption: index === 0 ? moderatorCaption : undefined,
                parse_mode: index === 0 ? 'HTML' : undefined
            }));

            const moderatorMediaMsgs = await bot.telegram.sendMediaGroup(
                process.env.MODERATOR_CHANNEL_ID,
                mediaForModerator
            );
            moderatorMediaIds = moderatorMediaMsgs.map(m => m.message_id);

            const moderatorMessage = await bot.telegram.sendMessage(
                process.env.MODERATOR_CHANNEL_ID,
                `⬆️ <i>Media di atas dikirim oleh user ID ${album.user_id}</i>`,
                { 
                    parse_mode: 'HTML',
                    reply_markup: keyboard.reply_markup 
                }
            );
            moderatorMessageId = moderatorMessage.message_id;
        } else {
            // --- CASE: MEDIA TUNGGAL ---
            if (messageIds.length === 0) {
                await connection.rollback();
                return { success: false, error: 'ID Pesan dasar tidak ditemukan' };
            }

            const moderatorMessage = await bot.telegram.copyMessage(
                process.env.MODERATOR_CHANNEL_ID,
                album.chat_id,
                messageIds[0],
                {
                    caption: moderatorCaption,
                    parse_mode: 'HTML',
                    reply_markup: keyboard.reply_markup
                }
            );
            moderatorMessageId = moderatorMessage.message_id;
        }

        // 1. TANDAI SEBAGAI PROSES KIRIM SECARA ATOMIK (Fix Bug 92)
        // Gunakan kondisi 'is_submitted = 0' untuk mencegah race condition (dobel klik)
        const [lockResult] = await connection.execute(
            "UPDATE albums SET is_submitted = 1 WHERE id = ? AND is_submitted = 0 AND status = 'draft'",
            [albumId]
        );

        if (lockResult.affectedRows === 0) {
            await connection.rollback();
            return { success: false, error: 'Media ini sudah dikirim atau sedang dalam proses.' };
        }

        // UPDATE FINAL (Simpan ID pesan moderator yang asli)
        await connection.execute(
            'UPDATE albums SET moderator_message_id = ?, moderator_media_ids = ? WHERE id = ?',
            [moderatorMessageId, JSON.stringify(moderatorMediaIds), albumId]
        );

        await connection.commit();
        return { success: true };

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('[SubmitToModeration] Error:', error);
        return { success: false, error: 'Gagal sistem: ' + (error.message || 'Unknown Error') };
    } finally {
        if (connection) connection.release();
    }
}

module.exports = { submitToModeration };
