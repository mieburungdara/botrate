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

    // Deteksi duplikat berbasis CAPTION (Jika ada teksnya)
    if (caption) {
        try {
            const [rows] = await db.execute(`
                SELECT id FROM albums 
                WHERE user_id = ? AND caption = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
                LIMIT 1
            `, [userId, caption]);
            if (rows.length > 0) return; // Abaikan jika teksnya persis sama dalam 30 menit terakhir
        } catch (e) {
            console.error('[DuplicateCheck] Error:', e);
        }
    }

    if (!albumCache.has(mediaGroupId)) {
        albumCache.set(mediaGroupId, {
            user_id: userId,
            chat_id: chatId,
            message_ids: [],
            media_items: [],
            caption: caption,
            is_processed: false,
            timeout: setTimeout(async () => {
                await processAlbum(mediaGroupId, ctx);
            }, ALBUM_TIMEOUT)
        });
    }

    const album = albumCache.get(mediaGroupId);
    
    // Abaikan pesan jika album sedang/sudah diproses
    if (album.is_processed) return;
    
    // Batas 10 media per album (Limit API Telegram)
    if (album.message_ids.length >= 10) {
        // Jika ini media ke-11, beri peringatan satu kali
        if (album.message_ids.length === 10) {
            ctx.reply('⚠️ Maksimal 10 media per album. Media tambahan akan diabaikan.');
            // Tambah dummy agar tidak kirim reply berulang untuk pesan ke 12, 13 dst
            album.message_ids.push('LIMIT_EXCEEDED'); 
        }
        return;
    }

    album.message_ids.push(messageId);

    // Ambil file_id dan type untuk sendMediaGroup nantinya
    let type = '';
    let fileId = '';
    if (ctx.message.photo) {
        type = 'photo';
        fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    } else if (ctx.message.video) {
        type = 'video';
        fileId = ctx.message.video.file_id;
    } else if (ctx.message.document) {
        type = 'document';
        fileId = ctx.message.document.file_id;
    }

    if (type && fileId) {
        album.media_items.push({ type, media: fileId });
    }
    
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
    if (!album || album.is_processed) return;
    
    try {
        // Tandai sebagai sedang diproses
        album.is_processed = true;
        if (album.timeout) clearTimeout(album.timeout);

        // Hapus cache fisik setelah 30 detik (agar mediaGroupId tidak bisa dipakai lagi dalam waktu dekat)
        setTimeout(() => {
            albumCache.delete(mediaGroupId);
        }, 30000);

        const token = generateToken();
        
        // Simpan album ke database
        const [result] = await db.execute(`
            INSERT INTO albums (user_id, media_group_id, message_ids, media_items, chat_id, caption, unique_token)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            album.user_id, 
            mediaGroupId,
            JSON.stringify(album.message_ids), 
            JSON.stringify(album.media_items),
            album.chat_id, 
            album.caption, 
            token
        ]);

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

        // Sisipkan caption pada media pertama agar moderator bisa melihat langsung di album
        const mediaForModerator = [...album.media_items];
        if (album.caption) {
            mediaForModerator[0].caption = album.caption;
        }

        // Kirim Media Group ke channel moderator (ambil res untuk menyimpan IDs)
        const moderatorMediaMsgs = await ctx.telegram.sendMediaGroup(
            process.env.MODERATOR_CHANNEL_ID,
            mediaForModerator
        );
        const moderatorMediaIds = moderatorMediaMsgs.map(m => m.message_id);

        // Kirim Tombol Moderasi (Pesan Teks Terpisah - Opsi B)
        const keyboard = Markup.inlineKeyboard([
            Markup.button.callback('✅ Setuju', `approve_${result.insertId}`),
            Markup.button.callback('❌ Tolak', `reject_${result.insertId}`)
        ]);

        const moderatorMessage = await ctx.telegram.sendMessage(
            process.env.MODERATOR_CHANNEL_ID,
            `📥 Album baru dari: ${user.first_name} ${user.username ? `(@${user.username})` : ''}\nID: ${album.user_id}\n\n${album.caption}`,
            keyboard
        );

        // Simpan message_id moderator (teks & media ids)
        await db.execute(
            'UPDATE albums SET moderator_message_id = ?, moderator_media_ids = ? WHERE id = ?',
            [moderatorMessage.message_id, JSON.stringify(moderatorMediaIds), result.insertId]
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

    // Deteksi duplikat sederhana
    if (caption) {
        try {
            const [rows] = await db.execute(`
                SELECT id FROM albums 
                WHERE user_id = ? AND caption = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
                LIMIT 1
            `, [userId, caption]);
            if (rows.length > 0) {
                return ctx.reply('⚠️ Anda sudah mengirimkan media ini sebelumnya. Mohon tunggu proses moderasi.');
            }
        } catch (e) {
            console.error('[DuplicateCheck] Error:', e);
        }
    }

    try {
        const token = generateToken();
        
        // Tentukan tipe media
        let type = 'photo';
        let fileId = '';
        if (ctx.message.photo) {
            type = 'photo';
            fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        } else if (ctx.message.video) {
            type = 'video';
            fileId = ctx.message.video.file_id;
        } else if (ctx.message.document) {
            type = 'document';
            fileId = ctx.message.document.file_id;
        }

        const mediaItems = [{ type, media: fileId }];

        // Simpan media tunggal ke database
        const [result] = await db.execute(`
            INSERT INTO albums (user_id, media_group_id, message_ids, media_items, chat_id, caption, unique_token)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [userId, null, JSON.stringify([messageId]), JSON.stringify(mediaItems), chatId, caption, token]);

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
