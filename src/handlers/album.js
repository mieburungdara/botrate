const { Markup } = require('telegraf');
const db = require('../config/db');
const { generateToken } = require('../helpers/token');

// Cache untuk menyimpan album yang sedang dikumpulkan
const albumCache = new Map();
const ALBUM_TIMEOUT = 5000; // 5 detik

async function handleAlbum(ctx) {
    const mediaGroupId = ctx.update.message.media_group_id;
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;
    const caption = ctx.message.caption || '';

    if (!albumCache.has(mediaGroupId)) {
        albumCache.set(mediaGroupId, {
            user_id: userId,
            chat_id: chatId,
            message_ids: [],
            caption: caption,
            timeout: setTimeout(async () => {
                await processAlbum(mediaGroupId, ctx);
            }, ALBUM_TIMEOUT)
        });
    }

    const album = albumCache.get(mediaGroupId);
    album.message_ids.push(messageId);
    
    if (caption && !album.caption) {
        album.caption = caption;
    }

    clearTimeout(album.timeout);
    album.timeout = setTimeout(async () => {
        await processAlbum(mediaGroupId, ctx);
    }, ALBUM_TIMEOUT);
}

async function processAlbum(mediaGroupId, ctx) {
    const album = albumCache.get(mediaGroupId);
    if (!album) return;
    
    albumCache.delete(mediaGroupId);
    clearTimeout(album.timeout);

    try {
        const token = generateToken();
        
        // Simpan album ke database
        const [result] = await db.execute(`
            INSERT INTO albums (user_id, message_ids, chat_id, caption, unique_token)
            VALUES (?, ?, ?, ?, ?)
        `, [album.user_id, JSON.stringify(album.message_ids), album.chat_id, album.caption, token]);

        // Update counter user
        await db.execute(
            'UPDATE users SET album_count = album_count + 1 WHERE user_id = ?',
            [album.user_id]
        );

        // Dapatkan info user
        const [userRows] = await db.execute(
            'SELECT username, first_name FROM users WHERE user_id = ?',
            [album.user_id]
        );
        const user = userRows[0];

        // Kirim ke channel moderator
        const keyboard = Markup.inlineKeyboard([
            Markup.button.callback('✅ Setuju', `approve_${result.insertId}`),
            Markup.button.callback('❌ Tolak', `reject_${result.insertId}`)
        ]);

        const moderatorMessage = await ctx.telegram.copyMessages(
            process.env.MODERATOR_CHANNEL_ID,
            album.chat_id,
            album.message_ids,
            {
                caption: `📥 Album baru dari: ${user.first_name} ${user.username ? `(@${user.username})` : ''}\nID: ${album.user_id}\n\n${album.caption}`,
                reply_markup: keyboard.reply_markup
            }
        );

        // Simpan message_id moderator
        await db.execute(
            'UPDATE albums SET moderator_message_id = ? WHERE id = ?',
            [moderatorMessage.message_id, result.insertId]
        );

        await ctx.reply('✅ Album telah dikirim untuk moderasi. Anda akan mendapatkan notifikasi ketika album disetujui atau ditolak.');

    } catch (error) {
        console.error('Process album error:', error);
        await ctx.reply('❌ Terjadi kesalahan saat memproses album. Silahkan coba lagi nanti.');
    }
}

async function handleSingleMedia(ctx) {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;
    const caption = ctx.message.caption || '';

    try {
        const token = generateToken();
        
        // Simpan media tunggal ke database
        const [result] = await db.execute(`
            INSERT INTO albums (user_id, message_ids, chat_id, caption, unique_token)
            VALUES (?, ?, ?, ?, ?)
        `, [userId, JSON.stringify([messageId]), chatId, caption, token]);

        // Update counter user
        await db.execute(
            'UPDATE users SET album_count = album_count + 1 WHERE user_id = ?',
            [userId]
        );

        // Dapatkan info user
        const [userRows] = await db.execute(
            'SELECT username, first_name FROM users WHERE user_id = ?',
            [userId]
        );
        const user = userRows[0];

        // Kirim ke channel moderator
        const keyboard = Markup.inlineKeyboard([
            Markup.button.callback('✅ Setuju', `approve_${result.insertId}`),
            Markup.button.callback('❌ Tolak', `reject_${result.insertId}`)
        ]);

        const moderatorMessage = await ctx.telegram.copyMessage(
            process.env.MODERATOR_CHANNEL_ID,
            chatId,
            messageId,
            {
                caption: `📥 Media baru dari: ${user.first_name} ${user.username ? `(@${user.username})` : ''}\nID: ${userId}\n\n${caption}`,
                reply_markup: keyboard.reply_markup
            }
        );

        // Simpan message_id moderator
        await db.execute(
            'UPDATE albums SET moderator_message_id = ? WHERE id = ?',
            [moderatorMessage.message_id, result.insertId]
        );

        await ctx.reply('✅ Media telah dikirim untuk moderasi. Anda akan mendapatkan notifikasi ketika disetujui atau ditolak.');

    } catch (error) {
        console.error('Process single media error:', error);
        await ctx.reply('❌ Terjadi kesalahan saat memproses media. Silahkan coba lagi nanti.');
    }
}

module.exports = { handleAlbum, handleSingleMedia };
